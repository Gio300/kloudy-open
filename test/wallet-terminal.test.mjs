import test from 'node:test';
import assert from 'node:assert/strict';
import {HttpkClient} from '../src/httpk.mjs';
import {terminalStatus} from '../src/terminal-status.mjs';
import {createMcpServer} from '../src/mcp.mjs';
import {InMemoryTransport} from '@modelcontextprotocol/sdk/inMemory.js';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
test('wallet uses existing HTTPK session and never accepts a payable or executed preview',async()=>{
 let result={version:'bbe.wallet/1',state:'quote_only',payment_started:false,funds_held_by_engine:false,amount_due:null},calls=[];
 const c=new HttpkClient({endpoint:'https://example.com/mcp',token:'fixture-only',state:{sessionId:'test',interactionMode:'autonomous'},fetcher:async(url,options)=>{calls.push(JSON.parse(options.body));return new Response(JSON.stringify({result}));}});
 assert.equal((await c.wallet({operation:'top_up',amount_usd:'10.00'})).state,'quote_only');assert.equal(calls[0].method,'kloudy/wallet');assert.deepEqual(calls[0].params,{operation:'top_up',amount_usd:'10.00'});
 for(const amount of ['-1','0','1e6','NaN','0.001'])await assert.rejects(c.wallet({operation:'top_up',amount_usd:amount}));
 await assert.rejects(c.wallet({operation:'transfer'}));assert.equal(calls.length,1);
 result={...result,payment_started:true};await assert.rejects(c.wallet(),/non-payable/);
 result={...result,payment_started:false,amount_due:1};await assert.rejects(c.wallet(),/non-payable/);
});
test('MCP wallet stays inside the one advertised tool and returns explicit preview',async()=>{
 const engine={state:{},wallet:async a=>({version:'bbe.wallet/1',state:'quote_only',operation:a.operation,payment_started:false})};
 const server=createMcpServer({useClient:fn=>fn(engine)}),client=new Client({name:'wallet-test',version:'1'}),[a,b]=InMemoryTransport.createLinkedPair();
 try{await server.connect(a);await client.connect(b);assert.equal((await client.listTools()).tools.length,1);const result=await client.callTool({name:'kloudy',arguments:{operation:'wallet',wallet_operation:'top_up',amount_usd:'10.00'}});assert.equal(result.structuredContent.payment_started,false);}finally{await client.close();await server.close();}
});
test('terminal activity stays silent in pipes and stops its timer on completion',()=>{
 let output='',cleared=0,tick;const stream={isTTY:true,write:text=>output+=text};
 const status=terminalStatus({stream,enabled:true,interval:fn=>{tick=fn;return 1;},clear:()=>cleared++});const event=state=>({schema:'kloudy.activity/1',source:'kloudy',state});
 status.update(event('thinking'));tick();assert.match(output,/Kloudy is working/);status.update(event('idle'));assert.equal(cleared,1);status.dispose();
 output='';const piped=terminalStatus({stream,enabled:false});piped.update(event('thinking'));piped.dispose();assert.equal(output,'');
});
