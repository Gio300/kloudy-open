import test from 'node:test';
import assert from 'node:assert/strict';
import {adaptMcp} from '../src/hosted.mjs';

test('hosted initialization retains actual engine event support independently of catalog rollout',()=>{
  for(const autoupdate of ['off','meta','notify']){
    const engine={protocolVersion:'2025-06-18',capabilities:{tools:{listChanged:false},events:{}},session_id:'owned'};
    const initialized=adaptMcp({method:'initialize'},{autoupdate}).project(engine);
    assert.deepEqual(initialized.capabilities.events,{});
    assert.equal(initialized.capabilities.tools.listChanged,false);
    assert.equal(initialized.session_id,'owned');
    assert.deepEqual(engine.capabilities,{tools:{listChanged:false},events:{}});
  }
});

test('hosted adapter never invents event support when the engine omits it or returns a malformed capability',()=>{
  for(const events of [undefined,null,false,true,'enabled',[]]){
    const capabilities={tools:{},...(events===undefined?{}:{events})};
    assert.equal(Object.hasOwn(adaptMcp({method:'initialize'}).project({capabilities}).capabilities,'events'),false);
  }
});

test('event lifecycle keeps exact caller identity, callback and engine receipts without calling tools',()=>{
  const arguments_={room_id:'owned-room',participant_id:'selected-participant'};
  for(const [method,params,result] of [
    ['events/list',{}, {events:[]}],
    ['events/subscribe',{name:'message.created',arguments:arguments_,delivery:{mode:'webhook',url:'https://callback.example/selected',secret:'whsec_'+Buffer.alloc(32,1).toString('base64')},cursor:null,ttlMs:60000},{id:'sub-owned',refreshBefore:'2026-11-05T12:00:00Z',cursor:null,truncated:false}],
    ['events/unsubscribe',{name:'message.created',arguments:arguments_,delivery:{mode:'webhook',url:'https://callback.example/selected'}},{}],
  ]){
    const request={jsonrpc:'2.0',id:method,method,params};
    const adapted=adaptMcp(request);
    assert.deepEqual(adapted.upstream,request);
    assert.deepEqual(adapted.project(result),result);
  }
});
