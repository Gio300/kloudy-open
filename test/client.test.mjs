import test from 'node:test';
import assert from 'node:assert/strict';
import {KloudyClient,httpTransport,projectToolbox} from '../src/client.mjs';
const receipt={narrowing:{shortlist:[{index:1}],toolbox:{status:'ready',candidate_index:1,binding:{secret:'never-export'},tool:{function:{name:'notes_create',description:'Create a note',parameters:{type:'object',properties:{text:{type:'string',minLength:1,maxLength:100}},required:['text']}}}},measurements:{candidates_read:2,definitions_emitted:1}}};
const candidates=[{source_url:'https://example.com/notes',discovered_via:'geo',resource:{name:'Notes'}}];
test('SDK narrows through the engine and returns one definition without exposing binding metadata',async()=>{
 const calls=[];const client=new KloudyClient({transport:async(method,path,body)=>{calls.push({method,path,body});if(path==='/sessions')return{session_id:'session'};if(method==='GET')return{revision:0,interaction_mode:'autonomous'};return receipt;}});
 const result=await client.ask('save note',{candidates});assert.equal(result.toolbox.tools.length,1);assert.equal(result.toolbox.tools[0].name,'notes_create');assert.doesNotMatch(JSON.stringify(result),/never-export|binding/);
 assert.equal(calls.at(-1).path,'/sessions/session/narrow');assert.equal(calls.at(-1).body.expected_revision,0);assert.equal(calls.some(c=>c.path==='/catalog'),false);
});
test('call cannot invoke an unselected tool and selected execution preserves explicit approval',async()=>{
 const calls=[];const client=new KloudyClient({mode:'confirm',state:{sessionId:'session'},transport:async(method,path,body)=>{calls.push({method,path,body});if(path.endsWith('/narrow'))return receipt;if(path.endsWith('/escalate'))return{request_id:'request'};if(path==='/requests/request')return{request_id:'request',state:'awaiting_approval',approval:{revision:'exact-r1',summary:{operation:'create note'}}};return{revision:1,interaction_mode:'confirm'};}});
 await assert.rejects(()=>client.call('any',{}),{code:'not_selected'});await client.ask('save note',{candidates});
 await assert.rejects(()=>client.call('notes_create',{secret:'no'}),{code:'invalid_input'});
 const pending=await client.call('notes_create',{text:'hello'});assert.equal(pending.state,'awaiting_approval');assert.equal(calls.some(c=>c.path.endsWith('/approve')),false);
 await assert.rejects(()=>client.decide('approve'),{code:'approval_required'});await client.decide('approve','exact-r1');assert.deepEqual(calls.find(c=>c.path.endsWith('/approve')).body,{revision:'exact-r1',decision:'approve'});
});
test('empty toolbox and no discovery never expand into a catalog dump',async()=>{
 const empty=structuredClone(receipt);empty.narrowing.toolbox={status:'empty',reason:'no_reviewed_available_binding'};assert.deepEqual(projectToolbox(empty).tools,[]);
 const client=new KloudyClient({state:{sessionId:'session'},transport:async(method,path)=>method==='GET'?{revision:0,interaction_mode:'autonomous'}:{}});
 const result=await client.ask('find a resource');assert.equal(result.toolbox.status,'empty');assert.deepEqual(result.toolbox.tools,[]);assert.equal(result.fallback.available,false);
});
test('unexpected multiple definitions, unsafe origins and bearer redirects fail closed',async()=>{
 const bad=structuredClone(receipt);bad.narrowing.measurements.definitions_emitted=30;assert.throws(()=>projectToolbox(bad),{code:'invalid_response'});
 assert.throws(()=>httpTransport({origin:'http://example.com',token:'secret'}));assert.throws(()=>httpTransport({origin:'https://user:secret@example.com',token:'secret'}));
 let options;const transport=httpTransport({origin:'https://example.com',token:'test-private-token',fetcher:async(url,o)=>{options=o;return new Response('private-error',{status:403});}});
 await assert.rejects(()=>transport('GET','/sessions'),error=>error.code==='registration_required'&&!error.message.includes('private-error'));assert.equal(options.redirect,'error');
});
test('empty toolbox returns the accepted engine source card without execution or private metadata',async()=>{
 const calls=[];const client=new KloudyClient({state:{sessionId:'session'},transport:async(method,path)=>{calls.push(path);return method==='GET'?{revision:0,interaction_mode:'autonomous'}:{routing:{view:{destinations:[{title:'Official resource',url:'https://example.com/resource',private:'not-public'}]}}};}});
 const result=await client.ask('find a resource');assert.deepEqual(result.fallback,{kind:'source_card',available:true,title:'Official resource',url:'https://example.com/resource'});assert.deepEqual(result.toolbox.tools,[]);assert.doesNotMatch(JSON.stringify(result),/not-public/);assert.equal(calls.some(p=>p.endsWith('/escalate')),false);
});
