import test from 'node:test';
import assert from 'node:assert/strict';
import {adaptMcp,hostedDoor} from '../src/hosted.mjs';
import {roomParams,roomResult,roomEventParams} from '../src/rooms.mjs';

test('the existing Kloudy tool exposes exact room fields without another CLI or tool',()=>{
 assert.equal(hostedDoor.name,'kloudy');
 assert.ok(hostedDoor.inputSchema.properties.operation.enum.includes('room'));
 assert.deepEqual(hostedDoor.inputSchema.properties.room_operation.enum,['readiness','create','info','send','receipt','inbox','reply','interrupt','close']);
 const [schema,readiness]=hostedDoor.inputSchema.properties.room.anyOf;
 assert.equal(schema.additionalProperties,false);
 assert.deepEqual(schema.required,['project','room_id']);
 assert.equal(schema.properties.participants.maxItems,4);
 assert.deepEqual(schema.properties.participants.items.required,['id','label','client_id']);
 assert.deepEqual(readiness.required,['project','participants']);
 assert.deepEqual(readiness.properties.participants.items.required,['id','client_id']);
 assert.equal(readiness.additionalProperties,false);
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

test('readiness uses exact existing participant clients without a room ID or created membership',()=>{
 const room={project:'owned',participants:[{id:'first',client_id:'existing-first'},{id:'second',client_id:'existing-second'}]};
 const request={jsonrpc:'2.0',id:8,method:'tools/call',params:{name:'kloudy',arguments:{operation:'room',room_operation:'readiness',room}}};
 const adapter=adaptMcp(request);
 assert.deepEqual(adapter.upstream,{jsonrpc:'2.0',id:8,method:'kloudy/room/readiness',params:room});
 const result={version:1,project:'owned',authority_verified:true,participants:[{id:'first'},{id:'second'}],provider_ingress_verified:false};
 assert.deepEqual(adapter.project(result).structuredContent,result);
 for(const bad of [{...room,room_id:'new-room'},{...room,owner:'someone'},{...room,participants:[{id:'first',label:'First',client_id:'existing-first'}]},
  {...room,participants:[{id:'first',client_id:'same'},{id:'second',client_id:'same'}]},
  {...room,participants:[{id:'same',client_id:'first'},{id:'same',client_id:'second'}]}])assert.throws(()=>roomParams('readiness',bad),/invalid_room_request/);
 for(const bad of [{...result,project:'foreign'},{...result,provider_ingress_verified:true},{...result,authority_verified:false},
  {...result,participants:[{id:'second'},{id:'first'}]},{...result,participants:[{id:'first'},{id:'first'}]}])assert.throws(()=>roomResult('readiness',bad,room),/invalid_room_response/);
});

test('room input bounds reject the complete call instead of dropping recipients or changing text',()=>{
 const send={project:'owned',room_id:'room',request_id:'request',generation:0,recipients:['first'],text:'Exact user text',mode:'stored'};
 for(const bad of [{...send,recipients:['first','first']},{...send,recipients:Array.from({length:5},(_,i)=>'peer-'+i)},
  {...send,text:'x'.repeat(4001)},{...send,text:'漢'.repeat(2001)},{...send,text:'\0'.repeat(2000)},
  {...send,project:'owned\n'},{...send,generation:1.5},{...send,mode:'approve'},{...send,permission:true},
  {...send,text:'bad\uD800text'}])assert.throws(()=>roomParams('send',bad),/invalid_room_request/);
 const params=roomParams('send',send);send.recipients.push('second');send.text='Changed';
 assert.deepEqual(params.recipients,['first']);assert.equal(params.text,'Exact user text');
});

test('event SDK controls are explicit exact bounded lifecycle calls with no replay cursor',()=>{
 const subscribe={name:'message.created',arguments:{project:'owned',room_id:'room',participant_id:'first'},
  delivery:{mode:'webhook',url:'https://callback.example/selected',secret:'whsec_'+Buffer.alloc(32,1).toString('base64')},cursor:null,ttlMs:60000};
 assert.deepEqual(roomEventParams('subscribe',subscribe),subscribe);assert.deepEqual(roomEventParams('list',{}),{});
 const unsubscribe={name:subscribe.name,arguments:subscribe.arguments,delivery:{mode:'webhook',url:subscribe.delivery.url}};
 assert.deepEqual(roomEventParams('unsubscribe',unsubscribe),unsubscribe);
 for(const bad of [{...subscribe,cursor:'replay'},{...subscribe,ttlMs:3_600_001},{...subscribe,ttlMs:0},
  {...subscribe,delivery:{...subscribe.delivery,secret:'not-a-secret'}},{...subscribe,delivery:{...subscribe.delivery,url:'http://callback.example'}},
  {...subscribe,delivery:{...subscribe.delivery,url:'https://user:password@callback.example'}},
  {...subscribe,delivery:{...subscribe.delivery,url:'https://callback.example/#fragment'}},
  {...subscribe,delivery:{...subscribe.delivery,url:'https://callback.example/'+'x'.repeat(2048)}},
  {...subscribe,arguments:{...subscribe.arguments,owner:'foreign'}}])assert.throws(()=>roomEventParams('subscribe',bad),/invalid_room_request/);
 assert.throws(()=>roomEventParams('unsubscribe',{...unsubscribe,cursor:null}),/invalid_room_request/);
 assert.throws(()=>roomEventParams('list',{subscribe:true}),/invalid_room_request/);
 assert.throws(()=>roomEventParams('reply',{}),/invalid_room_request/);
});
