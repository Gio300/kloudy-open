import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,readdir} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join,dirname} from 'node:path';
import {parse as toml} from 'smol-toml';import {parse} from 'jsonc-parser';
import {editorPaths,installEditors,REMOTE,healable} from '../src/editor-install.mjs';
const fixture=async platform=>{const home=await mkdtemp(join(tmpdir(),'kloudy-editors-'));return {home,hosts:editorPaths({home,platform,appData:join(home,'Roaming'),xdg:join(home,'.config'),codexHome:join(home,'.codex')})};};
test('all six clients merge without losing other settings across Windows, macOS and Linux layouts',async()=>{
 for(const platform of ['win32','darwin','linux']){
  const {hosts}=await fixture(platform);for(const h of hosts){await mkdir(dirname(h.file),{recursive:true});await writeFile(h.file,h.toml?'# keep comment\nmodel = "user-choice"\n[mcp_servers.other]\nurl = "https://example.com/mcp"\n':JSON.stringify({[h.key]:{other:{command:'keep'}},setting:42}));}
  const asked=[];const results=await installEditors({hosts,confirm:async p=>{asked.push(p.client);return true;}});assert.equal(asked.length,6);assert.ok(results.every(r=>r.state==='configured'));
  for(const h of hosts){const text=await readFile(h.file,'utf8'),v=h.toml?toml(text):JSON.parse(text);assert.ok(v[h.key].other);assert.equal(h.toml?v.model:v.setting,h.toml?'user-choice':42);const k=v[h.key].kloudy;assert.equal(k.url||k.serverUrl||REMOTE,REMOTE);if(h.stdio)assert.deepEqual(k.args,['-y','kloudy@latest','mcp']);}
  assert.ok((await installEditors({hosts,confirm:()=>{throw Error('Should not reprompt');}})).every(r=>r.state==='existing_kloudy_preserved'));
 }
});
test('decline, malformed config, and an existing Kloudy entry never change a file',async()=>{
 const {hosts}=await fixture('linux');for(const [i,h] of hosts.entries()){await mkdir(dirname(h.file),{recursive:true});await writeFile(h.file,i===0?'not json':h.toml?'[mcp_servers.kloudy]\nurl="https://user.example/mcp"':JSON.stringify({[h.key]:{kloudy:{url:'https://user.example/mcp'}}}));}
 const before=await Promise.all(hosts.map(h=>readFile(h.file,'utf8')));await installEditors({hosts,confirm:async()=>false});assert.deepEqual(await Promise.all(hosts.map(h=>readFile(h.file,'utf8'))),before);
});
test('JSONC comments survive; a race during consent is preserved; key stays out of reports',async()=>{
 const {hosts}=await fixture('linux');const h=hosts.find(h=>h.id==='vscode');await mkdir(dirname(h.file),{recursive:true});await writeFile(h.file,'{\n// editor comment\n"servers": {},\n}');const key='private-test-key-never-log-12345';
 const results=await installEditors({hosts:[h],key,confirm:async()=>true});assert.equal(results[0].state,'configured');const text=await readFile(h.file,'utf8');assert.match(text,/editor comment/);assert.equal(parse(text).servers.kloudy.headers.Authorization,'Bearer '+key);assert.ok(!JSON.stringify(results).includes(key));
 const other=hosts[0];await mkdir(dirname(other.file),{recursive:true});await writeFile(other.file,'{}');const race=await installEditors({hosts:[other],confirm:async()=>{await writeFile(other.file,'{"new":"user edit"}');return true;}});assert.equal(race[0].state,'unchanged_error');assert.equal(await readFile(other.file,'utf8'),'{"new":"user edit"}');assert.ok(!(await readdir(dirname(other.file))).some(f=>f.endsWith('kloudy-lock')));
});
test('a clean home is a no-op; default consent never writes',async()=>{
 const {hosts}=await fixture('linux');assert.deepEqual(await installEditors({hosts}),[]);await mkdir(dirname(hosts[0].file),{recursive:true});assert.equal((await installEditors({hosts}))[0].state,'declined');
});

test('frozen cache and pinned commands heal only after consent with backups and no stale locks',async()=>{
 const {hosts}=await fixture('linux');
 for(const h of hosts){
  const frozen=h.toml?{command:'npx',args:['-y','kloudy@0.4.3','mcp']}:{command:'C:\\Program Files\\nodejs\\node.exe',args:['C:\\cache\\_npx\\hash\\node_modules\\kloudy\\bin\\kloudy.mjs','mcp']};
  assert.equal(healable(frozen),true);await mkdir(dirname(h.file),{recursive:true});
  const before=h.toml?'# keep\nmodel="user"\n[mcp_servers.kloudy]\ncommand="npx"\nargs=["-y","kloudy@0.4.3","mcp"]\n[mcp_servers.other]\nurl="https://other.example/mcp"\n':JSON.stringify({[h.key]:{kloudy:frozen,other:{command:'keep'}}});
  await writeFile(h.file,before);
  assert.equal((await installEditors({hosts:[h],confirm:async()=>false}))[0].state,'declined');assert.equal(await readFile(h.file,'utf8'),before);
  let asked=false;const results=await installEditors({hosts:[h],confirm:async()=>{asked=true;assert.equal(await readFile(h.file,'utf8'),before);return true;}});
  assert.equal(asked,true);assert.equal(results[0].state,'healed');
  const after=await readFile(h.file,'utf8'),value=h.toml?toml(after):JSON.parse(after);assert.ok(value[h.key].other);
  assert.deepEqual({...value[h.key].kloudy},h.stdio?{command:'npx',args:['-y','kloudy@latest','mcp']}:{...(['vscode','claude-code'].includes(h.id)?{type:'http'}:{}),[h.id==='windsurf'?'serverUrl':'url']:REMOTE});
  const files=await readdir(dirname(h.file));const backups=files.filter(f=>f.startsWith(h.file.split(/[\\/]/).at(-1)+'.kloudy-backup-'));assert.equal(backups.length,1);assert.equal(await readFile(join(dirname(h.file),backups[0]),'utf8'),before);assert.ok(!files.some(f=>f.endsWith('.kloudy-lock')||f.endsWith('.tmp')));
  if(h.toml)assert.match(after,/# keep/);
 }
});
test('custom options, unrelated commands and occupied locks are preserved',async()=>{
 for(const entry of [{command:'my-wrapper',args:['kloudy@0.4.3','mcp']},{command:'node',args:['/other/bin/kloudy.mjs','mcp']},{command:'npx',args:['-y','kloudy@0.4.3','mcp','--custom']},{command:'npx',args:['-y','kloudy@0.4.3','mcp'],env:{MY_CUSTOM:'keep'}},{command:'npx',args:['-y','kloudy@latest','mcp']}])assert.equal(healable(entry),false);
 const {hosts}=await fixture('linux'),h=hosts[0];await mkdir(dirname(h.file),{recursive:true});const before=JSON.stringify({mcpServers:{kloudy:{command:'npx',args:['-y','kloudy@0.4.3','mcp']}}});await writeFile(h.file,before);await writeFile(h.file+'.kloudy-lock','other installer');
 assert.equal((await installEditors({hosts:[h],confirm:async()=>true}))[0].state,'unchanged_error');assert.equal(await readFile(h.file,'utf8'),before);assert.equal(await readFile(h.file+'.kloudy-lock','utf8'),'other installer');
});

test('a Codex frozen table can heal with an approved key while other tables stay intact',async()=>{
 const {hosts}=await fixture('linux'),h=hosts.find(h=>h.toml);await mkdir(dirname(h.file),{recursive:true});await writeFile(h.file,'[mcp_servers.kloudy]\ncommand="npx"\nargs=["-y","kloudy@0.4.3","mcp"]\n[mcp_servers.other]\nurl="https://other.example/mcp"\n');
 const key='test-only-approved-key-12345';assert.equal((await installEditors({hosts:[h],key,confirm:async()=>true}))[0].state,'healed');const parsed=toml(await readFile(h.file,'utf8'));assert.equal(parsed.mcp_servers.kloudy.http_headers.Authorization,'Bearer '+key);assert.equal(parsed.mcp_servers.other.url,'https://other.example/mcp');
});
