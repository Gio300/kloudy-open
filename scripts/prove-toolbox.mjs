// Read-only execution proof using an existing synthetic note and a finite operator grant.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import {HttpkClient} from '../src/httpk.mjs';
const credential=JSON.parse(process.env.KLOUDY_TEST_CONNECTION||'{}');delete process.env.KLOUDY_TEST_CONNECTION;
assert.ok(credential.access_token&&credential.expires_at>Date.now()/1000,'A current scoped development grant is required.');
const prior=JSON.parse(await readFile('.cache/hosted-proof.json','utf8'));
const endpoint='https://kloudy.ai/mcp',note=prior.receipt.result;
const goals=['read note '+note.note_id,'save note: Uncalled assembly proof A','save note: Uncalled assembly proof B'];
const sdk=new HttpkClient({endpoint,token:credential.access_token});
const choices=[];for(const goal of goals)choices.push(await sdk.ask(goal));
const assembled=await sdk.assemble(choices.map(c=>c.selection_id));
assert.equal(assembled.toolbox.tools.length,2);assert.equal(assembled.selections.length,3);
async function complete(initial,status){let result=initial;for(let i=0;i<15&&!['completed','failed','cancelled'].includes(result.state);i++){await new Promise(r=>setTimeout(r,400));result=await status();}return result;}
const sdkRead=await complete(await sdk.call(choices[0].toolbox.tools[0].name,choices[0].arguments,{selectionId:choices[0].selection_id}),()=>sdk.status());
assert.equal(sdkRead.state,'completed');assert.equal(sdkRead.result.text,note.text);
const mcp=new Client({name:'kloudy-toolbox-proof',version:'0.3.1'});
try{
 await mcp.connect(new StreamableHTTPClientTransport(new URL(endpoint),{requestInit:{headers:{Authorization:'Bearer '+credential.access_token}}}));
 assert.deepEqual((await mcp.listTools()).tools.map(t=>t.name),['kloudy']);
 const call=async args=>{const r=await mcp.callTool({name:'kloudy',arguments:args});assert.ok(!r.isError);return r.structuredContent;};
 const selected=[];for(const goal of goals)selected.push(await call({operation:'ask',goal}));
 const collection=await call({operation:'assemble',selection_ids:selected.map(s=>s.selection_id)});
 assert.equal(collection.tools.length,2);assert.equal(collection._meta.selections.length,3);
 const action={operation:'call',selection_id:selected[0].selection_id,name:selected[0].tools[0].name,arguments:selected[0].arguments};
 const read=await complete(await call(action),()=>call({operation:'status',selection_id:selected[0].selection_id}));assert.equal(read.state,'completed');assert.equal(read.result.text,note.text);
 assert.equal((await call(action)).receipt_hash,read.receipt_hash);
 const unused=[];for(const choice of selected.slice(1)){const receipt=await call({operation:'status',selection_id:choice.selection_id});assert.ok(!receipt.request_id);unused.push(receipt.state);}
 let rejected=false;try{const denied=await mcp.callTool({name:'kloudy',arguments:{operation:'assemble',selection_ids:[selected[0].selection_id,'unknown-selection']}});rejected=denied.isError===true;}catch{rejected=true;}assert.ok(rejected);
 const proof={checkedAt:new Date().toISOString(),endpoint,developmentOnly:true,modelsCalled:0,newNotesWritten:0,sdkAssembly:true,standardMcpAssembly:true,selectionCount:3,definitionCount:2,exactReadback:true,replay:true,unknownSelectionDenied:true,uncalledWrites:unused,receiptHash:read.receipt_hash};
 await writeFile('.cache/toolbox-proof.json',JSON.stringify(proof,null,2)+'\n');console.log(JSON.stringify(proof));
}finally{await mcp.close();}
