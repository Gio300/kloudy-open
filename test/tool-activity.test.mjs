import test from 'node:test';import assert from 'node:assert/strict';import {instrumentToolHandler} from '../src/activity.mjs';
test('MCP activity follows overlapping real calls without exposing arguments',async()=>{
 const events=[],done=[];const handler=instrumentToolHandler(()=>new Promise(r=>done.push(r)),e=>events.push(e));const a=handler({secret:'never-report'}),b=handler({secret:'never-report'});done[0]({});await a;assert.equal(events.at(-1).state,'thinking');done[1]({});await b;assert.equal(events.at(-1).state,'idle');assert.ok(!JSON.stringify(events).includes('never-report'));
});
test('failed calls signal error and broken observers cannot prevent execution',async()=>{
 const states=[];await assert.rejects(instrumentToolHandler(async()=>{throw Error('failure');},e=>states.push(e.state))({}));assert.deepEqual(states,['thinking','error']);assert.deepEqual(await instrumentToolHandler(async()=>({ok:true}),()=>{throw Error();})({}),{ok:true});
});
