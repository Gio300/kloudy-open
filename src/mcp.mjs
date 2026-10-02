import {Server} from '@modelcontextprotocol/sdk/server/index.js';
import {StdioServerTransport} from '@modelcontextprotocol/sdk/server/stdio.js';
import {ListToolsRequestSchema,CallToolRequestSchema} from '@modelcontextprotocol/sdk/types.js';
import {withConnection} from './connection.mjs';
const gateway={name:'kloudy',description:'Ask for Kloudy. Select one tool through the same engine. Autonomous by default; the IDE permission system controls tool calls and the engine enforces authorization.',inputSchema:{type:'object',properties:{operation:{type:'string',enum:['ask','status','cancel']},goal:{type:'string'},candidates:{type:'array',maxItems:16,items:{type:'object'}},lane:{type:'string',enum:['non_medical','medical']}},required:['operation'],additionalProperties:false}};
export function createMcpServer({useClient}){
  const server=new Server({name:'kloudy',version:'0.2.0'},{capabilities:{tools:{listChanged:true}}});
  server.setRequestHandler(ListToolsRequestSchema,async()=>{
    let selected;try{selected=await useClient(client=>client.state.selection?.tool);}catch{}
    return {tools:[gateway,...(selected?[{...selected,name:'selected_'+selected.name}]:[])]};
  });
  server.setRequestHandler(CallToolRequestSchema,async request=>{
    try{
      const result=await useClient(async client=>{
        const input=request.params.arguments||{};
        if(request.params.name.startsWith('selected_'))return client.call(request.params.name.slice(9),input);
        if(request.params.name!=='kloudy')throw new Error('Unknown tool');
        if(input.operation==='ask')return client.ask(input.goal,{candidates:input.candidates||[],lane:input.lane||'non_medical'});
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
export async function serveMcp(connection){const server=createMcpServer({useClient:work=>withConnection(connection,work)});await server.connect(new StdioServerTransport());return server;}
