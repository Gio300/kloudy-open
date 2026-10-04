import {readFile,writeFile,mkdtemp} from 'node:fs/promises';
import {join,dirname} from 'node:path';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
import {tmpdir} from 'node:os';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
const reference=JSON.parse(await readFile(process.argv[2],'utf8'));
const credential=JSON.parse(await readFile(reference.credential_file,'utf8'));
const client=new Client({name:'kloudy-remote-proof',version:'1'});
const npm=join(dirname(process.execPath),'node_modules/npm/bin/npm-cli.js');
const workingDirectory=await mkdtemp(join(tmpdir(),'kloudy-remote-proof-'));
const transport=new StdioClientTransport({cwd:workingDirectory,command:process.execPath,args:[npm,'exec','--yes','--package','kloudy@0.4.1','--','kloudy','mcp'],env:{PATH:process.env.PATH||process.env.Path,APPDATA:process.env.APPDATA,LOCALAPPDATA:process.env.LOCALAPPDATA,USERPROFILE:process.env.USERPROFILE,KLOUDY_MCP_TOKEN:credential.access_token},stderr:'pipe'});
let stderr='';transport.stderr.on('data',chunk=>{stderr=(stderr+chunk).slice(-4000);});
const result={time:new Date().toISOString(),package:'kloudy@0.4.1',endpoint:'https://kloudy.ai/mcp',command:'npx --yes kloudy@0.4.1 mcp',customerDataUsed:false,checks:[]};
let stage='initialize';
try{
 await client.connect(transport);
 const tools=await client.listTools();assert.equal(tools.tools.length,1);assert.ok(tools.tools[0].inputSchema.properties.operation.enum.includes('conversation'));
 const key={project:'remote-proof-'+randomUUID(),conversation_id:'main'};
 const invoke=(operation,input)=>client.callTool({name:'kloudy',arguments:{operation:'conversation',conversation_operation:operation,conversation:input}});
 const exchange={...key,idempotency_key:'exchange-1',expected_revision:0,title:'Synthetic remote proxy proof',user:'Keep this synthetic card.',assistant:'Synthetic context recorded.',decisions:[],built_artifacts:[]};
 stage='append';
 const first=await invoke('append',exchange);assert.equal(first.isError,undefined);assert.equal(first.structuredContent.revision,1);
 stage='replay';
 const second=await invoke('append',exchange);assert.equal(second.structuredContent.replayed,true);assert.equal(second.structuredContent.context_available,false);
 stage='read';
 const read=await invoke('read',key);assert.equal(read.structuredContent.raw_transcript_returned,false);assert.equal(read.structuredContent.revision,1);
 stage='sync';
 const checkpoint=await invoke('sync',{...key,idempotency_key:'checkpoint-1',expected_revision:1,reason:'device_switch'});assert.equal(checkpoint.structuredContent.minimum_gate_met,false);assert.equal(checkpoint.structuredContent.deck,null);
 stage='stale revision';
 let rejected=false;try{const response=await invoke('append',{...exchange,idempotency_key:'stale',expected_revision:0});rejected=!!response.isError;}catch{rejected=true;}assert.ok(rejected);
 result.checks=['published remote proxy initialized','one tool advertises conversation','append/read/sync passed','metadata-only replay','minimum gate not bypassed','stale revision rejected'];result.passed=true;
}catch(error){result.passed=false;result.error={stage,name:error.name,code:error.code||'proof_failed',message:String(error.message).replaceAll(credential.access_token,'[redacted]').slice(0,600)};process.exitCode=1;}
finally{
 await client.close().catch(()=>{});
 result.stderr=stderr.replaceAll(credential.access_token,'[redacted]');
 await writeFile(reference.done_marker,'Remote MCP product proof finished. Revoke isolated grant.\n');
 await writeFile('proof/2026-10-04-product-split/remote-conversation.json',JSON.stringify(result,null,2)+'\n');
 console.log(JSON.stringify(result));
}
