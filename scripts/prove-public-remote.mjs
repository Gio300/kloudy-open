import {mkdtemp,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import assert from 'node:assert/strict';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
const cwd=await mkdtemp(join(tmpdir(),'kloudy-public-remote-'));
const npm=join(dirname(process.execPath),'node_modules/npm/bin/npm-cli.js');
const client=new Client({name:'kloudy-public-remote-proof',version:'1'});
const transport=new StdioClientTransport({cwd,command:process.execPath,args:[npm,'exec','--yes','--package','kloudy@0.4.1','--','kloudy','mcp'],env:{PATH:process.env.PATH||process.env.Path,APPDATA:process.env.APPDATA,LOCALAPPDATA:process.env.LOCALAPPDATA,USERPROFILE:process.env.USERPROFILE},stderr:'pipe'});
let stderr='';transport.stderr.on('data',chunk=>{stderr=(stderr+chunk).slice(-4000);});
const result={time:new Date().toISOString(),package:'kloudy@0.4.1',command:'npx --yes kloudy@0.4.1 mcp',freshWorkingDirectory:true,authenticated:false};
try {await client.connect(transport);const list=await client.listTools();assert.equal(list.tools.length,1);assert.ok(list.tools[0].inputSchema.properties.operation.enum.includes('conversation'));result.passed=true;result.tools=list.tools.map(t=>t.name);}catch(error){result.passed=false;result.error={name:error.name,code:error.code,message:error.message};process.exitCode=1;}finally{await client.close().catch(()=>{});result.stderr=stderr;await writeFile('proof/2026-10-04-product-split/public-remote-stdio.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));}
