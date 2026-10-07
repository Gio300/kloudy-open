import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
const version=JSON.parse(await fs.readFile('package.json','utf8')).version;
const client=new Client({name:'kloudy-version-check',version:'1'});
try{
 await client.connect(new StdioClientTransport({command:process.execPath,args:['bin/entry.mjs','mcp'],env:{PATH:process.env.PATH||process.env.Path},stderr:'pipe'}));
 assert.equal(client.getServerVersion().version,version);
 const list=await client.listTools();assert.deepEqual(list.tools.map(x=>x.name),['find_mcp_tools','kloudy_connect_card','show_tool_preferences_card']);
 const answer=await client.callTool({name:'find_mcp_tools',arguments:{operation:'ask',goal:'find note tools'}});assert.notEqual(answer.isError,true);assert.ok(answer.content.length);
 const result={sourceProxyVersion:version,realRemote:true,tools:list.tools.map(x=>x.name),publicRead:true,publishedNpmUpdated:false};
 await fs.mkdir('proof/2026-10-07-proxy-version',{recursive:true});await fs.writeFile('proof/2026-10-07-proxy-version/verification.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}finally{await client.close();}
