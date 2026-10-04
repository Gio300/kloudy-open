import {mkdtemp,mkdir,writeFile,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {pathToFileURL} from 'node:url';
import {execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
const version='0.4.1',root=await mkdtemp(join(tmpdir(),'kloudy-published-'));
const home=join(root,'profile'),cache=join(root,'cache');await mkdir(home);
const env={...process.env,USERPROFILE:home,APPDATA:join(home,'AppData','Roaming'),LOCALAPPDATA:join(home,'AppData','Local'),CODEX_HOME:join(home,'.codex'),NPM_CONFIG_CACHE:cache};
delete env.NPM_TOKEN;delete env.KLOUDY_MCP_TOKEN;delete env.KLOUDY_CONNECTION;
const npm=join(dirname(process.execPath),'node_modules/npm/bin/npm-cli.js');
const run=(command,args)=>execFileSync(command,args,{cwd:root,env,encoding:'utf8',windowsHide:true,stdio:['ignore','pipe','pipe']});
const installOutput=run(process.execPath,[npm,'install','--prefix',root,'--ignore-scripts','--no-audit','--no-fund','kloudy@'+version]);
const pkg=join(root,'node_modules/kloudy');
const versionOutput=run(process.execPath,[join(pkg,'bin/entry.mjs'),'--version']).trim();assert.equal(versionOutput,version);
const noArgs=run(process.execPath,[join(pkg,'bin/entry.mjs')]);assert.match(noArgs,/No supported editor configuration found/);
const {editorPaths,installEditors}=await import(pathToFileURL(join(pkg,'src/editor-install.mjs')));
const hosts=editorPaths({home,platform:'win32',appData:env.APPDATA,codexHome:env.CODEX_HOME});
for(const host of hosts){await mkdir(dirname(host.file),{recursive:true});await writeFile(host.file,host.toml?'[mcp_servers.existing]\nurl = "https://example.com/mcp"\n':JSON.stringify({[host.key]:{existing:{url:'https://example.com/mcp'}}}));}
const confirmations=[];const results=await installEditors({hosts,confirm:async request=>{confirmations.push(request.client);return true;}});
assert.equal(confirmations.length,6);assert.ok(results.every(r=>r.state==='configured'));
for(const host of hosts){const text=await readFile(host.file,'utf8');assert.match(text,/existing/);assert.match(text,/kloudy/);}
const {conversationParams}=await import(pathToFileURL(join(pkg,'src/conversation.mjs')));assert.equal(conversationParams('read',{project:'demo',conversation_id:'main'}).project,'demo');
const result={version,registryInstalled:true,environment:'Fresh temporary Windows profile, npm cache and install directory; not a separate physical machine',installExitCode:0,installOutput,versionOutput,noArgsOutput:noArgs,realUserConfigurationsChanged:[],configuredFixtureClients:confirmations,otherServersPreserved:true,conversationExport:true};
await writeFile('proof/2026-10-04-product-split/registry-install.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
