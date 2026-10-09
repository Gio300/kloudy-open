import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,mkdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {install} from '../src/install.mjs';
test('IDE installation preserves other servers, adds one Kloudy and is repeatable',async()=>{
 const root=await mkdtemp(join(tmpdir(),'kloudy-install-'));
 try{
  await mkdir(join(root,'.cursor'));const file=join(root,'.cursor/mcp.json');await writeFile(file,JSON.stringify({mcpServers:{existing:{command:'unchanged'}},other:true}));
  const first=await install({home:root,platform:"linux",appData:undefined});assert.equal(first.results.length,1);assert.equal(first.results[0].state,'installed');
  const config=JSON.parse(await readFile(file,'utf8'));assert.equal(config.mcpServers.existing.command,'unchanged');assert.equal(config.other,true);assert.deepEqual(config.mcpServers.kloudy,{url:'https://kloudy.ai/mcp'});assert.deepEqual(Object.keys(config.mcpServers),['existing','kloudy']);
  assert.equal((await install({home:root,platform:"linux",appData:undefined})).results[0].state,'already_installed');
  config.mcpServers.kloudy={command:'user-choice'};await writeFile(file,JSON.stringify(config));assert.equal((await install({home:root,platform:"linux",appData:undefined})).results[0].state,'existing_kloudy_preserved');
  assert.equal(JSON.parse(await readFile(file,'utf8')).mcpServers.kloudy.command,'user-choice');
 }finally{await rm(root,{recursive:true,force:true});}
});

test('legacy connection installations use latest npx without a local Node or cache path',async()=>{
 const home=await mkdtemp(join(tmpdir(),'kloudy-connection-install-'));
 try{await install({ide:'cursor',home,connection:join(home,'private.json')});const config=JSON.parse(await readFile(join(home,'.cursor/mcp.json'),'utf8'));assert.deepEqual(config.mcpServers.kloudy,{command:'npx',args:['-y','kloudy@latest','legacy','mcp','--connection',join(home,'private.json')]});}finally{await rm(home,{recursive:true,force:true});}
});
