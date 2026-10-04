// Operator-supplied isolated proof grant only. Never put credential values in output.
import {readFile,writeFile,mkdtemp,readdir,unlink,rmdir,mkdir} from 'node:fs/promises';
import {dirname,join,resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import {spawn} from 'node:child_process';
import assert from 'node:assert/strict';
import {HttpkClient} from '../src/httpk.mjs';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
const reference=JSON.parse(await readFile(process.argv[2],'utf8'));
const credential=JSON.parse(await readFile(reference.credential_file,'utf8'));
const evidence={time:new Date().toISOString(),endpoint:reference.endpoint,customerDataUsed:false,checks:[]};
let temporary;
try{
 const client=new HttpkClient({endpoint:reference.endpoint,token:credential.access_token,mode:'auto'});
 const key={project:'product-proof-'+randomUUID(),conversation_id:'main'};
 let last,result;
 for(let i=0;i<20;i++){
  last={...key,idempotency_key:'exchange-'+i,expected_revision:i,title:'Synthetic product conversation proof',user:`Build synthetic card ${i}. Keep its source attribution.`,assistant:`Synthetic card ${i} prepared for this test.`,decisions:['Retain source attribution.'],built_artifacts:['synthetic/card.mjs']};
  result=await client.conversation('append',last);assert.equal(result.revision,i+1);
 }
 assert.equal(result.deck.version,'sdf.conversation/1');assert.equal(result.pending_exchanges,0);assert.equal(result.condensed_revision,20);
 assert.equal(result.raw_transcript_returned,false);assert.equal(result.deck.trusted_for_authorization,false);
 evidence.checks.push({name:'SDK append 20 and condense',passed:true,revision:20,pendingExchanges:0,rawTranscriptReturned:false});
 const replay=await client.conversation('append',last);assert.equal(replay.replayed,true);assert.equal(replay.context_available,false);
 const read=await client.conversation('read',key);assert.equal(read.deck.cards.length,2);
 const sync=await client.conversation('sync',{...key,idempotency_key:'switch-device',expected_revision:20,reason:'device_switch'});assert.equal(sync.revision,20);
 await assert.rejects(client.conversation('append',{...last,idempotency_key:'stale-revision',expected_revision:0}));
 await assert.rejects(client.conversation('read',{...key,project:'other-project-'+randomUUID()}));
 evidence.checks.push({name:'Replay, fresh read, device-switch checkpoint, stale revision and wrong project',passed:true});
 temporary=await mkdtemp(join(dirname(reference.credential_file),'product-client-proof-'));
 const file=join(temporary,'connection.json'),input=join(temporary,'request.json');
 await writeFile(file,JSON.stringify({endpoint:reference.endpoint,access_token:credential.access_token,client_id:credential.client_id}),{mode:0o600,flag:'wx'});
 await writeFile(input,JSON.stringify(key),{mode:0o600,flag:'wx'});
 const cli=await new Promise(resolveRun=>{let stdout='',stderr='';const child=spawn(process.execPath,['bin/entry.mjs','legacy','conversation','read','--inputs',input,'--connection',file],{stdio:['ignore','pipe','pipe'],windowsHide:true});child.stdout.on('data',x=>stdout+=x);child.stderr.on('data',x=>stderr+=x);child.on('close',code=>resolveRun({code,stdout,stderr}));});
 assert.equal(cli.code,0);assert.ok(!cli.stdout.includes(credential.access_token)&&!cli.stderr.includes(credential.access_token));assert.equal(JSON.parse(cli.stdout).revision,20);
 evidence.checks.push({name:'Actual CLI subprocess reads live context',passed:true,exitCode:cli.code});
 const mcp=new Client({name:'kloudy-product-conversation-proof',version:'1'}),transport=new StdioClientTransport({command:process.execPath,args:['bin/entry.mjs','legacy','mcp','--connection',file],stderr:'pipe'});
 try{await mcp.connect(transport);const reply=await mcp.callTool({name:'kloudy',arguments:{operation:'conversation',conversation_operation:'read',conversation:key}});assert.equal(reply.isError,undefined);assert.equal(reply.structuredContent.revision,20);evidence.checks.push({name:'Actual stdio MCP subprocess reads same live context',passed:true,rawTranscriptReturned:reply.structuredContent.raw_transcript_returned});}finally{await mcp.close();}
 evidence.passed=true;
}catch(error){evidence.passed=false;evidence.error={name:error.name,code:error.code||'proof_failed'};process.exitCode=1;}
finally{
 if(temporary){for(const name of await readdir(temporary))await unlink(join(temporary,name));await rmdir(temporary);}
 // Engine helper owns revocation and destruction of its temporary grant.
 await writeFile(reference.done_marker,'Product live conversation proof finished. Revoke isolated grant.\n');
 await mkdir('proof/2026-10-04-product-split',{recursive:true});
 await writeFile('proof/2026-10-04-product-split/live-conversation.json',JSON.stringify(evidence,null,2)+'\n');
 console.log(JSON.stringify(evidence));
}
