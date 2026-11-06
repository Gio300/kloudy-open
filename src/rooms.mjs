// The existing engine owns membership, grants, persistence and replies.
export const roomOperations=['readiness','create','info','send','receipt','inbox','reply','interrupt','close'];
const id={type:'string',pattern:'^[A-Za-z0-9_.:-]{1,80}$'};
const member={type:'object',required:['id','label','client_id'],additionalProperties:false,properties:{id,label:{type:'string',minLength:1,maxLength:120},client_id:id}};
const readinessMember={type:'object',required:['id','client_id'],additionalProperties:false,properties:{id,client_id:id}};
// Keep the existing conservative public four-participant ceiling. This client
// extension does not assert that a hosted ten-participant rollout occurred.
const messageSchema={type:'object',required:['project','room_id'],additionalProperties:false,properties:{
 project:id,room_id:id,command_id:id,request_id:id,reply_id:id,participant_id:id,
 title:{type:'string',minLength:1,maxLength:120},
 participants:{type:'array',minItems:1,maxItems:4,items:member},
 recipients:{type:'array',minItems:1,maxItems:4,uniqueItems:true,items:id},
 generation:{type:'integer',minimum:0},after_sequence:{type:'integer',minimum:0},
 text:{type:'string',minLength:1,maxLength:4000},mode:{type:'string',enum:['direct','stored']},
}};
export const roomSchema={anyOf:[messageSchema,{type:'object',required:['project','participants'],additionalProperties:false,properties:{project:id,participants:{type:'array',minItems:1,maxItems:4,items:readinessMember}}}]};
export const roomDescription='Uses existing room grants; no enrollment or provider call is implied. readiness needs only project and participants (id, existing client_id); it checks mailbox authority, never provider ingress. Other operations need project and room_id. create adds command_id, title, participants (id, label, existing client_id). send adds request_id, generation, recipients, text, mode. receipt adds request_id. inbox adds participant_id, after_sequence. reply adds participant_id, request_id, reply_id, text. interrupt/close add command_id, generation. info adds nothing. Reuse IDs after uncertain delivery; never invent a reply or treat queued as delivered.';
const bad=()=>{throw Error('invalid_room_request');};
const plain=value=>value&&typeof value==='object'&&!Array.isArray(value);
const exact=(value,keys)=>{if(!plain(value)||Object.keys(value).length!==keys.length||keys.some(key=>!Object.hasOwn(value,key)))bad();};
const identifier=value=>typeof value==='string'&&value.length>=1&&value.length<=80&&!/[^A-Za-z0-9_.:-]/.test(value);
const integer=value=>Number.isSafeInteger(value)&&value>=0;
const text=(value,max)=>typeof value==='string'&&value.length<=max*2&&value.trim().length>0&&[...value].length<=max&&Buffer.byteLength(value,'utf8')<=6000&&Buffer.from(value).toString('utf8')===value;
const fields={readiness:['participants'],create:['command_id','title','participants'],info:[],send:['request_id','generation','recipients','text','mode'],receipt:['request_id'],inbox:['participant_id','after_sequence'],reply:['participant_id','request_id','reply_id','text'],interrupt:['command_id','generation'],close:['command_id','generation']};
const snapshot=value=>{const encoded=JSON.stringify(value);if(Buffer.byteLength(encoded,'utf8')>7600)bad();return JSON.parse(encoded);};
export function roomParams(operation,value){
 if(!roomOperations.includes(operation))bad();
 exact(value,['project',...(operation==='readiness'?[]:['room_id']),...fields[operation]]);
 for(const key of ['project','room_id','command_id','request_id','reply_id','participant_id'])if(Object.hasOwn(value,key)&&!identifier(value[key]))bad();
 for(const key of ['generation','after_sequence'])if(Object.hasOwn(value,key)&&!integer(value[key]))bad();
 if(Object.hasOwn(value,'title')&&!text(value.title,120)||Object.hasOwn(value,'text')&&!text(value.text,4000))bad();
 if(operation==='send'&&!['direct','stored'].includes(value.mode))bad();
 if(Object.hasOwn(value,'participants')){
  if(!Array.isArray(value.participants)||value.participants.length<1||value.participants.length>4)bad();
  for(const participant of value.participants){
   exact(participant,operation==='readiness'?['id','client_id']:['id','label','client_id']);
   if(!identifier(participant.id)||!identifier(participant.client_id)||operation==='create'&&!text(participant.label,120))bad();
  }
  if(new Set(value.participants.map(x=>x.id)).size!==value.participants.length||new Set(value.participants.map(x=>x.client_id)).size!==value.participants.length)bad();
 }
 if(Object.hasOwn(value,'recipients')&&(!Array.isArray(value.recipients)||value.recipients.length<1||value.recipients.length>4||value.recipients.some(x=>!identifier(x))||new Set(value.recipients).size!==value.recipients.length))bad();
 return snapshot(value);
}

export function roomResult(operation,value,input){
 if(operation!=='readiness')return value;
 if(!plain(value)||value.version!==1||value.project!==input.project||value.authority_verified!==true||value.provider_ingress_verified!==false||
  !Array.isArray(value.participants)||value.participants.length!==input.participants.length||
  value.participants.some((participant,index)=>!plain(participant)||Object.keys(participant).length!==1||participant.id!==input.participants[index].id))
  throw Error('invalid_room_response');
 return {version:value.version,project:value.project,authority_verified:value.authority_verified,
  provider_ingress_verified:value.provider_ingress_verified,participants:value.participants.map(({id})=>({id}))};
}

/** Explicit authenticated SDK controls only. Callback URLs remain data for the
 * engine's authoritative DNS/TLS/SSRF verification; this client never fetches them. */
export function roomEventParams(operation,value={}){
 if(operation==='list'){exact(value,[]);return {};}
 if(!['subscribe','unsubscribe'].includes(operation)||!plain(value))bad();
 exact(value,['name','arguments','delivery',...(operation==='subscribe'&&Object.hasOwn(value,'cursor')?['cursor']:[]),...(operation==='subscribe'&&Object.hasOwn(value,'ttlMs')?['ttlMs']:[])]);
 if(value.name!=='message.created')bad();
 exact(value.arguments,['project','room_id','participant_id']);
 if(Object.values(value.arguments).some(x=>!identifier(x)))bad();
 exact(value.delivery,['mode','url',...(operation==='subscribe'?['secret']:[])]);
 const address=value.delivery.url;let url;try{url=new URL(address);}catch{bad();}
 if(value.delivery.mode!=='webhook'||typeof address!=='string'||address.length>2048||/[^\x21-\x7e]/.test(address)||url.protocol!=='https:'||url.username||url.password||url.hash)bad();
 if(operation==='subscribe'){
  if(Object.hasOwn(value,'cursor')&&value.cursor!==null)bad();
  if(Object.hasOwn(value,'ttlMs')&&(!Number.isSafeInteger(value.ttlMs)||value.ttlMs<1||value.ttlMs>3_600_000))bad();
  const secret=value.delivery.secret;
  if(typeof secret!=='string'||!secret.startsWith('whsec_')||secret.length>100)bad();
  const encoded=secret.slice(6),bytes=Buffer.from(encoded,'base64');
  if(bytes.length<24||bytes.length>64||bytes.toString('base64')!==encoded)bad();
 }
 return snapshot(value);
}
