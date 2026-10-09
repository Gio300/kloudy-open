import test from 'node:test';import assert from 'node:assert/strict';
import {readPublicPage,readCard} from '../src/public.mjs';
import {createStarter} from '../src/starter.mjs';
import {mkdtemp,readFile} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';
test('public reader uses the canonical AWS door without credential or account calls',async()=>{
 let called=0;const result=await readPublicPage('https://example.com',{fetcher:async(url,options)=>{called++;assert.equal(url,'https://kloudy.ai/api/read');assert.equal(options.headers.authorization,undefined);assert.equal(JSON.parse(options.body).url,'https://example.com/');return Response.json({url:'https://example.com/',type:'text/html',body:'<h1>Example</h1>',bytes:16});}});assert.equal(called,1);assert.equal(result.type,'text/html');
});
test('public reading rejects embedded credentials, executable URLs and malformed responses',async()=>{
 for(const url of ['javascript:alert(1)','https://secret@example.com'])await assert.rejects(readPublicPage(url),e=>e.code==='invalid_url');
 await assert.rejects(readPublicPage('https://example.com',{fetcher:async()=>Response.json({url:'javascript:alert(1)',type:'text/html',body:'bad'})}),e=>e.code==='invalid_response');
 await assert.rejects(readPublicPage('https://example.com',{fetcher:async()=>new Response('',{status:429})}),e=>e.code==='rate_limited');
});
test('cards never become execution grants or permit arbitrary path traversal',async()=>{
 const good={name:'World',description:'Description',website:'https://kloudy.ai/world',interaction_mode:'informational_only',capabilities:[]};
 assert.deepEqual(await readCard('/world',{fetcher:async()=>Response.json(good)}),good);
 for(const path of ['/../secret','//example.org','/world?token=x'])await assert.rejects(readCard(path),e=>e.code==='invalid_path');
 await assert.rejects(readCard('/world',{fetcher:async()=>Response.json({...good,capabilities:[{tool:'execute'}]})}),e=>e.code==='invalid_response');
});
test('starter creates runnable public examples and refuses to overwrite an existing project',async()=>{
 const parent=await mkdtemp(join(tmpdir(),'kloudy-starter-')),target=join(parent,'app');const result=await createStarter(target);
 assert.equal(result.status,'created');const pkg=JSON.parse(await readFile(join(target,'package.json')));assert.equal(pkg.scripts.start,'node app.mjs');assert.equal(pkg.dependencies['kloudy'],'latest');
 const example=await readFile(join(target,'toolbox.mjs'),'utf8');assert.match(example,/client.ask/);assert.doesNotMatch(example,/client.call/);
 await assert.rejects(createStarter(target),e=>e.code==='directory_exists');assert.equal(JSON.parse(await readFile(join(target,'package.json'))).name,'my-kloudy-app');
});
