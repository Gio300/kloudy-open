// Opt-in acceptance proof against an existing, isolated Blackbox test connection.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {writeFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
import {withConnection} from '../src/connection.mjs';
const args=process.argv.slice(2),get=name=>args[args.indexOf(name)+1];
assert.ok(args.includes('--connection')&&args.includes('--candidates')&&args.includes('--approve-synthetic'),'Use an isolated test connection and explicitly allow one synthetic note.');
const connection=resolve(get('--connection')),candidates=resolve(get('--candidates')),binary=fileURLToPath(new URL('../bin/kloudy.mjs',import.meta.url));
const cli=(...args)=>JSON.parse(execFileSync(process.execPath,[binary,...args,'--connection',connection],{encoding:'utf8',timeout:20000}));
const toolbox=cli('ask','Build an app to create private notes','--candidates',candidates);
assert.equal(toolbox.toolbox.tools.length,1);assert.equal(toolbox.toolbox.measurements.definitionsEmitted,1);
const mcp=new Client({name:'kloudy-acceptance-proof',version:'0.1.0'}),transport=new StdioClientTransport({command:process.execPath,args:[binary,'mcp','--connection',connection],stderr:'pipe'});
let completed;
try{
 await mcp.connect(transport);const listed=await mcp.listTools();assert.equal(listed.tools.length,2);
 assert.equal(listed.tools[0].name,'kloudy');assert.equal(listed.tools[1].name,'selected_'+toolbox.toolbox.tools[0].name);
 const called=await mcp.callTool({name:listed.tools[1].name,arguments:{text:'Synthetic Kloudy Open acceptance note. No provider call.'}});
 assert.equal(called.isError,undefined);assert.equal(called.structuredContent.state,'awaiting_approval');
 const pending=await withConnection(connection,client=>client.status());assert.equal(pending.request_id,called.structuredContent.request_id);assert.equal(pending.state,'awaiting_approval');
 cli('approve','--revision',pending.approval.revision);
 const deadline=Date.now()+20000;
 do{completed=cli('status');if(['completed','failed','cancelled'].includes(completed.state))break;await new Promise(resolve=>setTimeout(resolve,250));}while(Date.now()<deadline);
 assert.equal(completed.state,'completed');
 const proof={checkedAt:new Date().toISOString(),realEngine:true,syntheticMetadata:true,cliDefinitions:toolbox.toolbox.tools.length,mcpTools:['kloudy',listed.tools[1].name],sameSessionAcrossClients:true,approvalRequired:true,explicitSyntheticApproval:true,state:completed.state,providerCalls:0};
 await mkdir('.cache',{recursive:true});await writeFile('.cache/live-engine-proof.json',JSON.stringify(proof,null,2)+'\n');console.log(JSON.stringify(proof,null,2));
}finally{await mcp.close();}
