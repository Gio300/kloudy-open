import assert from 'node:assert/strict';
import {writeFile,mkdir} from 'node:fs/promises';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
import {askRemote,connectRemote} from '../src/remote.mjs';
const client=new Client({name:'kloudy-release-proof',version:'1'},{capabilities:{}});
const transport=new StdioClientTransport({command:process.execPath,args:['bin/entry.mjs','mcp'],env:{PATH:process.env.PATH||process.env.Path},stderr:'pipe'});
let stderr='';transport.stderr?.on('data',data=>{stderr+=data;});
try{
 await client.connect(transport);
 const list=await client.listTools();assert.deepEqual(list.tools.map(t=>t.name),['kloudy']);
 assert.match(list.tools[0].description,/Use this whenever the user mentions Kloudy/);
 const read=await client.callTool({name:'kloudy',arguments:{operation:'ask',goal:'find github tools',limit:2}});
 assert.equal(read.structuredContent.executed,false);assert.equal(read.structuredContent.model_calls,0);assert.equal(read.structuredContent.items.length,2);
 let denied=false;try{await client.callTool({name:'kloudy',arguments:{operation:'call',selection_id:'not-owned',name:'not-owned',arguments:{}}});}catch{denied=true;}assert.ok(denied);
 await assert.rejects(connectRemote({key:'invalid-key-for-negative-test-012345'}));
 const direct=await askRemote('find github tools');assert.equal(direct.structuredContent.tier,'public');
 const proof={checkedAt:new Date().toISOString(),exitCode:0,stdioProxy:{initialized:true,tools:['kloudy'],publicQuery:true,privateCallDenied:true,stdoutProtocolOnly:true},invalidKeyRejected:true,directQuestion:true,modelCalls:0,stderr};
 await mkdir('proof/2026-10-04-npm',{recursive:true});await writeFile('proof/2026-10-04-npm/remote.json',JSON.stringify(proof,null,2)+'\n');console.log(JSON.stringify(proof));
}finally{await client.close();}
