import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {spawnSync} from 'node:child_process';
import {mkdtempSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {gunzipSync} from 'node:zlib';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {ossDropReason,ossDevicesAndCaps} from '../scripts/bundle-bots-catalog.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const entry=resolve(root,'bin/entry.mjs');
const legacy=resolve(root,'bin/kloudy.mjs');
const cache=mkdtempSync(join(tmpdir(),'kloudy-bots-'));

function run(file,args){
  const env={...process.env,KLOUDY_CACHE_DIR:cache};
  delete env.KLOUDY_API;delete env.KLOUDY_BOTS_API;
  return spawnSync(process.execPath,[file,...args],{encoding:'utf8',cwd:root,env});
}

function bundledOssId(){
  const data=JSON.parse(gunzipSync(readFileSync(resolve(root,'src/deployable-bots.json.gz'))));
  const row=data.bots.find(r=>r[3]==='O'&&r[11]==='oss');
  assert.ok(row,'bundled snapshot includes a class O OSS row');
  return row[0];
}

test('npx entry help lists the bots command',()=>{
  const r=run(entry,['help']);
  assert.equal(r.status,0,r.stderr);
  assert.match(r.stdout,/npx kloudy bots list\|search\|get\|sync\|works\|broken/);
});

test('legacy help lists bots',()=>{
  const r=run(legacy,['help']);
  assert.equal(r.status,0,r.stderr);
  assert.match(r.stdout,/kloudy bots list\|search\|get\|sync\|works\|broken/);
});

test('offline search reads the bundled snapshot',()=>{
  const r=run(entry,['bots','search','docs','--offline','--limit','3']);
  assert.equal(r.status,0,r.stderr);
  assert.match(r.stdout,/bots \(local:/);
  assert.match(r.stdout,/deployable-bots\.json\.gz/);
});

test('offline get returns a bundled OSS row',()=>{
  const id=bundledOssId();
  const r=run(entry,['bots','get',id,'--offline']);
  assert.equal(r.status,0,r.stderr);
  const body=JSON.parse(r.stdout);
  assert.equal(body.id,id);
  assert.equal(body.free,true);
  assert.ok(body.endpoints?.length);
});

test('legacy bots get reads the same bundled OSS row',()=>{
  const id=bundledOssId();
  const r=run(entry,['legacy','bots','get',id,'--offline']);
  assert.equal(r.status,0,r.stderr);
  assert.equal(JSON.parse(r.stdout).id,id);
});

test('live get 404 falls back to the bundled OSS row',async()=>{
  const id=bundledOssId();
  let seen=0;
  const server=createServer((_req,res)=>{seen++;res.writeHead(404,{'content-type':'application/json'});res.end(JSON.stringify({error:'missing'}));});
  await new Promise(resolveListen=>server.listen(0,'127.0.0.1',resolveListen));
  const {port}=server.address();
  const lines=[];
  try{
    const {botsCommand}=await import('../src/bots.mjs');
    await botsCommand(['get',id,'--api',`http://127.0.0.1:${port}`],{out:s=>lines.push(s)});
  }finally{await new Promise(resolveClose=>server.close(resolveClose));}
  assert.equal(seen,1);
  assert.equal(JSON.parse(lines.join('\n')).id,id);
});

test('fail-closed filter drops key-gated, NGC, and non-permissive rows',()=>{
  const base={id:'oss:example:ok',name:'ok',kind:'npx',tier:'free',status:'untested',endpoints:[],free:true,devices:['desktop'],caps:[],license:'MIT',source_url:'https://example.com'};
  assert.equal(ossDropReason(base),null);
  assert.equal(ossDropReason({...base,free:false}),'paid-or-not-free');
  assert.equal(ossDropReason({...base,license:'CC BY-NC 4.0'}),'license');
  assert.equal(ossDropReason({...base,license:''}),'license');
  assert.equal(ossDropReason({...base,id:'oss:nvidia:NVIDIA-AI-Blueprints/foo','x-notes':'NGC key'}),'nvidia-blueprint');
  assert.equal(ossDropReason({...base,id:'oss:cuda:triton-inference-server/server',endpoints:[{type:'install',value:'docker run nvcr.io/nvidia/tritonserver'}]}),'ngc-container');
  assert.equal(ossDropReason({...base,'x-notes':'requires a vendor API key'}),'key-gated-note');
  const gpu=ossDevicesAndCaps({...base,devices:['desktop','phone'],caps:['needs GPU']});
  assert.deepEqual(gpu.devices,['desktop']);
  assert.ok(gpu.caps.includes('needs GPU'));
});

test('bundled snapshot includes hf rows, no ollama kind, and no x-same-model-as',()=>{
  const data=JSON.parse(gunzipSync(readFileSync(resolve(root,'src/deployable-bots.json.gz'))));
  const kinds=new Map();
  let same=0, hf=0;
  for(const r of data.bots){
    kinds.set(r[2],(kinds.get(r[2])||0)+1);
    if(r[2]==='hf')hf++;
    if(r[12]&&r[12].sameModelAs)same++;
  }
  assert.equal(kinds.get('ollama')||0,0);
  assert.equal(hf,61);
  assert.equal(same,0);
  assert.ok(data.bots.some(r=>r[0]==='oss:hf:openai/whisper-tiny'));
  assert.ok(!data.bots.some(r=>r[0]==='oss:mit-sweep:hf/openai/whisper-tiny'));
});

test('offline search can find an hf row and get prints connect steps without downloading',()=>{
  const search=run(entry,['bots','search','whisper-tiny','--kind','hf','--offline','--limit','5']);
  assert.equal(search.status,0,search.stderr);
  assert.match(search.stdout,/oss:hf:openai\/whisper-tiny/);
  const got=run(entry,['bots','get','oss:hf:openai/whisper-tiny','--offline']);
  assert.equal(got.status,0,got.stderr);
  assert.match(got.stdout,/\[hf\]/);
  assert.match(got.stdout,/hf download|huggingface\.co/i);
  assert.match(got.stdout,/Nothing is installed or downloaded until you say yes/);
  assert.doesNotMatch(got.stdout,/auto-download|already downloaded/i);
});

import {flags,localSearch} from '../src/bots.mjs';

test('repeated --modality is OR; --all-modalities is AND; primary is a sort hint only',()=>{
  const bots=[
    {id:'a',name:'alpha',kind:'hf',cls:'O',endpoint:'',license:'MIT',url:'',score:1,caps:[],targets:['desktop'],botboozle:0,modalities:['text','embedding'],modality_primary:'embedding'},
    {id:'b',name:'beta',kind:'hf',cls:'O',endpoint:'',license:'MIT',url:'',score:1,caps:[],targets:['desktop'],botboozle:0,modalities:['text','image'],modality_primary:'image'}
  ];
  const o=flags(['list','--modality','embedding','--modality','image']);
  assert.deepEqual(o.modality,['embedding','image']);
  const any=localSearch(bots,{modality:o.modality,limit:10});
  assert.deepEqual(any.items.map(x=>x.id).sort(),['a','b']);
  const all=localSearch(bots,{modality:['text','embedding'],allModalities:true,limit:10});
  assert.deepEqual(all.items.map(x=>x.id),['a']);
  const hinted=localSearch(bots,{modality:['image'],limit:10});
  assert.equal(hinted.items[0].id,'b');
  assert.equal(hinted.matched,1);
});
