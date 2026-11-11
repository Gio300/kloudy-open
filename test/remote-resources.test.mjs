import test from 'node:test';import assert from 'node:assert/strict';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {InMemoryTransport} from '@modelcontextprotocol/sdk/inMemory.js';
import {McpError} from '@modelcontextprotocol/sdk/types.js';
import {serveRemote,forwardedCapabilities,connectRemote} from '../src/remote.mjs';
const UI={experimental:{'io.modelcontextprotocol/ui':{mimeTypes:['text/html;profile=mcp-app']}}};
async function fixture(mode,host={},upstream={tools:{listChanged:true},resources:{listChanged:true}}){
 const seen=[],calls=[];const connect=async options=>{seen.push(options.capabilities);return {getServerCapabilities:()=>upstream,setNotificationHandler(){},close:async()=>{},listTools:async()=>({tools:[{name:'card',inputSchema:{type:'object'},_meta:{ui:{resourceUri:'ui://card'}}}]}),callTool:async p=>{calls.push(p);return {content:[{type:'text',text:'Choose by stable ID'},{type:'resource_link',uri:'kloudy://layout.svg',name:'Layout',mimeType:'image/svg+xml'}],structuredContent:{executed:false}};},listResources:async()=>({resources:[{uri:'ui://card',name:'Card',mimeType:'text/html;profile=mcp-app'}]}),listResourceTemplates:async()=>({resourceTemplates:[]}),readResource:async p=>{if(p.uri!=='ui://card')throw new McpError(-32602,'Unknown resource');return {contents:[{uri:p.uri,mimeType:'text/html;profile=mcp-app',text:'<p>Card</p>'}]};}};};
 const pair=InMemoryTransport.createLinkedPair(),server=await serveRemote({autoupdate:mode,connect,transport:pair[1]}),client=new Client({name:'test-host',version:'1'},{capabilities:host});await client.connect(pair[0]);return {client,server,seen,calls,close:async()=>{await client.close();await server.close();}};
}
for(const mode of [undefined,'off','meta','notify','invalid'])for(const [name,caps] of [['text',{}],['apps',UI]])test(`${mode??'unset'} / ${name}: resource delivery and error semantics`,async()=>{
 const f=await fixture(mode,caps);try{
  const listed=await f.client.listTools();assert.equal(listed.tools[0]._meta.ui.resourceUri,'ui://card');
  assert.equal((await f.client.listResources()).resources.length,1);
  assert.equal((await f.client.readResource({uri:'ui://card'})).contents[0].mimeType,'text/html;profile=mcp-app');
  assert.deepEqual(await f.client.listResourceTemplates(),{resourceTemplates:[]});
  await assert.rejects(f.client.readResource({uri:'ui://missing'}),e=>e.code===-32602);
  const result=await f.client.callTool({name:'card',arguments:{}});assert.equal(result.content[1].type,'resource_link');assert.equal(result.structuredContent.executed,false);assert.equal(f.calls.length,1);
  assert.deepEqual(f.seen.at(-1),caps);assert.equal(!!f.client.getServerCapabilities().resources.listChanged,['meta','notify'].includes(mode));
 }finally{await f.close();}
});
test('never advertises upstream-unsupported resources or unserviceable client capabilities',async()=>{
 assert.deepEqual(forwardedCapabilities({sampling:{},roots:{},elicitation:{},experimental:{secret:{},'io.modelcontextprotocol/ui':{mimeTypes:['foreign','text/html;profile=mcp-app']}}}),UI);
 const f=await fixture('notify',{}, {tools:{}});try{assert.equal(f.client.getServerCapabilities().resources,undefined);assert.equal(f.client.getServerCapabilities().tools.listChanged,undefined);await assert.rejects(f.client.listResources());}finally{await f.close();}
});
test('ambiguous tool failure is never retried or turned into provider execution',async()=>{
 let count=0;const pair=InMemoryTransport.createLinkedPair();const server=await serveRemote({autoupdate:'notify',transport:pair[1],connect:async()=>({getServerCapabilities:()=>({tools:{}}),close:async()=>{},listTools:async()=>({tools:[]}),callTool:async()=>{count++;throw new McpError(-32603,'Unconfirmed outcome');}})});const client=new Client({name:'test',version:'1'});try{await client.connect(pair[0]);await assert.rejects(client.callTool({name:'test',arguments:{}}),e=>e.code===-32603);assert.equal(count,1);}finally{await client.close();await server.close();}
});
for(const mode of ['off','meta','notify'])test(`${mode}: established-session 404 recovery remains opt-in and bounded`,async()=>{
 let sessions=0,reads=0;const fetcher=async(_url,options={})=>{
  if(options.method==='GET')return new Response('',{status:405});
  if(options.method==='DELETE')return new Response(null,{status:202});
  const m=JSON.parse(options.body);if(m.method==='notifications/initialized')return new Response(null,{status:202});
  if(m.method==='resources/list'){reads++;if(reads===1)return new Response('Session expired',{status:404});}
  const session=m.method==='initialize'?'session-'+(++sessions):new Headers(options.headers).get('mcp-session-id');
  const result=m.method==='initialize'?{protocolVersion:'2025-06-18',capabilities:{tools:{},resources:{}},serverInfo:{name:'fixture',version:'1'}}:m.method==='resources/list'?{resources:[]}:{tools:[]};
  return new Response(JSON.stringify({jsonrpc:'2.0',id:m.id,result}),{headers:{'content-type':'application/json','mcp-session-id':session}});
 };
 const pair=InMemoryTransport.createLinkedPair(),server=await serveRemote({autoupdate:mode,transport:pair[1],connect:options=>connectRemote({...options,key:'fixture-token-not-a-real-credential',fetcher})}),client=new Client({name:'test',version:'1'});
 try{await client.connect(pair[0]);if(mode==='off'){await assert.rejects(client.listResources(),e=>e.code===404);assert.equal(sessions,1);assert.equal(reads,1);}else{assert.deepEqual(await client.listResources(),{resources:[]});assert.equal(sessions,2);assert.equal(reads,2);}}finally{await client.close();await server.close();}
});
