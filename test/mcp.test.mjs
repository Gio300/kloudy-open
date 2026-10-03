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
  const result=await client.callTool({name:'selected_chosen',arguments:{}});assert.equal(result.isError,true);assert.match(result.content[0].text,/approval is missing or expired/);
  assert.equal((await client.callTool({name:'not-selected',arguments:{}})).isError,true);
 }finally{await client.close();await server.close();}
});
test('MCP Apps negotiates an inline resource and routes one exact approval without model-visible token',async()=>{
 const engine={state:{selection:{tool:{name:'chosen',inputSchema:{type:'object'}}}},call:async()=>({selection_id:'s1',state:'awaiting_approval',approval:{token:'exact-engine-token',summary:{operation:'Save note',destination:'Your Notes',inputs:{text:'test'}},risk_tier:'medium',expires_at:Date.now()/1000+60}}),confirm:async input=>{assert.equal(input.token,'exact-engine-token');assert.equal(input.selectionId,'s1');return {state:'running'};}};
 const server=createMcpServer({useClient:work=>work(engine)}),client=new Client({name:'inline-proof',version:'1'},{capabilities:{extensions:{'io.modelcontextprotocol/ui':{mimeTypes:['text/html;profile=mcp-app']}}}}),[left,right]=InMemoryTransport.createLinkedPair();
 try{await server.connect(left);await client.connect(right);const tools=(await client.listTools()).tools;assert.deepEqual(tools.find(t=>t.name==='kloudy_approval')._meta.ui.visibility,['app']);const resources=await client.listResources();const view=await client.readResource({uri:resources.resources[0].uri});assert.match(view.contents[0].text,/Action approval/);const pending=await client.callTool({name:'selected_chosen',arguments:{}});assert.ok(!JSON.stringify(pending.content).includes('exact-engine-token'));assert.equal(pending.structuredContent.summary.operation,'Save note');const args={ticket:pending._meta.kloudyApproval.ticket,decision:'approve'};assert.equal((await client.callTool({name:'kloudy_approval',arguments:args})).structuredContent.state,'running');assert.equal((await client.callTool({name:'kloudy_approval',arguments:args})).isError,true);}finally{await client.close();await server.close();}
});
