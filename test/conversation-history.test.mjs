import test from 'node:test';
import assert from 'node:assert/strict';
import {conversationParams,conversationResult,conversationText} from '../src/conversation.mjs';
import {HttpkClient} from '../src/httpk.mjs';
import {adaptMcp,hostedDoor} from '../src/hosted.mjs';
import {createMcpServer} from '../src/mcp.mjs';
import {InMemoryTransport} from '@modelcontextprotocol/sdk/inMemory.js';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
const key={project:'demo',conversation_id:'main'};
const read={...key,after_sequence:0,limit:2};
const configure={...key,expected_revision:0,enabled:true};
const exchange={user:'Exact user text 😀\nline two',assistant:'<script>untrusted original</script>',decisions:[],built_artifacts:['src/example.mjs']};
const page={version:'conversation.history/1',storage:'engine_encrypted',policy_revision:1,enabled:true,
 exchanges:[{sequence:1,exchange},{sequence:2,exchange}],archived_through_sequence:20,next_after_sequence:2,
 gap_before_page:false,permission_granted:false,trusted_for_authorization:false,remote_storage_connected:false};
const policy={policy_revision:1,enabled:true,storage:'engine_encrypted',deleted_records:0,remote_storage_connected:false};
const pointer={storage:'engine_encrypted',first_sequence:1,last_sequence:20,raw_sha256:'a'.repeat(64),read_method:'kloudy/conversation/history/read',required_scope:'conversation:history'};
const view={...key,revision:20,condensed_revision:20,pending_exchanges:0,raw_transcript_returned:false,minimum_gate_met:true,storage:'engine_encrypted',compute:'engine_host',display:{title:'Saved',text:'Summary only',render_as:'plain_text'},
 deck:{version:'sdf.conversation/1',lossy:true,method:'bounded_extractive',trusted_for_authorization:false,through_revision:20,source_history:pointer,cards:[{type:'subject',project:'demo',title:'Example'},{type:'context',user_main_points:['summary'],assistant_main_points:[],decisions:[],built_artifacts:[]}]}};

test('history requests accept exact existing engine contract only',()=>{
 assert.deepEqual(conversationParams('history/read',read),read);
 assert.deepEqual(conversationParams('history/configure',configure),configure);
 for(const input of [{...read,limit:21},{...read,limit:0},{...read,after_sequence:-1},{...read,after_sequence:2**53},{...read,owner:'other'},{...read,project:'../other'}])assert.throws(()=>conversationParams('history/read',input));
 for(const input of [{...configure,enabled:'true'},{...configure,expected_revision:-1},{...configure,expected_revision:Number.MAX_SAFE_INTEGER},{...configure,delete_originals:true}])assert.throws(()=>conversationParams('history/configure',input));
});

test('summary retains bounded archive reference without returning originals or extra fields',()=>{
 const result=conversationResult({...view,deck:{...view.deck,source_history:{...pointer,access_token:'discard',raw:'discard'}}},key);
 assert.deepEqual(result.deck.source_history,pointer);
 assert.equal(result.raw_transcript_returned,false);
 for(const patch of [{first_sequence:0},{last_sequence:21},{required_scope:'conversation:sync'},{read_method:'https://evil.test/'},{raw_sha256:'bad'},{storage:'unknown'}])assert.throws(()=>conversationResult({...view,deck:{...view.deck,source_history:{...pointer,...patch}}},key));
});

test('bounded pages preserve exact original text and never confer execution authority',()=>{
 const result=conversationResult({...page,access_token:'discard',exchanges:page.exchanges.map(r=>({...r,secret:'discard',exchange:{...r.exchange,secret:'discard'}}))},read,'history/read');
 assert.deepEqual(result,page);
 assert.equal(result.exchanges[0].exchange.user,exchange.user);
 assert.equal(result.exchanges[0].exchange.assistant,exchange.assistant);
 assert.match(conversationText(result),/never authorization/);
 assert.match(conversationText(result),/More history/);
 assert.throws(()=>conversationResult({...page,permission_granted:true},read,'history/read'));
 assert.throws(()=>conversationResult({...page,trusted_for_authorization:true},read,'history/read'));
 assert.throws(()=>conversationResult({...page,remote_storage_connected:true},read,'history/read'));
});

test('malformed, repeated, skipped-within-chunk, oversized and stalled pages are rejected',()=>{
 for(const patch of [{exchanges:[page.exchanges[0],page.exchanges[0]]},{exchanges:[page.exchanges[1],page.exchanges[0]]},
  {exchanges:[page.exchanges[0],{sequence:3,exchange}]},{exchanges:Array(3).fill(page.exchanges[0])},
  {next_after_sequence:0},{next_after_sequence:null},{gap_before_page:true},{archived_through_sequence:1},
  {exchanges:[],next_after_sequence:null},{exchanges:[{sequence:1,exchange:{...exchange,user:'x'.repeat(1501)}}]}]){
  assert.throws(()=>conversationResult({...page,...patch},read,'history/read'));
 }
});

test('late opt-in gaps and terminal or empty pages remain explicit',()=>{
 const gap={...page,exchanges:[{sequence:21,exchange}],archived_through_sequence:21,next_after_sequence:null,gap_before_page:true};
 assert.match(conversationText(conversationResult(gap,read,'history/read')),/Earlier exact exchanges are missing/);
 const end={...page,exchanges:[{sequence:20,exchange}],next_after_sequence:null};
 assert.equal(conversationResult(end,{...read,after_sequence:19},'history/read').next_after_sequence,null);
 const empty={...page,exchanges:[],next_after_sequence:null};
 assert.deepEqual(conversationResult(empty,{...read,after_sequence:20},'history/read'),empty);
});

test('policy change must match the chosen revision and retention; pausing never claims deletion',()=>{
 assert.deepEqual(conversationResult(policy,configure,'history/configure'),policy);
 for(const patch of [{enabled:false},{policy_revision:3},{deleted_records:20},{remote_storage_connected:true}])assert.throws(()=>conversationResult({...policy,...patch},configure,'history/configure'));
 const paused=conversationResult({...policy,policy_revision:2,enabled:false},{...configure,expected_revision:1,enabled:false},'history/configure');
 assert.match(conversationText(paused),/paused.*No archived records were deleted/);
});

test('SDK calls engine once, stores no original text and does not retry rejected scope or conflicts',async()=>{
 const calls=[],state={sessionId:'s',interactionMode:'autonomous'};
 const client=new HttpkClient({endpoint:'https://engine.example/mcp',token:'test-only',state,fetcher:async(_,options)=>{
  calls.push(JSON.parse(options.body));assert.equal(options.headers.authorization,'Bearer test-only');
  return Response.json({result:page});
 }});
 assert.deepEqual(await client.conversation('history/read',read),page);
 assert.equal(calls[0].method,'kloudy/conversation/history/read');
 assert.deepEqual(state,{sessionId:'s',interactionMode:'autonomous'});
 client.fetcher=async()=>{calls.push('denied');return Response.json({error:{code:'forbidden'}},{status:403});};
 await assert.rejects(client.conversation('history/read',read),/No retry/);
 assert.equal(calls.length,2);
 await assert.rejects(client.conversation('history/configure',{...configure,enabled:'yes'}));
 assert.equal(calls.length,2);
});

test('hosted and local MCP expose the same explicit archive operations',async()=>{
 assert.ok(hostedDoor.inputSchema.properties.conversation_operation.enum.includes('history/read'));
 const args={operation:'conversation',conversation_operation:'history/read',conversation:read};
 const adapter=adaptMcp({jsonrpc:'2.0',id:1,method:'tools/call',params:{name:'kloudy',arguments:args}});
 assert.equal(adapter.upstream.method,'kloudy/conversation/history/read');
 assert.deepEqual(adapter.project(page).structuredContent,page);
 const engine=new HttpkClient({endpoint:'https://engine.example/mcp',token:'test-only',state:{sessionId:'s',interactionMode:'autonomous'},fetcher:async()=>Response.json({result:page})});
 const server=createMcpServer({useClient:fn=>fn(engine)}),client=new Client({name:'history-test',version:'1'}),[a,b]=InMemoryTransport.createLinkedPair();
 try{
  await server.connect(a);await client.connect(b);
  assert.ok((await client.listTools()).tools[0].inputSchema.properties.conversation_operation.enum.includes('history/configure'));
  assert.deepEqual((await client.callTool({name:'kloudy',arguments:args})).structuredContent,page);
 }finally{await client.close();await server.close();}
});
