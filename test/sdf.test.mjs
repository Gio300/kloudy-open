import test from 'node:test';import assert from 'node:assert/strict';import {convertPage,convertPages} from '../src/public.mjs';import {validateSDF} from '../src/sdf.mjs';
import {sdfIndex} from '../src/query.mjs';
const card={sdf_version:'0.2.0',id:'sdf:'+'a'.repeat(64),parent_type:'article',type:'article.x-kloudy-webpage',source:{url:'https://example.com/',title:'Example',fetched_at:'2026-10-03T00:00:00Z'},metadata:{title:'Example'},summary:{brief:'Public text.',key_points:[]},sections:[{title:'',summary:'Public text.',content_type:'text'}],entities:[],type_data:{headline:'Example'},links:[],provenance:{converter:'kloudy.sdf/1',content_hash:'sha256:'+'a'.repeat(64)},extensions:{'x-kloudy':{profile:'kloudy.sdf.webpage/1',interaction_mode:'informational_only',capabilities:[],ownership_verified:false,published:false,truncated:false,resolution:'compact'}}};
test('SDF SDK rejects unknown versions, execution claims and invalid structure',async()=>{
 assert.equal(validateSDF(card).valid,true);
 for(const change of [c=>c.sdf_version='1.0.0',c=>c.summary.brief='x'.repeat(301),c=>c.extensions['x-kloudy'].capabilities.push('execute'),c=>c.source.url='javascript:alert(1)',c=>c.metadata.title={injection:true},c=>c.source.fetched_at='not-a-date']){const invalid=structuredClone(card);change(invalid);assert.equal(validateSDF(invalid).valid,false);await assert.rejects(()=>convertPage('https://example.com',{fetcher:async()=>Response.json(invalid)}),e=>e.code==='invalid_response');}
});
test('card-list conversion reports unreadable pages, preserves order and avoids duplicate reads',async()=>{
 let calls=0;const result=await convertPages(['https://example.com','https://example.com/#same','https://missing.example'],{fetcher:async(_url,options)=>{calls++;return JSON.parse(options.body).url.includes('missing')?Response.json({error:'restricted'},{status:400}):Response.json(card);}});
 assert.equal(calls,2);assert.equal(result.cards.length,1);assert.equal(result.reports[1].duplicate,true);assert.equal(result.reports[2].status,'unreadable');assert.equal(result.ranking,'none');assert.equal(result.model_calls,0);
 await assert.rejects(()=>convertPages(Array(9).fill('https://example.com')),e=>e.code==='invalid_input');
});

test('SDF index adapter bounds expiry, retains source hash and refuses invented provenance',()=>{
 const now=Date.parse(card.source.fetched_at)/1000;
 const index=sdfIndex([card,card],{discoveredVia:'seo',now});
 assert.equal(index.cards.length,1);assert.equal(index.version,'bbe.sdf-index/1');
 assert.equal(index.cards[0].id,card.id);assert.equal(index.cards[0].content_sha256,'a'.repeat(64));
 assert.deepEqual(index.cards[0].capability_ids,[]);assert.equal(index.cards[0].expires_at,now+3600);
 assert.throws(()=>sdfIndex([card],{now}));assert.throws(()=>sdfIndex([card],{discoveredVia:'seo',now:now+86400}));
 assert.throws(()=>sdfIndex([card],{discoveredVia:'seo',now:now-301}));
});
