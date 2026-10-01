// Explicit protocol test double, never a production tool or engine.
import {Server} from '@modelcontextprotocol/sdk/server/index.js';
import {StdioServerTransport} from '@modelcontextprotocol/sdk/server/stdio.js';
import {ListToolsRequestSchema,CallToolRequestSchema} from '@modelcontextprotocol/sdk/types.js';
const server=new Server({name:'test-only-upstream',version:'1.0.0'},{capabilities:{tools:{}}});
server.setRequestHandler(ListToolsRequestSchema,async()=>({tools:['echo','not_selected','crash'].map(name=>({name,description:'TEST ONLY '+name,inputSchema:{type:'object',properties:{text:{type:'string'}}}}))}));
server.setRequestHandler(CallToolRequestSchema,async request=>{
 if(request.params.name==='crash')process.exit(1);
 return {content:[{type:'text',text:String(request.params.arguments.text)}]};
});
await server.connect(new StdioServerTransport());
