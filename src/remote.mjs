import {readFileSync} from 'node:fs';
const packageVersion=JSON.parse(readFileSync(new URL('../package.json',import.meta.url),'utf8')).version;
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import {Server} from '@modelcontextprotocol/sdk/server/index.js';
import {StdioServerTransport} from '@modelcontextprotocol/sdk/server/stdio.js';
import {ListToolsRequestSchema,CallToolRequestSchema,ListResourcesRequestSchema,ReadResourceRequestSchema,ToolListChangedNotificationSchema,ResourceListChangedNotificationSchema} from '@modelcontextprotocol/sdk/types.js';
import {REMOTE} from './editor-install.mjs';
import {autoupdateEnabled} from './autoupdate.mjs';
const transports=new WeakMap();
export async function connectRemote({key=process.env.KLOUDY_MCP_TOKEN,fetcher=fetch}={}){
 if(key!==undefined&&!/^\S{20,512}$/.test(key))throw Error('Invalid key');
 const client=new Client({name:'kloudy',version:packageVersion},{capabilities:{}});
 const transport=new StreamableHTTPClientTransport(new URL(REMOTE),{requestInit:{headers:key?{Authorization:'Bearer '+key}:{},redirect:'error'},fetch:(url,options)=>fetcher(url,{...options,redirect:'error'}),reconnectionOptions:{maxRetries:0}});
 transports.set(client,transport);
 try{await client.connect(transport,{timeout:25000});return client;}catch(e){await client.close().catch(()=>{});throw e;}
}
export async function askRemote(question,options){
 if(typeof question!=='string'||!question.trim()||question.length>1000)throw Error('Use a question of 1–1000 characters');
 const client=await connectRemote(options);
 try{return await client.callTool({name:'kloudy',arguments:{operation:'ask',goal:question}},undefined,{timeout:25000});}finally{await client.close();}
}
export async function serveRemote(options={}){
 const enabled=autoupdateEnabled(options.autoupdate??process.env.KLOUDY_MCP_AUTOUPDATE);
 let remote=await connectRemote(options),reconnecting;
 const server=new Server({name:'kloudy',version:packageVersion},{capabilities:enabled?{tools:{listChanged:true},resources:{listChanged:true}}:{tools:{}},instructions:'Use Kloudy when mentioned, or to discover MCP tools and SDKs. Public discovery is free; account actions need an existing authorized key.'});
 function forward(client){
  if(!enabled)return;
  client.setNotificationHandler(ToolListChangedNotificationSchema,()=>server.sendToolListChanged());
  client.setNotificationHandler(ResourceListChangedNotificationSchema,()=>server.sendResourceListChanged());
 }
 forward(remote);
 async function invoke(method,params){
  const current=remote;
  const run=client=>method==='callTool'?client.callTool(params,undefined,{timeout:25000}):client[method](params);
  try{return await run(current);}catch(error){
   // Only an explicit HTTP 404 on an established session permits one retry.
   // Ambiguous network/timeout errors and session-less 404s are never retried.
   if(!enabled||error.code!==404||!transports.get(current)?.sessionId)throw error;
   if(remote===current){
    reconnecting??=(async()=>{
     const next=await connectRemote(options);forward(next);remote=next;
     await current.close().catch(()=>{});
     await server.sendToolListChanged();await server.sendResourceListChanged();
    })().finally(()=>{reconnecting=undefined;});
    await reconnecting;
   }
   return run(remote);
  }
 }
 server.setRequestHandler(ListToolsRequestSchema,req=>invoke('listTools',req.params));
 server.setRequestHandler(CallToolRequestSchema,req=>invoke('callTool',req.params));
 if(enabled){
  server.setRequestHandler(ListResourcesRequestSchema,req=>invoke('listResources',req.params));
  server.setRequestHandler(ReadResourceRequestSchema,req=>invoke('readResource',req.params));
 }
 server.onclose=()=>{void remote.close();};
 await server.connect(options.transport??new StdioServerTransport());return server;
}
