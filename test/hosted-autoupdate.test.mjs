import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {adaptMcp,hostedDoor,hostedInstructions,hostedCatalog} from '../src/hosted.mjs';
const baseline=JSON.parse(readFileSync(new URL('./fixtures/hosted-flags-off.json',import.meta.url),'utf8'));
test('hosted flags off retain byte-identical initialize, tool listing and door from 17b5dd8',()=>{
 for(const mode of [undefined,'off','invalid']){
  const options=mode?{autoupdate:mode}:{};
  assert.equal(JSON.stringify(adaptMcp({method:'initialize'},options).project(baseline.upstream)),baseline.initialize);
  assert.equal(JSON.stringify(adaptMcp({method:'tools/list'},options).project({tools:[]})),baseline.toolsList);
 }
 assert.equal(JSON.stringify(hostedDoor),baseline.door);
});
test('hosted opt-in honors upstream listChanged including false and merges metadata',()=>{
 for(const upstreamValue of [true,false,undefined]){
  const value={...baseline.upstream,capabilities:{tools:{...(upstreamValue===undefined?{}:{listChanged:upstreamValue})}}};
  const init=adaptMcp({method:'initialize'},{autoupdate:'meta'}).project(value);
  assert.equal(init.capabilities.tools.listChanged,upstreamValue??true);assert.equal(init._meta.retained,true);assert.deepEqual(init._meta['ai.kloudy/catalog'],hostedCatalog);
  const list=adaptMcp({method:'tools/list'},{autoupdate:'notify'}).project({});assert.deepEqual(list.tools,[hostedDoor]);assert.deepEqual(list._meta['ai.kloudy/catalog'],hostedCatalog);
 }
 const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(k=>[k,canonical(value[k])])):value;
 const hash=createHash('sha256').update(JSON.stringify(canonical({tools:[hostedDoor],instructions:hostedInstructions}))).digest('hex').slice(0,12);assert.equal(hostedCatalog.version,hash);
});
