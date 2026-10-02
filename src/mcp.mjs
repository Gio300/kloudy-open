import {Server} from '@modelcontextprotocol/sdk/server/index.js';
import {StdioServerTransport} from '@modelcontextprotocol/sdk/server/stdio.js';
import {ListToolsRequestSchema,CallToolRequestSchema,ListPromptsRequestSchema,GetPromptRequestSchema} from '@modelcontextprotocol/sdk/types.js';
import {fileURLToPath} from 'node:url';
import {introduce,isAttachIntent} from './introduce.mjs';
import {withConnection} from './connection.mjs';
const gateway={name:'kloudy',description:'For Kloudy or /kloudy alone, use introduce to greet this project and ask one install question. Select one tool through the same engine. Autonomous by default; the IDE permission system controls tool calls and the engine enforces authorization.',inputSchema:{type:'object',properties:{operation:{type:'string',enum:['introduce','decline','ask','assemble','call','status','cancel']},goal:{type:'string'},selection_ids:{type:'array',items:{type:'string'},minItems:1,maxItems:16,uniqueItems:true},selection_id:{type:'string'},name:{type:'string'},arguments:{type:'object'},candidates:{type:'array',maxItems:16,items:{type:'object'}},lane:{type:'string',enum:['non_medical','medical']}},additionalProperties:false}};
export function createMcpServer({useClient,greet=introduce}){
  const server=new Server({name:'kloudy',version:'0.3.1'},{capabilities:{tools:{listChanged:true},prompts:{}},instructions:'When the user says Kloudy or /kloudy, use operation introduce. Return the current project greeting, not another project status. Ask one install/connect question. Respect a no answer and the host permission ceiling.'});
  async function greeting(decision){let project=process.env.CLAUDE_PROJECT_DIR||process.cwd();try{const roots=await server.listRoots();if(roots.roots?.[0]?.uri?.startsWith('file:'))project=fileURLToPath(roots.roots[0].uri);}catch{}return greet({project,decision});}
  server.setRequestHandler(ListPromptsRequestSchema,async()=>({prompts:[{name:'kloudy',description:'Introduce Kloudy for the current project and offer one user-level install.'}]}));
  server.setRequestHandler(GetPromptRequestSchema,async request=>{if(request.params.name!=='kloudy')throw Error('Unknown prompt');const result=await greeting();return {description:'Ask for Kloudy',messages:[{role:'assistant',content:{type:'text',text:JSON.stringify(result)}}]};});
  server.setRequestHandler(ListToolsRequestSchema,async()=>{
    let selected;try{selected=await useClient(client=>client.state.selection?.tool);}catch{}
    return {tools:[gateway,...(selected?[{...selected,name:'selected_'+selected.name}]:[])]};
  });
  server.setRequestHandler(CallToolRequestSchema,async request=>{
    try{
      const supplied=request.params.arguments||{};
      if(request.params.name==='kloudy'&&(!supplied.operation||supplied.operation==='introduce'||supplied.operation==='decline'||supplied.operation==='ask'&&isAttachIntent(supplied.goal))){const result=await greeting(supplied.operation==='decline'?'no':undefined);return {content:[{type:'text',text:JSON.stringify(result)}],structuredContent:result};}
      const result=await useClient(async client=>{
        const input=request.params.arguments||{};
        if(request.params.name.startsWith('selected_'))return client.call(request.params.name.slice(9),input);
        if(request.params.name!=='kloudy')throw new Error('Unknown tool');
        if(input.operation==='ask')return client.ask(input.goal,{candidates:input.candidates||[],lane:input.lane||'non_medical'});
        if(input.operation==='assemble'){if(!client.assemble)throw Error('Assembly requires an HTTPK connection');return client.assemble(input.selection_ids);}
        if(input.operation==='call'){if(!client.assemble||!input.selection_id)throw Error('Exact HTTPK selection required');return client.call(input.name,input.arguments,{selectionId:input.selection_id});}
        if(input.operation==='status')return client.status();
        if(input.operation==='cancel')return client.decide('cancel');
        throw new Error('Unsupported operation');
      });
      // Prompt the host to fetch the newly selected singular tool, not a server dump.
      server.sendToolListChanged().catch(()=>{});
      return {content:[{type:'text',text:JSON.stringify(result)}],structuredContent:result};
    }catch(error){return {isError:true,content:[{type:'text',text:JSON.stringify({error:error.code||'request_failed',message:error.code?error.message:'The tool request could not be completed.'})}]};}
  });
  return server;
}
export async function serveMcp(connection){const server=createMcpServer({useClient:work=>withConnection(connection,work),greet:options=>introduce({...options,connection})});await server.connect(new StdioServerTransport());return server;}
