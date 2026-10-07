import {readFileSync} from 'node:fs';
const packageVersion=JSON.parse(readFileSync(new URL('../package.json',import.meta.url),'utf8')).version;
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import {Server} from '@modelcontextprotocol/sdk/server/index.js';
import {StdioServerTransport} from '@modelcontextprotocol/sdk/server/stdio.js';
import {ListToolsRequestSchema,CallToolRequestSchema} from '@modelcontextprotocol/sdk/types.js';
import {REMOTE} from './editor-install.mjs';
export async function connectRemote({key=process.env.KLOUDY_MCP_TOKEN,fetcher=fetch}={}){
 if(key!==undefined&&!/^\S{20,512}$/.test(key))throw Error('Invalid key');
 const client=new Client({name:'kloudy',version:packageVersion},{capabilities:{}});
 const transport=new StreamableHTTPClientTransport(new URL(REMOTE),{requestInit:{headers:key?{Authorization:'Bearer '+key}:{},redirect:'error'},fetch:(url,options)=>fetcher(url,{...options,redirect:'error'}),reconnectionOptions:{maxRetries:0}});
 try{await client.connect(transport,{timeout:25000});return client;}catch(e){await client.close().catch(()=>{});throw e;}
}
export async function askRemote(question,options){
 if(typeof question!=='string'||!question.trim()||question.length>1000)throw Error('Use a question of 1–1000 characters');
 const client=await connectRemote(options);
 try{return await client.callTool({name:'kloudy',arguments:{operation:'ask',goal:question}},undefined,{timeout:25000});}finally{await client.close();}
}
export async function serveRemote(options){
 const remote=await connectRemote(options);
 const server=new Server({name:'kloudy',version:packageVersion},{capabilities:{tools:{}},instructions:'Use Kloudy when mentioned, or to discover MCP tools and SDKs. Public discovery is free; account actions need an existing authorized key.'});
 server.setRequestHandler(ListToolsRequestSchema,req=>remote.listTools(req.params));
 server.setRequestHandler(CallToolRequestSchema,req=>remote.callTool(req.params,undefined,{timeout:25000}));
 server.onclose=()=>{void remote.close();};
 await server.connect(new StdioServerTransport());return server;
}
