// Actual bounded Base read using an existing finite browser grant. No key is persisted.
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {HttpkClient} from '../src/httpk.mjs';
const credential=JSON.parse(process.env.KLOUDY_TEST_CONNECTION||'{}');delete process.env.KLOUDY_TEST_CONNECTION;
assert.ok(credential.access_token&&credential.expires_at>Date.now()/1000);
const client=new HttpkClient({endpoint:'https://kloudy.ai/mcp',token:credential.access_token,mode:'confirm'});
const choice=await client.ask('base block number');assert.equal(choice.toolbox.tools[0].name,'bbe_evm_head');
const pending=await client.call(choice.toolbox.tools[0].name,choice.arguments);
assert.equal(pending.state,'awaiting_approval');assert.equal(pending.tool_calls,0);
const confirmation={operation:'confirm',selection_id:choice.selection_id,decision:'approve',source:'tap',token:pending.approval.token};
assert.ok(confirmation.token);
await assert.rejects(client.rpc('tools/call',{name:'kloudy',arguments:{...confirmation,token:'wrong-pending-token'}}));
assert.equal((await client.status()).tool_calls,0);
const accepted=await client.rpc('tools/call',{name:'kloudy',arguments:confirmation});assert.ok(!accepted.isError);
let done;for(let i=0;i<15;i++){done=await client.status();if(['completed','failed','cancelled'].includes(done.state))break;await new Promise(r=>setTimeout(r,400));}
assert.equal(done.state,'completed');assert.equal(done.result.chain_id,8453);assert.ok(done.result.block_number>0);assert.equal(done.tool_calls,1);
const replay=await client.call(choice.toolbox.tools[0].name,choice.arguments,{selectionId:choice.selection_id});assert.equal(replay.receipt_hash,done.receipt_hash);
const proof={checkedAt:new Date().toISOString(),endpoint:'https://kloudy.ai/mcp',developmentOnly:true,checks:{pendingBeforeExecution:true,wrongTokenDenied:true,wrapperExactConfirmation:true,realBaseRead:true,replaySameReceipt:true},chainId:done.result.chain_id,blockNumber:done.result.block_number,receiptHash:done.receipt_hash,modelsCalled:0,providerCalls:1};
await writeFile('.cache/confirmation-proof.json',JSON.stringify(proof,null,2)+'\n');console.log(JSON.stringify(proof));
