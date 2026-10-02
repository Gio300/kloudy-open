import test from 'node:test';
import assert from 'node:assert/strict';
import {HttpkClient} from '../src/httpk.mjs';
import {adaptMcp} from '../src/hosted.mjs';
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
