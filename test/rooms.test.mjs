import test from 'node:test';
import assert from 'node:assert/strict';
import {adaptMcp,hostedDoor} from '../src/hosted.mjs';
import {roomParams} from '../src/rooms.mjs';

test('the existing Kloudy tool exposes exact room fields without another CLI or tool',()=>{
 assert.equal(hostedDoor.name,'kloudy');
 assert.ok(hostedDoor.inputSchema.properties.operation.enum.includes('room'));
 assert.deepEqual(hostedDoor.inputSchema.properties.room_operation.enum,['create','info','send','receipt','inbox','reply','interrupt','close']);
 const schema=hostedDoor.inputSchema.properties.room;
 assert.equal(schema.additionalProperties,false);
 assert.deepEqual(schema.required,['project','room_id']);
 assert.equal(schema.properties.participants.maxItems,4);
 assert.deepEqual(schema.properties.participants.items.required,['id','label','client_id']);
});

test('room calls retain exact IDs, recipient bindings, generation and engine receipt',()=>{
 const bodies={
  create:{command_id:'create',title:'Room',participants:[{id:'first',label:'First',client_id:'existing-client'}]},
  info:{},send:{request_id:'m1',generation:3,recipients:['first'],text:'Exact user text',mode:'direct'},
  receipt:{request_id:'m1'},inbox:{participant_id:'first',after_sequence:0},
  reply:{participant_id:'first',request_id:'m1',reply_id:'reply1',text:'Exact reply'},
  interrupt:{command_id:'interrupt',generation:3},close:{command_id:'close',generation:4},
 };
 for(const [operation,body] of Object.entries(bodies)){
  const room={project:'owned',room_id:'room',...body};
  const adapter=adaptMcp({jsonrpc:'2.0',id:7,method:'tools/call',params:{name:'kloudy',arguments:{operation:'room',room_operation:operation,room}}});
  assert.deepEqual(adapter.upstream,{jsonrpc:'2.0',id:7,method:'kloudy/room/'+operation,params:room});
  const receipt={room_id:'room',request_id:'m1',deliveries:[{participant_id:'first',state:'queued',reply:null}]};
  assert.deepEqual(adapter.project(receipt).structuredContent,receipt);
  assert.deepEqual(JSON.parse(adapter.project(receipt).content[0].text),receipt);
 }
});

test('room wrapper rejects unknown operations without inventing defaults or granting access',()=>{
 for(const operation of ['join-provider','approve','subscribe',undefined])assert.throws(()=>roomParams(operation,{}),/invalid_room_request/);
 for(const body of [null,[],true,'room'])assert.throws(()=>roomParams('send',body),/invalid_room_request/);
});
