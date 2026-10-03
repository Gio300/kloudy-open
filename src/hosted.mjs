// Stateless MCP adapter for the engine's existing HTTPK methods.
// No grants, model decisions, retries, provider credentials or execution live here.
import {randomUUID} from 'node:crypto';
export const hostedDoor={name:'kloudy',description:'Ask for Kloudy. Start with introduce for Kloudy or /kloudy. Use ask to receive exactly one engine-selected tool and its exact arguments, assemble up to 16 owned selections into deduplicated tools, then call only the chosen exact selection. Status and cancel refer to that selection. Respect host permissions and exact engine approvals.',inputSchema:{type:'object',properties:{operation:{type:'string',enum:['introduce','ask','assemble','call','confirm','status','cancel']},goal:{type:'string',maxLength:500},project_context:{type:'object',properties:{languages:{type:'array',items:{type:'string'},maxItems:12},manifests:{type:'array',items:{type:'string'},maxItems:12}},required:['languages','manifests'],additionalProperties:false},selection_ids:{type:'array',items:{type:'string',minLength:1,maxLength:128},minItems:1,maxItems:16,uniqueItems:true},selection_id:{type:'string'},token:{type:'string',minLength:1,maxLength:512},revision:{type:'integer',minimum:0},decision:{type:'string',enum:['approve']},source:{type:'string',enum:['tap','typed','os-voice']},name:{type:'string'},arguments:{type:'object'}},required:['operation'],additionalProperties:false}};
const toolResult=result=>({content:[{type:'text',text:JSON.stringify(result)}],structuredContent:result});
export function adaptMcp(message){
 let upstream=message,project=x=>x;
 if(message.method==='initialize')project=x=>({...x,instructions:'One Kloudy tool. Call introduce when the user types Kloudy; ask returns one selected tool; call executes only its exact selection. The engine enforces grants and approval.',capabilities:{tools:{listChanged:false}}});
 if(message.method==='tools/list'&&!message.params?._meta?.selection_ids)project=()=>({tools:[hostedDoor]});
 if(message.method==='tools/call'&&message.params?.name==='kloudy'){
  const a=message.params.arguments||{},operation=a.operation||'introduce';
  let method,params;
  if(operation==='introduce'||operation==='ask'){
   method='kloudy/intent';params={idempotency_key:randomUUID(),input:{type:'text',text:operation==='introduce'?'Kloudy':a.goal,...(operation==='introduce'?{project_context:a.project_context||{languages:[],manifests:[]}}:{})}};
  }else if(operation==='assemble'){if(!Array.isArray(a.selection_ids)||!a.selection_ids.length||a.selection_ids.length>16||new Set(a.selection_ids).size!==a.selection_ids.length||a.selection_ids.some(id=>typeof id!=='string'||!id||id.length>128))throw Error('invalid_selection_ids');method='tools/list';params={_meta:{selection_ids:a.selection_ids}};}else if(operation==='call'){method='tools/call';params={name:a.name,arguments:a.arguments,_meta:{selection_id:a.selection_id}};}
  else if(operation==='confirm'){method='kloudy/confirm';params=confirmationParams(a);}
  else if(operation==='status'||operation==='cancel'){method=operation==='status'?'kloudy/receipt':'kloudy/cancel';params={selection_id:a.selection_id};}
  else throw Error('unsupported_operation');
  upstream={...message,method,params};project=operation==='call'?x=>x:toolResult;
 }
 return {upstream,project};
}

export function confirmationParams(a){
 if(typeof a.selection_id!=='string'||!a.selection_id||a.selection_id.length>128||a.decision!=='approve'||!['tap','typed','os-voice'].includes(a.source))throw Error('invalid_confirmation');
 const token=a.token!==undefined,revision=a.revision!==undefined;
 if(token===revision||token&&(typeof a.token!=='string'||!a.token||a.token.length>512)||revision&&(!Number.isSafeInteger(a.revision)||a.revision<0))throw Error('invalid_confirmation_binding');
 return {selection_id:a.selection_id,decision:a.decision,source:a.source,...(token?{token:a.token}:{revision:a.revision})};
}
