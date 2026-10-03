import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';
import {withConnection} from '../src/connection.mjs';
test('connections in the same directory retain independent sessions for mixed strings',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'kloudy-sessions-'));
 try{
  const first=join(dir,'one.json'),second=join(dir,'two.json');
  await writeFile(first,JSON.stringify({endpoint:'https://engine.example/mcp',access_token:'fixture-one'}));
  await writeFile(second,JSON.stringify({endpoint:'https://engine.example/mcp',access_token:'fixture-two'}));
  for(const [file,id] of [[first,'session-one'],[second,'session-two']])await withConnection(file,async c=>{c.state.sessionId=id;c.state.interactionMode='autonomous';await c.save(c.state);});
  assert.equal(await withConnection(first,c=>c.session()),'session-one');assert.equal(await withConnection(second,c=>c.session()),'session-two');
  await withConnection(first,async()=>{await assert.rejects(()=>withConnection(first,()=>{}),e=>e.code==='connection_busy');assert.equal(await withConnection(second,c=>c.session()),'session-two');});
 }finally{await rm(dir,{recursive:true,force:true});}
});
