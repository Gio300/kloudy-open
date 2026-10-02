import test from 'node:test';
import assert from 'node:assert/strict';
import {HttpkClient} from '../src/httpk.mjs';
import {adaptMcp} from '../src/hosted.mjs';

test('assembly forwards only explicit IDs, preserves arguments, and never calls a tool',async()=>{
 const ids=['first-read','first-write','second-write'],seen=[];
 const selections=ids.map((id,i)=>({selection_id:id,arguments:{text:`value ${i}`},state:'ready'}));
 const tools=[{name:'bbe_notes_read',inputSchema:{type:'object'}},{name:'bbe_notes_create',inputSchema:{type:'object'}}];
 const fetcher=async(_,options)=>{const body=JSON.parse(options.body);seen.push(body);return Response.json({jsonrpc:'2.0',id:body.id,result:body.method==='tools/list'?{tools,_meta:{selections}}:{structuredContent:{state:'completed'}}});};
 const client=new HttpkClient({endpoint:'https://kloudy.ai/mcp',token:'test-only',state:{sessionId:'owned',interactionMode:'autonomous'},fetcher});
 const result=await client.assemble(ids);assert.deepEqual(result.selections,selections);assert.equal(result.toolbox.tools.length,2);assert.deepEqual(seen.map(x=>x.method),['tools/list']);assert.deepEqual(seen[0].params,{_meta:{selection_ids:ids}});
 await client.call('bbe_notes_read',{id:'one-note'},{selectionId:ids[0]});assert.deepEqual(seen[1].params,{name:'bbe_notes_read',arguments:{id:'one-note'},_meta:{selection_id:ids[0]}});assert.equal(seen.length,2);
 for(const bad of [[],['same','same'],Array.from({length:17},(_,i)=>String(i)),[null]])await assert.rejects(()=>client.assemble(bad),/distinct selection/);
 assert.equal(seen.length,2);
});

test('one hosted MCP door exposes assembly without forwarding a whole server list',()=>{
 const message={jsonrpc:'2.0',id:3,method:'tools/call',params:{name:'kloudy',arguments:{operation:'assemble',selection_ids:['a','b']}}};
 const {upstream,project}=adaptMcp(message);assert.equal(upstream.method,'tools/list');assert.deepEqual(upstream.params,{_meta:{selection_ids:['a','b']}});
 const result={tools:[{name:'read'}],_meta:{selections:[{selection_id:'a'},{selection_id:'b'}]}};assert.deepEqual(project(result).structuredContent,result);
 assert.equal(adaptMcp({method:'tools/list'}).project({tools:[{name:'unrelated'}]}).tools.length,1);
 assert.deepEqual(adaptMcp({method:'tools/list',params:{_meta:{selection_ids:['a','b']}}}).project(result),result);
 assert.throws(()=>adaptMcp({...message,params:{name:'kloudy',arguments:{operation:'assemble',selection_ids:['a','a']}}}),/invalid_selection/);
});
test('hosted adapter carries exact selections and engine greeting without adding execution',()=>{
 const request={jsonrpc:'2.0',id:1,method:'tools/call',params:{name:'kloudy',arguments:{operation:'introduce',project_context:{languages:['python'],manifests:['pyproject.toml']}}}};
 const {upstream,project}=adaptMcp(request);assert.equal(upstream.method,'kloudy/intent');assert.equal(upstream.params.input.text,'Kloudy');assert.deepEqual(upstream.params.input.project_context,request.params.arguments.project_context);assert.equal(project({state:'greeting'}).structuredContent.state,'greeting');
});
test('HTTPK client keeps one selection and checks receipt after an uncertain call without retrying it',async()=>{
 let calls=0;const state={},received=[];
 const fetcher=async(_,options)=>{const body=JSON.parse(options.body);received.push(body);let result;
 if(body.method==='initialize')result={session_id:'a'.repeat(32),interaction_mode:'autonomous'};
 else if(body.method==='kloudy/intent')result={selection_id:'b'.repeat(32),tools:[{name:'bbe_notes_create',inputSchema:{type:'object',properties:{text:{type:'string'}}}}],arguments:{text:'test'}};
 else if(body.method==='tools/call'){calls++;throw Error('connection lost');}
 else result={state:'completed',tool:'bbe_notes_create'};
 return Response.json({jsonrpc:'2.0',id:body.id,result});};
 const client=new HttpkClient({endpoint:'https://kloudy.ai/mcp',token:'private',state,fetcher});
 assert.equal((await client.ask('save note: test')).toolbox.tools.length,1);
 await assert.rejects(()=>client.call('unselected',{}),/first/);
 await assert.rejects(()=>client.call('bbe_notes_create',{text:'test'}),/No retry/);
 assert.equal((await client.status()).state,'completed');assert.equal(calls,1);assert.equal(received.at(-1).params.selection_id,'b'.repeat(32));
 const wrong=new HttpkClient({endpoint:'https://kloudy.ai/mcp',token:'private',mode:'confirm',fetcher});await assert.rejects(()=>wrong.session(),/surface/);
});
