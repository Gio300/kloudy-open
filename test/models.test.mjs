import test from 'node:test';
import assert from 'node:assert/strict';
import {ModelClient,configuredModels} from '../src/models.mjs';
import {hostCapabilities,readHostInterface} from '../src/host-interface.mjs';
import {HttpkClient} from '../src/httpk.mjs';
const data={data:[{id:'local:small'},{id:'local:small'}]};
test('discovery is bounded, deduplicated and never makes an inference',async()=>{
 const calls=[];const client=new ModelClient({fetcher:async(url,opts)=>{calls.push([url,opts]);return Response.json(data);}});
 const result=await client.list();assert.deepEqual(result.models,[{id:'local:small',status:'advertised'}]);assert.equal(result.inference_verified,false);assert.equal(calls.length,1);assert.equal(calls[0][1].method,'GET');assert.equal(calls[0][1].redirect,'error');
});
test('local Ollama runs one bounded call only for a locally installed model',async()=>{
 const calls=[];const client=new ModelClient({fetcher:async(url,opts)=>{calls.push([url,opts]);return Response.json(url.endsWith('/models')?data:url.endsWith('/api/tags')?{models:[{name:'local:small',size:1024}]}:{choices:[{message:{content:'Ready.'}}],usage:{prompt_tokens:3,completion_tokens:2,total_tokens:5}});}});
 const result=await client.complete({model:'local:small',prompt:'Confirm',maxTokens:8});assert.equal(result.text,'Ready.');assert.equal(calls.filter(x=>x[1].method==='POST').length,1);assert.deepEqual(JSON.parse(calls.at(-1)[1].body),{model:'local:small',messages:[{role:'user',content:'Confirm'}],max_tokens:8,stream:false});
});
test('remote and local proxy generation require explicit provider-charge permission before network',async()=>{
 for(const endpoint of ['https://owned.example/v1','http://127.0.0.1:4000/v1']){
  const client=new ModelClient({endpoint,fetcher:()=>assert.fail('no request before approval')});await assert.rejects(()=>client.complete({model:'local:small',prompt:'Hi'}),{code:'provider_charge_approval_required'});
 }
});
test('local Ollama cloud aliases cannot silently incur provider charges',async()=>{
 let posts=0;const client=new ModelClient({fetcher:async(url,opts)=>{if(opts.method==='POST')posts++;return Response.json(url.endsWith('/models')?data:{models:[{name:'local:small',size:12,remote_host:'https://cloud.example'}]});}});
 await assert.rejects(()=>client.complete({model:'local:small',prompt:'Hi'}),{code:'provider_charge_approval_required'});assert.equal(posts,0);
});
test('key resolver refreshes for every call; upstream errors and secrets never echo',async()=>{
 let revision=0;const seen=[];const client=new ModelClient({endpoint:'https://owned.example/v1',resolveKey:async()=>`private-${++revision}`,fetcher:async(_,opts)=>{seen.push(opts.headers.authorization);return Response.json(data);}});
 await client.list();await client.list();assert.deepEqual(seen,['Bearer private-1','Bearer private-2']);
 client.fetcher=async()=>Response.json({data:[{id:'private-3'}]});await assert.rejects(()=>client.list(),{code:'invalid_model_response'});
 client.fetcher=async()=>Response.json({error:'private-4'},{status:401});await assert.rejects(()=>client.list(),e=>e.code==='model_authorization_required'&&!e.message.includes('private-4'));
});
test('malformed, oversized, empty, missing-model and transient responses fail without retries',async()=>{
 for(const result of [{data:[{id:'bad\nname'}]},{data:'invalid'},{data:Array.from({length:513},()=>({id:'model'}))}])await assert.rejects(()=>new ModelClient({fetcher:async()=>Response.json(result)}).list());
 await assert.rejects(()=>new ModelClient({fetcher:async()=>new Response('x'.repeat(1048577),{headers:{'content-type':'application/json'}})}).list(),{code:'model_response_limit'});
 let count=0;const client=new ModelClient({fetcher:async()=>{count++;throw Error('secret upstream detail');}});await assert.rejects(()=>client.list(),e=>!e.message.includes('secret'));assert.equal(count,1);
 const missing=new ModelClient({fetcher:async()=>Response.json(data)});await assert.rejects(()=>missing.complete({model:'absent',prompt:'Hi'}),{code:'model_not_available'});
 for(const prompt of ['', 'x'.repeat(16001)])await assert.rejects(()=>missing.complete({model:'local:small',prompt}),{code:'invalid_model_request'});
});
test('unsafe URLs and key references fail before connection',()=>{
 for(const endpoint of ['http://remote.example/v1','https://user:password@example.com/v1','https://example.com/v1?key=secret'])assert.throws(()=>new ModelClient({endpoint}));
 assert.throws(()=>configuredModels({KLOUDY_MODEL_KEY_ENV:'sk-secret-key'}));
});
test('host negotiation cannot smuggle approval or surface changes',async()=>{
 for(const hints of [{approve:true},{surface:'ide'},{speech_input:'yes'},null])assert.throws(()=>hostCapabilities(hints));
 const calls=[];const client=new HttpkClient({endpoint:'https://kloudy.ai/mcp',token:'fixture',host:{chat:true,text_input:true,speech_input:false},fetcher:async(_,opts)=>{calls.push(JSON.parse(opts.body));return Response.json({result:{session_id:'existing',interaction_mode:'autonomous'}});}});
 await client.session();assert.deepEqual(calls[0].params.capabilities,hostCapabilities());assert.equal(client.hostInterface,null);
 assert.throws(()=>readHostInterface({version:'kloudy.host-interface/1',authorization_changed:true}));
});

test('an authorized remote request stays bounded and does not retry an uncertain completion',async()=>{
 let posts=0;const client=new ModelClient({endpoint:'https://owned.example/v1',resolveKey:async()=>'protected',fetcher:async(_,opts)=>{if(opts.method==='GET')return Response.json(data);posts++;throw Error('may have billed; protected');}});
 await assert.rejects(()=>client.complete({model:'local:small',prompt:'Hi',maxTokens:8,allowProviderCharge:true}),e=>e.code==='model_unavailable'&&!e.message.includes('protected'));assert.equal(posts,1);
});
