import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {KloudyClient} from '../src/client.mjs';
test('IDE SDK defaults autonomous and waits for engine acknowledgment before routing',async()=>{
 const calls=[];let mode='confirm',revision=1;
 const client=new KloudyClient({state:{sessionId:'session'},transport:async(method,path,body)=>{calls.push({path,body});if(path.endsWith('/mode')){mode=body.mode;revision++;return{};}if(method==='GET')return{revision,interaction_mode:mode};return{};}});
 assert.equal(client.mode,'autonomous');await client.ask('find source');assert.equal(calls[1].body.mode,'autonomous');assert.equal(calls.at(-1).body.expected_revision,2);
});
test('unacknowledged mode fails before any selection or execution',async()=>{
 const calls=[];const client=new KloudyClient({state:{sessionId:'s'},transport:async(method,path)=>{calls.push(path);return{revision:1,interaction_mode:'confirm'};}});
 await assert.rejects(()=>client.ask('find'),{code:'mode_not_supported'});assert.equal(calls.some(p=>/route|narrow|escalate/.test(p)),false);
});
test('autonomous clients never manufacture approvals for older engine writes',async()=>{
 const calls=[];const client=new KloudyClient({state:{requestId:'r'},transport:async(method,path)=>{calls.push(path);return{state:'awaiting_approval'};}});
 assert.equal((await client.status()).blocked.code,'engine_autonomy_not_supported');
 await assert.rejects(()=>client.decide('approve','revision'),{code:'autonomous_only'});assert.equal(calls.some(p=>p.endsWith('/approve')),false);
});
test('CLI exposes no approval command or confirm switch even without a connection',()=>{
 const bin=new URL('../bin/kloudy.mjs',import.meta.url);
 const help=execFileSync(process.execPath,[decodeURIComponent(bin.pathname).replace(/^\/(\w:)/,'$1'),'help'],{encoding:'utf8'});
 assert.doesNotMatch(help,/kloudy approve|--mode|--revision/);
 for(const args of [['approve'],['ask','find','--mode','confirm'],['mcp','--mode','confirm']]){
  assert.throws(()=>execFileSync(process.execPath,[decodeURIComponent(bin.pathname).replace(/^\/(\w:)/,'$1'),...args],{encoding:'utf8',stdio:'pipe'}),error=>error.status===1);
 }
});
