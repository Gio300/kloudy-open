import test from 'node:test';import assert from 'node:assert/strict';import {Approvals} from '../src/approval.mjs';
test('inline approval hides engine token, binds exact selection and blocks expiry/replays/wrong order',async()=>{
 let time=1000;const approvals=new Approvals({now:()=>time}),calls=[];const client={confirm:async input=>{calls.push(input);return {state:'running'};}};
 const pending={state:'awaiting_approval',approval:{token:'engine-token',summary:'Save the chosen note',risk_tier:'mutation',expires_at:60}};
 const result=approvals.present(pending,'chosen-selection');assert.ok(!JSON.stringify(result.content).includes('engine-token'));assert.ok(!JSON.stringify(result.structuredContent).includes('engine-token'));const input={ticket:result._meta.kloudyApproval.ticket,decision:'approve'};
 await assert.rejects(()=>approvals.decide({ticket:'wrong',decision:'approve'},fn=>fn(client)));assert.equal(calls.length,0);
 await approvals.decide(input,fn=>fn(client));assert.deepEqual(calls[0],{selectionId:'chosen-selection',token:'engine-token',decision:'approve',source:'tap'});await assert.rejects(()=>approvals.decide(input,fn=>fn(client)));assert.equal(calls.length,1);
 const expiring=approvals.present(pending,'second');time=61000;await assert.rejects(()=>approvals.decide({ticket:expiring._meta.kloudyApproval.ticket,decision:'approve'},fn=>fn(client)));assert.equal(calls.length,1);assert.equal(approvals.present(pending,'x').isError,true);
});
test('incomplete approvals never render an actionable ticket',()=>{const a=new Approvals();assert.equal(a.present({state:'awaiting_approval'},'x').isError,true);});
test('mixed-source approval returns to its bound connection, never the default connection',async()=>{
 const a=new Approvals(),calls=[];
 const result=a.present({state:'awaiting_approval',approval:{token:'source-token',summary:'Exact action',risk_tier:'high',expires_at:Date.now()/1000+60}},'source-selection',work=>work({confirm:async input=>{calls.push(input);return {state:'running'};}}));
 assert.ok(!JSON.stringify(result.content).includes('source-token'));
 await a.decide({ticket:result._meta.kloudyApproval.ticket,decision:'approve'},()=>assert.fail('Wrong source connection'));
 assert.equal(calls[0].selectionId,'source-selection');assert.equal(calls.length,1);
});
