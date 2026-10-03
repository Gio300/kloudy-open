import test from 'node:test';import assert from 'node:assert/strict';
import {observeClient} from '../src/activity.mjs';
test('real client results drive status without leaking tool names, arguments or credentials',async()=>{
 const events=[],receipt={state:'awaiting_approval',token:'not-for-display'};const client={secret:'private',async call(name,args){assert.equal(this.secret,'private');return receipt;},async status(){return {state:'completed'};}};
 const observed=observeClient(client,e=>events.push(e));assert.equal(await observed.call('secret-tool',{key:'private'}),receipt);await observed.status();
 assert.deepEqual(events.map(e=>e.state),['thinking','waiting','thinking','idle']);assert(!JSON.stringify(events).includes('private'));assert(!JSON.stringify(events).includes('token'));assert(events.every(Object.isFrozen));
});
test('display failures never repeat an action; exceptions restore activity',async()=>{
 let calls=0;const error=Error('Original');const observed=observeClient({async call(){calls++;throw error;}},()=>{throw Error('Display offline');});await assert.rejects(observed.call(),e=>e===error);assert.equal(calls,1);
});
test('overlapping reads do not clear the busy status prematurely',async()=>{
 let resolve;const events=[];const observed=observeClient({async query(){return new Promise(r=>resolve=r);},async status(){return {state:'completed'};}},e=>events.push(e));const first=observed.query();await observed.status();assert.equal(events.at(-1).state,'thinking');resolve({});await first;assert.equal(events.at(-1).state,'idle');
});
