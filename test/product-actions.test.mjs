import test from 'node:test';
import assert from 'node:assert/strict';
import {HttpkClient} from '../src/httpk.mjs';
import {adaptMcp} from '../src/hosted.mjs';
import {actionInput,hostingParams} from '../src/product-actions.mjs';
const message=arguments_=>({jsonrpc:'2.0',id:1,method:'tools/call',params:{name:'kloudy',arguments:arguments_}});
test('chain, wallet and BWW use singular engine selections with stable caller replay key',async()=>{
 const calls=[],state={sessionId:'owned',interactionMode:'autonomous'};
 const client=new HttpkClient({endpoint:'https://kloudy.ai/mcp',token:'fixture',state,fetcher:async(_,opts)=>{const body=JSON.parse(opts.body);calls.push(body);return Response.json({result:{selection_id:'selected',tools:[{name:'scoped'}],arguments:body.params.input.inputs}});}});
 const inputs={chain:'ethereum',destination_chain:'ethereum',sender:'wallet-sender',recipient:'destination',amount_atomic:'100'};
 const result=await client.action('wallet.prepare',inputs,{idempotencyKey:'stable-1'});
 assert.equal(result.toolbox.tools.length,1);assert.deepEqual(result.arguments,inputs);
 assert.deepEqual(calls.map(c=>c.method),['kloudy/intent']);
 assert.equal(calls[0].params.idempotency_key,'stable-1');assert.equal(state.selection.tool.name,'scoped');
 const mapped=adaptMcp(message({operation:'action',action:'wallet.prepare',inputs,idempotency_key:'stable-1'}));
 assert.deepEqual(mapped.upstream.params,calls[0].params);
 assert.equal(calls.some(c=>/send|sign|confirm/.test(c.method)),false);
});
test('invalid chain/BWW/amount/extra fields fail before any connection',async()=>{
 const client=new HttpkClient({endpoint:'https://kloudy.ai/mcp',token:'fixture',fetcher:()=>assert.fail('no network for invalid input')});
 for(const [action,inputs] of [['wallet.prepare',{}],['chain.head',{chain:'',secret:'x'}],['bww.fetch',{project:'project',fragment_ids:['same','same'],allow_html:true}],['bww.publish',{project:'p',fragment_id:'f',title:'T',text:'x'.repeat(8001),html:null,advertisement:null}],['wallet.send',{}]])await assert.rejects(()=>client.action(action,inputs));
 for(const amount of [-1,0,1.5,NaN,Infinity,1000000000001,'100'])assert.throws(()=>hostingParams(amount));
 assert.deepEqual(hostingParams(),{});assert.deepEqual(hostingParams(100000000),{budget_usd_micros:100000000});
});
test('hosting and pairing preserve authoritative inactive flags and never fabricate a QR',async()=>{
 const calls=[],state={sessionId:'owned',interactionMode:'autonomous'};
 const response={customer_budget_active:false,tax_included:false,enforcement_scope:'trusted_meter_operations_only'};
 const client=new HttpkClient({endpoint:'https://kloudy.ai/mcp',token:'fixture',state,fetcher:async(_,opts)=>{calls.push(JSON.parse(opts.body));return Response.json({result:response});}});
 assert.deepEqual(await client.hosting({budgetUsdMicros:100000000}),response);
 await client.walletConnection('solana');
 assert.deepEqual(calls.map(c=>[c.method,c.params]),[['kloudy/hosting',{budget_usd_micros:100000000}],['kloudy/wallet/connection',{chain:'solana'}]]);
 for(const [operation,args,method] of [['hosting',{budget_usd_micros:100000000},'kloudy/hosting'],['wallet_connection',{chain:'solana'},'kloudy/wallet/connection']])assert.equal(adaptMcp(message({operation,...args})).upstream.method,method);
});
test('BWW requested fragments preserve provider opt-in and advertisement attribution',()=>{
 const inputs={project:'mine',fragment_id:'card',title:'Example',text:'Requested content',html:'<p>Optional</p>',advertisement:{provider:'Provider',text:'Sponsored offer'}};
 assert.deepEqual(actionInput('bww.publish',inputs),{type:'action',action:'bww.publish',inputs});
 assert.throws(()=>actionInput('bww.publish',{...inputs,advertisement:{...inputs.advertisement,hidden:true}}));
});
test('active receipt prevents another action and uncertain submission is never retried',async()=>{
 let calls=0;const client=new HttpkClient({endpoint:'https://kloudy.ai/mcp',token:'fixture',state:{sessionId:'owned',interactionMode:'autonomous',receiptSelection:'pending'},fetcher:async()=>{calls++;return Response.json({result:{state:'awaiting_approval'}});}});
 await assert.rejects(()=>client.action('chain.head',{chain:'ethereum'}),/Finish/);assert.equal(calls,1);
 delete client.state.receiptSelection;client.fetcher=async()=>{calls++;throw Error('offline');};
 await assert.rejects(()=>client.action('chain.head',{chain:'ethereum'},{idempotencyKey:'retry-same-key'}),/No retry/);assert.equal(calls,2);
});
