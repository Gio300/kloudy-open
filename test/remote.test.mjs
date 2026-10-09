import test from 'node:test';
import assert from 'node:assert/strict';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {InMemoryTransport} from '@modelcontextprotocol/sdk/inMemory.js';
import {ToolListChangedNotificationSchema,ResourceListChangedNotificationSchema} from '@modelcontextprotocol/sdk/types.js';
import {serveRemote} from '../src/remote.mjs';
const tools=[{name:'fake',description:'Fake remote fixture',inputSchema:{type:'object'}}];
const resources=[{name:'fixture',uri:'test://fixture'}];
function fixture({sessions=true}={}){
 const state={initializes:0,requests:[],stale:false,always404:false,notify:false,fail:false};
 const fetcher=async(_url,options)=>{
  if(options.method==='GET')return new Response(null,{status:405});
  const m=JSON.parse(options.body),headers=new Headers(options.headers);state.requests.push({method:m.method,session:headers.get('mcp-session-id')});
  if(m.method==='notifications/initialized')return new Response(null,{status:202});
  if(m.method==='initialize'){
   state.initializes++;return Response.json({jsonrpc:'2.0',id:m.id,result:{protocolVersion:'2025-06-18',capabilities:{tools:{listChanged:true},resources:{listChanged:true}},serverInfo:{name:'fixture',version:'1'}}},{headers:sessions?{'mcp-session-id':'fixture-'+state.initializes}:{}});
  }
  if(state.fail)throw Error('ambiguous network failure');
  if(state.always404||state.stale&&headers.get('mcp-session-id')==='fixture-1')return new Response(null,{status:404});
  const result=m.method==='tools/list'?{tools}:m.method==='resources/list'?{resources}:m.method==='resources/read'?{contents:[{uri:m.params.uri,text:'remote content'}]}:{content:[{type:'text',text:'remote result'}]};
  if(state.notify){state.notify=false;return new Response(['notifications/tools/list_changed','notifications/resources/list_changed'].map(method=>'event: message\ndata: '+JSON.stringify({jsonrpc:'2.0',method})+'\n\n').join('')+'event: message\ndata: '+JSON.stringify({jsonrpc:'2.0',id:m.id,result})+'\n\n',{headers:{'content-type':'text/event-stream'}});}
  return Response.json({jsonrpc:'2.0',id:m.id,result});
 };
 return {state,fetcher};
}
async function proxy(t,options){
 const [clientTransport,serverTransport]=InMemoryTransport.createLinkedPair();
 const server=await serveRemote({...options,transport:serverTransport});
 const client=new Client({name:'fixture-host',version:'1'},{capabilities:{}});
 const notices=[];client.setNotificationHandler(ToolListChangedNotificationSchema,()=>{notices.push('tools');});client.setNotificationHandler(ResourceListChangedNotificationSchema,()=>{notices.push('resources');});
 await client.connect(clientTransport);t.after(async()=>{await client.close();await server.close();});return {client,notices};
}
test('opt-in proxy declares changes, proxies resources, and forwards upstream SSE notifications',async t=>{
 const f=fixture(),{client,notices}=await proxy(t,{...f,autoupdate:'meta'});
 assert.deepEqual(client.getServerCapabilities(),{tools:{listChanged:true},resources:{listChanged:true}});
 assert.deepEqual(await client.listTools(),{tools});assert.deepEqual(await client.listResources(),{resources});assert.deepEqual(await client.readResource({uri:'test://fixture'}),{contents:[{uri:'test://fixture',text:'remote content'}]});
 f.state.notify=true;assert.equal((await client.callTool({name:'fake',arguments:{}})).content[0].text,'remote result');assert.deepEqual(notices,['tools','resources']);
});
test('session 404 reconnects once then emits both list changes before successful retry',async t=>{
 const f=fixture(),{client,notices}=await proxy(t,{...f,autoupdate:'notify'});f.state.stale=true;
 assert.deepEqual(await client.listTools(),{tools});assert.equal(f.state.initializes,2);assert.deepEqual(notices,['tools','resources']);assert.deepEqual(f.state.requests.filter(r=>r.method==='tools/list').map(r=>r.session),['fixture-1','fixture-2']);
});
test('persistent 404 is bounded to one reconnect per request',async t=>{
 const f=fixture(),{client}=await proxy(t,{...f,autoupdate:'notify'});f.state.always404=true;
 await assert.rejects(client.listTools());assert.equal(f.state.initializes,2);assert.equal(f.state.requests.filter(r=>r.method==='tools/list').length,2);
});
test('sessionless 404 and ambiguous tool failures never retry',async t=>{
 const f=fixture({sessions:false}),{client}=await proxy(t,{...f,autoupdate:'notify'});f.state.always404=true;await assert.rejects(client.listTools());assert.equal(f.state.initializes,1);
 f.state.always404=false;f.state.fail=true;await assert.rejects(client.callTool({name:'fake',arguments:{}}));assert.equal(f.state.requests.filter(r=>r.method==='tools/call').length,1);
});
test('unset and off modes preserve original capabilities and never reconnect',async t=>{
 for(const mode of [undefined,'off','invalid']){
  const f=fixture(),{client,notices}=await proxy(t,{...f,...(mode?{autoupdate:mode}:{})});assert.deepEqual(client.getServerCapabilities(),{tools:{}});
  f.state.stale=true;await assert.rejects(client.listTools());assert.equal(f.state.initializes,1);assert.deepEqual(notices,[]);
 }
});
