import test from 'node:test';
import assert from 'node:assert/strict';
import {InMemoryTransport} from '@modelcontextprotocol/sdk/inMemory.js';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {createMcpServer} from '../src/mcp.mjs';
test('MCP advertises one entry then only the selected singular tool',async()=>{
 const engine={state:{},ask:async()=>{engine.state.selection={tool:{name:'chosen',description:'Selected engine tool',inputSchema:{type:'object',properties:{}}}};return {toolbox:{tools:[engine.state.selection.tool]}};},call:async(name)=>({state:'awaiting_approval',name})};
 const server=createMcpServer({useClient:work=>work(engine)}),client=new Client({name:'proof',version:'1'}),[left,right]=InMemoryTransport.createLinkedPair();
 try{
  await server.connect(left);await client.connect(right);assert.deepEqual((await client.listTools()).tools.map(t=>t.name),['kloudy']);
  await client.callTool({name:'kloudy',arguments:{operation:'ask',goal:'find a tool'}});
  assert.deepEqual((await client.listTools()).tools.map(t=>t.name),['kloudy','selected_chosen']);
  const result=await client.callTool({name:'selected_chosen',arguments:{}});assert.equal(result.structuredContent.state,'awaiting_approval');
  assert.equal((await client.callTool({name:'not-selected',arguments:{}})).isError,true);
 }finally{await client.close();await server.close();}
});
