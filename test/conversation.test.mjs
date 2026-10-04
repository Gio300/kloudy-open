import test from 'node:test';
import assert from 'node:assert/strict';
import {conversationParams,conversationResult,conversationText} from '../src/conversation.mjs';
import {HttpkClient} from '../src/httpk.mjs';
import {adaptMcp} from '../src/hosted.mjs';
import {createServer} from 'node:http';
import {spawn} from 'node:child_process';
import {mkdtemp,writeFile,readFile,readdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createMcpServer} from '../src/mcp.mjs';
import {InMemoryTransport} from '@modelcontextprotocol/sdk/inMemory.js';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
const key={project:'demo',conversation_id:'main'};
const append={...key,idempotency_key:'exchange-1',expected_revision:0,title:'Demo',user:'Build a card',assistant:'Card built.',decisions:[],built_artifacts:['src/card.mjs']};
const view={...key,revision:1,condensed_revision:0,pending_exchanges:1,deck:null,raw_transcript_returned:false,minimum_gate_met:false,storage:'engine_encrypted',compute:'engine_host',display:{title:'Conversation context',text:'Waiting for the minimum gate.',render_as:'plain_text'}};
test('conversation request enforces exact ownership namespace, revision and engine size limits',()=>{
 assert.deepEqual(conversationParams('read',key),key);assert.deepEqual(conversationParams('append',append),append);
 for(const bad of [{...append,expected_revision:-1},{...append,expected_revision:'0'},{...append,project:'../other'},{...append,user:' '},{...append,user:'x'.repeat(1501)},{...append,decisions:Array(5).fill('yes')},{...append,owner:'another-user'},{...append,user:'漢'.repeat(1500)}])assert.throws(()=>conversationParams('append',bad));
 assert.throws(()=>conversationParams('sync',{...key,expected_revision:1,idempotency_key:'checkpoint',reason:'force-delete'}));
});
test('metadata-only replay never claims a fresh context or grants permission',()=>{
 const replay={...key,revision:1,condensed_revision:0,pending_exchanges:1,replayed:true};
 const result=conversationResult(replay,append,'append');assert.equal(result.context_available,false);assert.match(conversationText(result),/Read the current/);assert.throws(()=>conversationResult(replay,key));
});
test('cross-project, transcript, executable display, malformed and permission-bearing decks rejected',()=>{
 for(const bad of [{...view,project:'other'},{...view,raw_transcript_returned:true},{...view,condensed_revision:2},{...view,display:{...view.display,render_as:'html'}},{...view,deck:{trusted_for_authorization:true}}])assert.throws(()=>conversationResult(bad,key));
 assert.equal(conversationResult({...view,access_token:'must-not-leak'},key).access_token,undefined);
});
test('cards remain bounded plain-text context, not executable markup or authorization',()=>{
 const deck={version:'sdf.conversation/1',lossy:true,method:'bounded_extractive',trusted_for_authorization:false,through_revision:20,cards:[{type:'subject',title:'Demo',project:'demo'},{type:'context',user_main_points:['<img onerror=evil()>'],assistant_main_points:['A card'],decisions:[],built_artifacts:['src/card.mjs']}]};
 const result=conversationResult({...view,revision:20,condensed_revision:20,pending_exchanges:0,deck},key);
 assert.equal(result.deck.trusted_for_authorization,false);assert.match(conversationText(result),/never authorization/);assert.equal(result.deck.cards[1].user_main_points[0],'<img onerror=evil()>');
});
test('HTTPK performs one authenticated request, leaves no transcript in session state and never retries conflicts',async()=>{
 const calls=[],state={sessionId:'session',interactionMode:'autonomous'};
 const client=new HttpkClient({endpoint:'https://example.com/mcp',token:'test-only',state,fetcher:async(url,options)=>{calls.push(JSON.parse(options.body));assert.equal(options.headers.authorization,'Bearer test-only');return Response.json({result:view});}});
 await client.conversation('read',key);assert.equal(calls[0].method,'kloudy/conversation/read');assert.deepEqual(state,{sessionId:'session',interactionMode:'autonomous'});
 client.fetcher=async()=>{calls.push('conflict');return Response.json({error:{code:'revision_conflict'}},{status:409});};
 await assert.rejects(client.conversation('append',append),/No retry/);assert.equal(calls.length,2);
 await assert.rejects(client.conversation('append',{...append,expected_revision:-1}));assert.equal(calls.length,2);
});
test('hosted MCP maps conversation to existing method and validates its returned context',()=>{
 const message={jsonrpc:'2.0',id:1,method:'tools/call',params:{name:'kloudy',arguments:{operation:'conversation',conversation_operation:'read',conversation:key}}};
 const adapter=adaptMcp(message);assert.equal(adapter.upstream.method,'kloudy/conversation/read');assert.deepEqual(adapter.upstream.params,key);assert.equal(adapter.project(view).structuredContent.raw_transcript_returned,false);
 assert.throws(()=>adapter.project({...view,project:'someone-else'}));
});
test('CLI crosses a real HTTP boundary, stores only session metadata and returns exit codes',async()=>{
 const calls=[],secret='synthetic-conversation-test-only';
 const server=createServer(async(req,res)=>{
  let body='';for await(const chunk of req)body+=chunk;
  const message=JSON.parse(body);calls.push(message);
  assert.equal(req.headers.authorization,'Bearer '+secret);
  res.setHeader('content-type','application/json');
  const result=message.method==='initialize'?{session_id:'test-session',interaction_mode:'autonomous'}:view;
  res.end(JSON.stringify({jsonrpc:'2.0',id:message.id,result}));
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const dir=await mkdtemp(join(tmpdir(),'kloudy-conversation-test-'));
 const file=join(dir,'connection.json'),input=join(dir,'request.json');
 await writeFile(file,JSON.stringify({endpoint:`http://127.0.0.1:${server.address().port}/mcp`,access_token:secret}),{mode:0o600});
 await writeFile(input,JSON.stringify(key));
 const run=()=>new Promise(resolve=>{let stdout='',stderr='';const child=spawn(process.execPath,['bin/entry.mjs','legacy','conversation','read','--inputs',input,'--connection',file],{stdio:['ignore','pipe','pipe'],windowsHide:true});child.stdout.on('data',x=>stdout+=x);child.stderr.on('data',x=>stderr+=x);child.on('close',code=>resolve({code,stdout,stderr}));});
 try{
  const good=await run();assert.equal(good.code,0);assert.equal(JSON.parse(good.stdout).project,'demo');assert.ok(!good.stdout.includes(secret));assert.ok(!good.stderr.includes(secret));
  assert.deepEqual(calls.map(x=>x.method),['initialize','kloudy/conversation/read']);
  const saved=(await readdir(dir)).find(name=>name.startsWith('kloudy-open-session-')&&name.endsWith('.json'));
  const state=JSON.parse(await readFile(join(dir,saved),'utf8'));assert.equal(state.sessionId,'test-session');assert.equal(state.deck,undefined);assert.equal(state.user,undefined);
  await writeFile(input,JSON.stringify({...key,owner:'other'}));const bad=await run();assert.equal(bad.code,1);assert.equal(calls.length,2);
 }finally{await new Promise(resolve=>server.close(resolve));}
});
test('local MCP invokes the same scoped conversation client through one advertised tool',async()=>{
 const requests=[],engine=new HttpkClient({endpoint:'https://example.com/mcp',token:'synthetic',state:{sessionId:'session',interactionMode:'autonomous'},fetcher:async(_,options)=>{requests.push(JSON.parse(options.body));return Response.json({result:view});}});
 const server=createMcpServer({useClient:fn=>fn(engine)}),client=new Client({name:'conversation-test',version:'1'}),[a,b]=InMemoryTransport.createLinkedPair();
 try{await server.connect(a);await client.connect(b);assert.equal((await client.listTools()).tools.length,1);const result=await client.callTool({name:'kloudy',arguments:{operation:'conversation',conversation_operation:'read',conversation:key}});assert.equal(result.structuredContent.raw_transcript_returned,false);assert.equal(requests[0].method,'kloudy/conversation/read');}finally{await client.close();await server.close();}
});
