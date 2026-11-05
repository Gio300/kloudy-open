// The existing engine owns membership, grants, persistence and replies.
export const roomOperations=['create','info','send','receipt','inbox','reply','interrupt','close'];
const id={type:'string',pattern:'^[A-Za-z0-9_.:-]{1,80}$'};
export const roomSchema={type:'object',required:['project','room_id'],additionalProperties:false,properties:{
 project:id,room_id:id,command_id:id,request_id:id,reply_id:id,participant_id:id,
 title:{type:'string',minLength:1,maxLength:120},
 participants:{type:'array',minItems:1,maxItems:4,items:{type:'object',required:['id','label','client_id'],additionalProperties:false,properties:{id,label:{type:'string',minLength:1,maxLength:120},client_id:id}}},
 recipients:{type:'array',minItems:1,maxItems:4,uniqueItems:true,items:id},
 generation:{type:'integer',minimum:0},after_sequence:{type:'integer',minimum:0},
 text:{type:'string',minLength:1,maxLength:4000},mode:{type:'string',enum:['direct','stored']},
}};
export const roomDescription='Uses existing room grants; no enrollment or provider call is implied. All operations need project and room_id. create adds command_id, title, participants (id, label, existing client_id). send adds request_id, generation, recipients, text, mode. receipt adds request_id. inbox adds participant_id, after_sequence. reply adds participant_id, request_id, reply_id, text. interrupt/close add command_id, generation. info adds nothing. Reuse IDs after uncertain delivery; never invent a reply or treat queued as delivered.';
export function roomParams(operation,value){
 if(!roomOperations.includes(operation)||!value||typeof value!=='object'||Array.isArray(value))throw Error('invalid_room_request');
 return value;
}
