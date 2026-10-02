// Opt-in synthetic Notes proof. Credential is supplied in process memory only.
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import {install} from '../src/install.mjs';
import {HttpkClient} from '../src/httpk.mjs';
const credential=JSON.parse(process.env.KLOUDY_TEST_CONNECTION||'{}');delete process.env.KLOUDY_TEST_CONNECTION;
assert.ok(credential.access_token&&credential.expires_at>Date.now()/1000,'A current scoped test credential is required.');
const endpoint=process.env.KLOUDY_TEST_ENDPOINT||'https://kloudy.ai/mcp';
const home=await mkdtemp(join(tmpdir(),'kloudy-clean-ide-'));
const client=new Client({name:'kloudy-clean-ide-proof',version:'0.3.0'}),transport=new StreamableHTTPClientTransport(new URL(endpoint),{requestInit:{headers:{Authorization:'Bearer '+credential.access_token}}});
try{
 const installed=await install({home,ide:'codex',url:endpoint,tokenEnv:'KLOUDY_TEST_TOKEN'});
 const config=await readFile(installed.results[0].path,'utf8');assert.ok(!config.includes(credential.access_token));
 await client.connect(transport);
 const initial=await client.listTools();assert.deepEqual(initial.tools.map(t=>t.name),['kloudy']);
 const greet=await client.callTool({name:'kloudy',arguments:{operation:'introduce',project_context:{languages:['javascript'],manifests:['package.json']}}});
 assert.equal(greet.structuredContent.greeting.version,'bbe.attach.v1');assert.equal(greet.structuredContent.execution_started,false);
 const text='Synthetic clean IDE attachment proof '+randomUUID();
 const selected=await client.callTool({name:'kloudy',arguments:{operation:'ask',goal:'save note: '+text}});
 const choice=selected.structuredContent;assert.equal(choice.tools.length,1);assert.equal(choice.arguments.text,text);
 const callArgs={operation:'call',selection_id:choice.selection_id,name:choice.tools[0].name,arguments:choice.arguments};
 const called=await client.callTool({name:'kloudy',arguments:callArgs});assert.equal(called.isError,false);assert.equal(called.structuredContent.approval,null);
 let receipt;for(let i=0;i<12;i++){receipt=(await client.callTool({name:'kloudy',arguments:{operation:'status',selection_id:choice.selection_id}})).structuredContent;if(receipt.state==='completed')break;await new Promise(r=>setTimeout(r,400));}
 assert.equal(receipt.state,'completed');assert.equal(receipt.result.text,text);assert.equal(receipt.tool_calls,1);
 const replay=(await client.callTool({name:'kloudy',arguments:callArgs})).structuredContent;assert.equal(replay.receipt_hash,receipt.receipt_hash);
 // The Node SDK/CLI HTTPK adapter uses the same actual public engine.
 const sdk=new HttpkClient({endpoint,token:credential.access_token});const greeting=await sdk.introduce({languages:['javascript'],manifests:['package.json']});assert.equal(greeting.version,'bbe.attach.v1');
 const read=await sdk.ask('read note '+receipt.result.note_id);assert.equal(read.toolbox.tools.length,1);await sdk.call(read.toolbox.tools[0].name,read.arguments);let got;for(let i=0;i<12;i++){got=await sdk.status();if(got.state==='completed')break;await new Promise(r=>setTimeout(r,400));}assert.equal(got.result.text,text);
 const proof={checkedAt:new Date().toISOString(),endpoint,cleanUserConfig:true,actualIDEUI:false,standardMcpClient:true,engineGreeting:true,remoteDoorCount:1,singularToolCount:1,completed:true,idempotentReplay:true,sdkReadback:true,receipt,credentialExpiresAt:credential.expires_at,developmentOnly:true,modelRetryTested:false};
 await mkdir('.cache',{recursive:true});await writeFile('.cache/hosted-proof.json',JSON.stringify(proof,null,2)+'\n');
 console.log(JSON.stringify({endpoint,cleanUserConfig:true,engineGreeting:true,singularToolCount:1,completed:true,sdkReadback:true,receiptHash:receipt.receipt_hash,actualIDEUI:false}));
}finally{await client.close();await rm(home,{recursive:true,force:true});}
