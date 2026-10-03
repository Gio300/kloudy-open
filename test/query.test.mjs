import test from 'node:test';import assert from 'node:assert/strict';import {queryInput,queryResult} from '../src/query.mjs';import {HttpkClient} from '../src/httpk.mjs';
const result={version:'kldy.query/1',query_sha256:'a'.repeat(64),state:'no_match',matches:[],execution_started:false,permission_granted:false,measurements:{definitions_emitted:0,provider_calls:0,network_calls:0}};
test('KLDY client sends tiny scoped queries on the existing HTTPK session without tools/call',async()=>{
 const methods=[];const client=new HttpkClient({endpoint:'https://engine.example/mcp',token:'test-only',state:{sessionId:'existing',interactionMode:'autonomous'},fetcher:async(_url,options)=>{const request=JSON.parse(options.body);methods.push(request.method);assert.deepEqual(request.params,{version:'kldy.query/1',need:'library documentation',limit:3,scope:{discovered_via:['seo']}});return Response.json({jsonrpc:'2.0',id:request.id,result});}});
 assert.equal((await client.query('library documentation',{scope:{discovered_via:['seo']}})).state,'no_match');assert.deepEqual(methods,['kloudy/query']);
});
test('KLDY validation rejects over-budget, extra scope, elevated permissions and schema dumps',()=>{
 for(const input of ['', 'x'.repeat(1001),'🌍'.repeat(250),'line\nfeed'])assert.throws(()=>queryInput(input));assert.throws(()=>queryInput('read',{limit:6}));assert.throws(()=>queryInput('read',{scope:{grant:true}}));assert.throws(()=>queryInput('read',{scope:{sources:['https://user:secret@example.com']}}));
 assert.equal(queryResult(result,3),result);for(const invalid of [{...result,tools:[{}]},{...result,permission_granted:true},{...result,measurements:{definitions_emitted:1}},{...result,matches:[{content:'full page'}]}])assert.throws(()=>queryResult(invalid,3));
});
