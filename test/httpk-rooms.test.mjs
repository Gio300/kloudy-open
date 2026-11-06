import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {HttpkClient} from '../src/httpk.mjs';
import {createMcpServer} from '../src/mcp.mjs';
import {InMemoryTransport} from '@modelcontextprotocol/sdk/inMemory.js';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';

const state=()=>({sessionId:'existing-session',interactionMode:'autonomous'});
const readyInput=()=>({project:'owned',participants:[{id:'first',client_id:'existing-first'}]});
const readiness={version:1,project:'owned',authority_verified:true,participants:[{id:'first'}],provider_ingress_verified:false};
const response=(request,result)=>Response.json({jsonrpc:'2.0',id:request.id,result});
const subscription=()=>({name:'message.created',arguments:{project:'owned',room_id:'room',participant_id:'first'},
 delivery:{mode:'webhook',url:'https://callback.example/selected',secret:'whsec_'+Buffer.alloc(32,1).toString('base64')},cursor:null,ttlMs:60000});

test('room SDK uses the existing bearer and session and returns mailbox receipts without extra calls',async()=>{
 const calls=[],saved=state(),before=structuredClone(saved);
 const client=new HttpkClient({endpoint:'https://engine.example/mcp',token:'synthetic-owned',state:saved,
  save:async()=>assert.fail('No room text or state is saved locally'),fetcher:async(url,options)=>{
   assert.equal(url,'https://engine.example/mcp');assert.equal(options.redirect,'error');
   assert.equal(options.headers.authorization,'Bearer synthetic-owned');assert.equal(options.headers['mcp-session-id'],'existing-session');
   const request=JSON.parse(options.body);calls.push(request);
   return response(request,request.method.endsWith('/readiness')?readiness:{room_id:'room',request_id:'request',deliveries:[{participant_id:'first',state:'queued',reply:null}]});
  }});
 assert.deepEqual(await client.room('readiness',readyInput()),readiness);
 const send={project:'owned',room_id:'room',request_id:'request',generation:0,recipients:['first'],text:'Controlled exact text',mode:'direct'};
 assert.equal((await client.room('send',send)).deliveries[0].state,'queued');
 assert.deepEqual(calls.map(x=>x.method),['kloudy/room/readiness','kloudy/room/send']);
 assert.deepEqual(calls[1].params,send);assert.deepEqual(saved,before);
});

test('invalid room or event inputs cannot initialize a session or contact an endpoint',async()=>{
 let calls=0;const client=new HttpkClient({endpoint:'https://engine.example/mcp',token:'synthetic',fetcher:async()=>{calls++;assert.fail('No HTTP for invalid inputs');}});
 await assert.rejects(()=>client.room('readiness',{...readyInput(),room_id:'new-room'}));
 await assert.rejects(()=>client.room('send',{project:'owned',room_id:'room'}));
 await assert.rejects(()=>client.events('subscribe',{...subscription(),cursor:'replay'}));
 await assert.rejects(()=>client.events('list',{autoSubscribe:true}));
 assert.equal(calls,0);
});

test('room parameters are captured before an awaited session opens',async()=>{
 const calls=[];let finishInitialize;
 const client=new HttpkClient({endpoint:'https://engine.example/mcp',token:'synthetic',fetcher:async(_,options)=>{
  const request=JSON.parse(options.body);calls.push(request);
  if(request.method==='initialize')return new Promise(resolve=>{finishInitialize=()=>resolve(response(request,{session_id:'existing-session',interaction_mode:'autonomous'}));});
  return response(request,readiness);
 }});
 const input=readyInput(),pending=client.room('readiness',input);
 input.project='changed';input.participants[0].id='changed';
 finishInitialize();assert.deepEqual(await pending,readiness);
 assert.equal(calls.length,2);assert.deepEqual(calls[1].params,readyInput());
 assert.equal(JSON.stringify(client.state).includes('existing-first'),false);
});

test('events list subscribe and unsubscribe are caller-driven requests to the same scoped engine only',async()=>{
 const calls=[],saved=state(),before=structuredClone(saved),client=new HttpkClient({endpoint:'https://engine.example/mcp',token:'synthetic',state:saved,
  fetcher:async(url,options)=>{
   assert.equal(url,'https://engine.example/mcp');const request=JSON.parse(options.body);calls.push(request);
   return response(request,request.method==='events/list'?{events:[]}:request.method==='events/subscribe'?{id:'sub-owned',cursor:null}:{});
  }});
 await client.events('list');assert.deepEqual(calls.map(x=>x.method),['events/list']);
 const input=subscription();await client.events('subscribe',input);
 await client.events('unsubscribe',{name:input.name,arguments:input.arguments,delivery:{mode:'webhook',url:input.delivery.url}});
 assert.deepEqual(calls.map(x=>x.method),['events/list','events/subscribe','events/unsubscribe']);
 assert.deepEqual(calls[1].params,input);assert.deepEqual(saved,before);
 assert.equal(JSON.stringify(saved).includes(input.delivery.secret),false);
});

test('a lost room response never retries sends or creates a new room or request identifier',async()=>{
 let calls=0;const client=new HttpkClient({endpoint:'https://engine.example/mcp',token:'synthetic',state:state(),fetcher:async()=>{calls++;throw Error('Controlled network loss');}});
 await assert.rejects(()=>client.room('send',{project:'owned',room_id:'room',request_id:'original-request',generation:0,recipients:['first'],text:'Controlled text',mode:'stored'}),/No retry/);
 assert.equal(calls,1);assert.deepEqual(client.state,state());
});

test('room and event authorization errors remain errors with no automatic enrollment or secret echo',async()=>{
 const calls=[],secret=subscription().delivery.secret;
 const client=new HttpkClient({endpoint:'https://engine.example/mcp',token:'synthetic',state:state(),fetcher:async(_,options)=>{
  const request=JSON.parse(options.body);calls.push(request.method);
  return Response.json({jsonrpc:'2.0',id:request.id,error:{code:403,message:secret}},{status:403});
 }});
 for(const invoke of [()=>client.room('readiness',readyInput()),()=>client.events('subscribe',subscription())]){
  await assert.rejects(invoke,error=>/No retry/.test(error.message)&&!error.message.includes(secret));
 }
 assert.deepEqual(calls,['kloudy/room/readiness','events/subscribe']);
});

test('strict room transport rejects unmatched IDs versions malformed results and invalid UTF8',async()=>{
 const replies=[request=>Response.json({jsonrpc:'2.0',id:'foreign',result:readiness}),
  request=>Response.json({jsonrpc:'1.0',id:request.id,result:readiness}),
  request=>response(request,[]),request=>response(request,null),
  ()=>new Response(Uint8Array.from([0xC3,0x28]),{headers:{'content-type':'application/json'}})];
 for(const reply of replies){
  let calls=0;const client=new HttpkClient({endpoint:'https://engine.example/mcp',token:'synthetic',state:state(),fetcher:async(_,options)=>{calls++;return reply(JSON.parse(options.body));}});
  await assert.rejects(()=>client.room('readiness',readyInput()));assert.equal(calls,1);
 }
});

test('strict transport cancels non-JSON and oversized streaming bodies without accepting a receipt',async()=>{
 for(const oversized of [false,true]){
  let cancelled=false,calls=0;
  const client=new HttpkClient({endpoint:'https://engine.example/mcp',token:'synthetic',state:state(),fetcher:async()=>{
   calls++;return new Response(new ReadableStream({pull(controller){controller.enqueue(new Uint8Array(oversized?262145:1));},cancel(){cancelled=true;}}),
    {headers:{'content-type':oversized?'application/json':'text/html'}});
  }});
  await assert.rejects(()=>client.room('info',{project:'owned',room_id:'room'}));
  assert.equal(calls,1);assert.equal(cancelled,true);
 }
});

test('readiness cannot substitute a foreign project participant or provider-ingress claim',async()=>{
 for(const result of [{...readiness,project:'foreign'},{...readiness,participants:[{id:'other'}]},
  {...readiness,provider_ingress_verified:true},{...readiness,participants:[{id:'first',client_id:'leaked-identifier'}]}]){
  const client=new HttpkClient({endpoint:'https://engine.example/mcp',token:'synthetic',state:state(),fetcher:async(_,options)=>response(JSON.parse(options.body),result)});
  await assert.rejects(()=>client.room('readiness',readyInput()),/invalid_room_response/);
 }
});

test('one stdio MCP tool exposes room readiness and delegates exact existing client identity',async()=>{
 const calls=[],engine=new HttpkClient({endpoint:'https://engine.example/mcp',token:'synthetic',state:state(),fetcher:async(_,options)=>{
  const request=JSON.parse(options.body);calls.push(request);return response(request,readiness);
 }});
 const server=createMcpServer({useClient:work=>work(engine)}),client=new Client({name:'controlled-room-fixture',version:'1'}),[a,b]=InMemoryTransport.createLinkedPair();
 try{
  await server.connect(a);await client.connect(b);
  const tools=(await client.listTools()).tools;assert.deepEqual(tools.map(x=>x.name),['kloudy']);
  assert.ok(tools[0].inputSchema.properties.operation.enum.includes('room'));
  const result=await client.callTool({name:'kloudy',arguments:{operation:'room',room_operation:'readiness',room:readyInput()}});
  assert.deepEqual(result.structuredContent,readiness);assert.equal(calls.length,1);
  assert.equal(calls[0].method,'kloudy/room/readiness');assert.deepEqual(calls[0].params,readyInput());
 }finally{await client.close();await server.close();}
});

test('stdio clients without a scoped room adapter fail closed rather than falling back to ask',async()=>{
 let asks=0;const server=createMcpServer({useClient:work=>work({state:{},ask:()=>{asks++;assert.fail('No substitute');}})}),
  client=new Client({name:'controlled-unsupported-fixture',version:'1'}),[a,b]=InMemoryTransport.createLinkedPair();
 try{
  await server.connect(a);await client.connect(b);
  const result=await client.callTool({name:'kloudy',arguments:{operation:'room',room_operation:'readiness',room:readyInput()}});
  assert.equal(result.isError,true);assert.equal(asks,0);
 }finally{await client.close();await server.close();}
});

test('new SDK room method crosses one real isolated loopback HTTP boundary with existing authorization',async()=>{
 const requests=[],server=createServer(async(req,res)=>{
  const chunks=[];for await(const part of req)chunks.push(part);
  const request=JSON.parse(Buffer.concat(chunks).toString());requests.push(request);
  assert.equal(req.headers.authorization,'Bearer synthetic-only');assert.equal(req.headers['mcp-session-id'],'existing-session');
  res.setHeader('content-type','application/json');res.end(JSON.stringify({jsonrpc:'2.0',id:request.id,result:readiness}));
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{
  const client=new HttpkClient({endpoint:`http://127.0.0.1:${server.address().port}/isolated-mcp`,token:'synthetic-only',state:state()});
  assert.deepEqual(await client.room('readiness',readyInput()),readiness);
  assert.equal(requests.length,1);assert.deepEqual(requests[0].params,readyInput());
 }finally{await new Promise(resolve=>server.close(resolve));}
});
