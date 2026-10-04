import test from 'node:test';
import assert from 'node:assert/strict';
import {renderReply} from '../src/replies.mjs';
test('templates use observed state and unknown never becomes success',()=>{
 assert.equal(renderReply('completed',{action:'Save note'}).text,'Save note — Completed.');
 for(const state of ['approved','__proto__','constructor','unverified'])assert.deepEqual(renderReply(state,{action:'Save note'}),{version:'kloudy.replies/1',status:'pending',text:'Save note — Status not confirmed.'});
 assert.equal(renderReply('awaiting_approval',{action:'Transfer'}).status,'approval');
});
test('slots are bounded, non-recursive, and cannot supply status or templates',()=>{
 assert.equal(renderReply('running',{action:'{action} $&'}).text,'{action} $& — Working.');
 for(const slots of [{action:'',state:'completed'},{action:'x'.repeat(161)},{action:'evil\nstatus'},{action:'valid',secret:'never'}])assert.throws(()=>renderReply('running',slots));
});
