import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,mkdir,readFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {InMemoryTransport} from '@modelcontextprotocol/sdk/inMemory.js';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {createMcpServer} from '../src/mcp.mjs';
import {introduce,isAttachIntent} from '../src/introduce.mjs';
import {install} from '../src/install.mjs';
test('clean workspace greeting names relevant catalog tools without reading secrets or needing a connection',async t=>{
 const home=await mkdtemp(join(tmpdir(),'kloudy-greeting-'));t.after(()=>rm(home,{recursive:true,force:true}));const project=join(home,'react-project');await mkdir(project);await writeFile(join(project,'package.json'),JSON.stringify({dependencies:{react:'19'}}));await writeFile(join(project,'.env'),'DO_NOT_READ=secret');let requested;
 const greeting=await introduce({project,home,fetcher:async url=>{requested=url;return Response.json({items:[{name:'Dendro React'}]});}});
 assert.equal(greeting.intent,'attach-and-introduce');assert.match(greeting.visual,/K L O U D Y/);assert.match(greeting.welcome,/Just type Kloudy/);assert.equal(greeting.project.kind,'React');assert.equal(greeting.tools[0].name,'Dendro React');assert.equal(greeting.tools[0].executable,false);assert.equal(greeting.question,'Do you want to install Kloudy?');assert.match(requested,/q=react$/);assert.doesNotMatch(JSON.stringify(greeting),/secret|Br0C0de|checkpoint/);
 assert.equal((await introduce({project:home,home,decision:'no',fetcher:()=>assert.fail('empty folder needs no catalog request')})).state,'chat_only');
 await install({home,ide:'cursor',platform:'linux'});const again=await introduce({project,home,fetcher:async()=>Response.json({items:[]})});assert.equal(again.question,null);assert.equal(again.requiresConsent,false);assert.match(again.usage.addressing,/without that prefix/);
 const attached=await introduce({project,home:project,hostAttached:true,fetcher:async()=>Response.json({items:[]})});assert.equal(attached.question,null);assert.equal(attached.state,'installed');assert.equal(attached.engineGreeting,'connection_unavailable');
 for(const phrase of ['Kloudy','/kloudy','KLOUDY.'])assert.equal(isAttachIntent(phrase),true);assert.equal(isAttachIntent('What is the status of a different project?'),false);
});
test('MCP attach intent and prompt greet before attempting a missing engine session',async()=>{
 const server=createMcpServer({useClient:()=>{throw Error('No engine credential');},greet:async({decision})=>({schema:'kloudy.attach/1',state:decision==='no'?'chat_only':'install_offered',introduction:'Kloudy',tools:[{name:'React tool',executable:false}]})});const client=new Client({name:'clean-ide',version:'1'}),[a,b]=InMemoryTransport.createLinkedPair();
 try{await server.connect(a);await client.connect(b);for(const args of [{},{operation:'introduce'},{operation:'ask',goal:'/kloudy'}]){const result=await client.callTool({name:'kloudy',arguments:args});assert.equal(result.structuredContent.state,'install_offered');assert.equal(result.isError,undefined);}assert.equal((await client.callTool({name:'kloudy',arguments:{operation:'decline'}})).structuredContent.state,'chat_only');assert.equal((await client.listPrompts()).prompts[0].name,'kloudy');assert.match((await client.getPrompt({name:'kloudy'})).messages[0].content.text,/install_offered/);}finally{await client.close();await server.close();}
});
test('global installers cover four IDEs, keep project files untouched and never embed bearer values',async t=>{
 const home=await mkdtemp(join(tmpdir(),'kloudy-user-'));t.after(()=>rm(home,{recursive:true,force:true}));const project=join(home,'project');await mkdir(project);await writeFile(join(project,'README.md'),'unchanged');await mkdir(join(home,'.codex'));await writeFile(join(home,'.codex/config.toml'),'# keep comment\nmodel = "existing"\n');
 for(const ide of ['cursor','claude','vscode','codex']){const result=await install({home,ide,platform:'linux',url:'https://kloudy.ai/mcp',tokenEnv:'KLOUDY_TEST_TOKEN'});assert.equal(result.scope,'user');const path=result.results[0].path;assert.ok(!path.startsWith(project));const content=await readFile(path,'utf8');assert.match(content,/KLOUDY_TEST_TOKEN/);assert.match(content,/https:\/\/kloudy.ai\/mcp/);assert.equal((await install({home,ide,platform:'linux',url:'https://kloudy.ai/mcp',tokenEnv:'KLOUDY_TEST_TOKEN'})).results[0].state,'already_installed');}
 assert.match(await readFile(join(home,'.codex/config.toml'),'utf8'),/# keep comment/);assert.equal(await readFile(join(project,'README.md'),'utf8'),'unchanged');assert.equal(JSON.parse(await readFile(join(home,'.kloudy/install.json'),'utf8')).ides.length,4);
 await assert.rejects(()=>install({home,ide:'codex',url:'https://secret@kloudy.ai/mcp'}),/without credentials/);
});
