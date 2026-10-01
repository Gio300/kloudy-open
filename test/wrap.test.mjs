import test from 'node:test';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {createWrapper} from '../src/wrap.mjs';
const token='test-only-wrapper-token-123456789';
test('real HTTP/stdio round trip exposes only selected tools, denies other tools and cleanly handles upstream crash',async()=>{
 const server=createWrapper({command:process.execPath,args:[fileURLToPath(new URL('./upstream-fixture.mjs',import.meta.url))],tools:['echo','crash'],token,timeout:5000});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const url=`http://127.0.0.1:${server.address().port}/mcp`;
 const call=(body,extra={})=>fetch(url,{method:'POST',headers:{'content-type':'application/json',accept:'application/json, text/event-stream',authorization:'Bearer '+token,...extra},body:JSON.stringify({jsonrpc:'2.0',id:1,...body})});
 try{
  assert.equal((await call({method:'tools/list'},{authorization:''})).status,401);
  assert.equal((await call({method:'tools/list'},{authorization:'Bearer invalid'})).status,401);
  assert.equal((await call({method:'tools/list'},{origin:'https://attacker.example'})).status,403);
  const init=await call({method:'initialize',params:{protocolVersion:'2025-11-25',capabilities:{},clientInfo:{name:'test',version:'1'}}});assert.equal(init.status,200);assert.equal((await init.json()).result.serverInfo.name,'kloudy-httpk');
  const list=await call({method:'tools/list'});assert.equal(list.status,200);assert.deepEqual((await list.json()).result.tools.map(t=>t.name),['echo','crash']);
  const result=await call({method:'tools/call',params:{name:'echo',arguments:{text:'selected tool works'}}});assert.equal(result.status,200);assert.equal((await result.json()).result.content[0].text,'selected tool works');
  assert.equal((await call({method:'tools/call',params:{name:'not_selected'}})).status,403);
  const crash=await call({method:'tools/call',params:{name:'crash'}});assert.equal(crash.status,502);assert.deepEqual(await crash.json(),{error:'upstream_unavailable'});
 }finally{await new Promise(resolve=>server.close(resolve));}
});
