// Rebuild src/deployable-bots.json.gz for the npm package.
// Base is the class A/B catalog (class O stripped and re-applied). OSS jsonl files are ingested
// in order with the same fail-closed filter as Gio300/kloudy scripts/build-deployable-bots.mjs:
// drop key-gated / NGC / nvcr.io, missing or non-permissive licenses, paid tiers, and secret-looking values.
// GPU rows stay desktop-only. Class D is never written. A/B/C ids win over the same OSS id.
//
//   node scripts/bundle-bots-catalog.mjs
//   node scripts/bundle-bots-catalog.mjs --subset full
//   node scripts/bundle-bots-catalog.mjs --oss path/to/manifests-OSS-batch2.jsonl
//
// Default --subset full ships the 1.0 set: passing A/B rows (known size of at least 5 KB) plus approved OSS/HF.
// verified-oss (class A + O only) remains available for a smaller snapshot. Class B is included in 1.0.0
// because default `kloudy bots sync` uses https://kloudy.ai/api/deployable-bots/export, which will not have
// this catalog until a later deploy (not part of this pack). The gzip stays well under the historical ~2 MB cap.
import {readFileSync,writeFileSync,mkdirSync,existsSync,readdirSync} from 'node:fs';
import {gunzipSync,gzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

const __dir=dirname(fileURLToPath(import.meta.url));
const root=resolve(__dir,'..');
const ossHeldPath=resolve(root,'data/oss/held-discord-telegram.json');
const OSS_HELD_IDS=new Set((existsSync(ossHeldPath)?JSON.parse(readFileSync(ossHeldPath,'utf8')).ids||[]:[]).map(x=>x.id||x));

function readJsonIds(path){
  if(!existsSync(path))return null;
  return JSON.parse(readFileSync(path,'utf8').replace(/^\uFEFF/,''));
}

export function loadOssOverrides(){
  const overridePath=process.env.KLOUDY_OSS_OVERRIDES||resolve(root,'data/oss/overrides-20261110.json');
  const heldPath=resolve(root,'data/oss/held-ollama-only.json');
  const remove=new Map(), hold=new Map(), tag=new Map();
  const data=existsSync(overridePath)?readJsonIds(overridePath):null;
  if(data){
    for(const row of data.remove||[])remove.set(row.id||row,row.reason||'rule-3');
    for(const row of data.hold||[])hold.set(row.id||row,row.reason||'ollama-only, awaiting Johnny');
    for(const row of data.tag||[]){
      const id=row.id, modalities=[...new Set((row.modalities||[]).filter(x=>typeof x==='string'&&x.trim()))];
      if(id&&modalities.length)tag.set(id,{modalities,primary:row.primary||modalities[0],source:'override'});
    }
  }
  if(existsSync(heldPath)){
    const h=readJsonIds(heldPath);
    for(const row of h.ids||[])hold.set(row.id||row,row.reason||h.reason||'ollama-only, awaiting Johnny');
  }
  return {remove,hold,tag};
}

const OSS_OVERRIDES=loadOssOverrides();



const DENY_LICENSE=/(non-?commercial|academic-?only|proprietary|no license|source-?available|REVIEW|OpenMDW|Cursor skills|Cursor OSS|CC-BY-NC)/i;
const SPDX_ID=String.raw`(?:Apache-2\.0|MIT|BSD-2-Clause|BSD-3-Clause|ISC|Unlicense|CC0-1\.0|CC-BY-4\.0|MPL-2\.0|GPL-2\.0(?:-only|-or-later)?|GPL-3\.0(?:-only|-or-later)?|AGPL-3\.0(?:-only|-or-later)?|LGPL-2\.1(?:-only|-or-later)?|LGPL-3\.0(?:-only|-or-later)?)`;
const ALLOW_LICENSE=new RegExp(`^${SPDX_ID}(?:\\s+(?:AND|OR)\\s+${SPDX_ID})*$`,'i');
const SECRET_VAL=/(Bearer\s+\S{8,}|sk-[a-zA-Z0-9]{10,}|AKIA[0-9A-Z]{16}|\bapi[_-]?key\s*[:=]\s*['\"]?\S{8,}|password\s*[:=]\s*['\"]?\S+)/i;
const TRITON_ID='oss:cuda:triton-inference-server/server';

export function ossDropReason(row){
  if(OSS_HELD_IDS.has(row.id))return 'discord-telegram-bot-token';
  if(row.id==='oss:tsf:PatrickJS/awesome-cursorrules')return 'awesome-list';
  if(OSS_OVERRIDES.remove.has(row.id))return OSS_OVERRIDES.remove.get(row.id);
  if(OSS_OVERRIDES.hold.has(row.id))return 'ollama-only';
  if(row.free!==true||row.tier&&row.tier!=='free')return 'paid-or-not-free';
  const lic=String(row.license||'').trim();
  if(!lic||DENY_LICENSE.test(lic)||!ALLOW_LICENSE.test(lic))return 'license';
  const blob=JSON.stringify(row.endpoints||[])+String(row['x-notes']||'')+JSON.stringify(row);
  if(SECRET_VAL.test(blob))return 'secret-value';
  if(row.id===TRITON_ID||/\bnvcr\.io\b/i.test(blob))return 'ngc-container';
  if(String(row.id||'').startsWith('oss:nvidia:NVIDIA-AI-Blueprints/')||row.id==='oss:nvidia:NVIDIA/data-science-blueprints')return 'nvidia-blueprint';
  if(/NGC key/i.test(row['x-notes']||'')&&/blueprint|NIM container/i.test(row['x-notes']||''))return 'ngc-key-note';
  if(/\bkey-?gated\b/i.test(row['x-notes']||'')||/\brequires\b.*\bAPI key/i.test(row['x-notes']||''))return 'key-gated-note';
  for(const ep of row.endpoints||[]){const v=ep.value||ep.url||'';if(typeof v==='string'&&SECRET_VAL.test(v))return 'secret-value';}
  return null;
}

export function ossEndpoint(row){
  if(row.kind==='hf'){
    const dl=(row.endpoints||[]).find(ep=>ep.type==='download'&&ep.value);
    if(dl)return String(dl.value).slice(0,300);
  }
  for(const ep of row.endpoints||[]){
    if(ep.type==='command'&&ep.value)return String(ep.value).slice(0,300);
    if((ep.type==='http'||ep.type==='mcp')&&ep.url)return String(ep.url).slice(0,300);
  }
  for(const ep of row.endpoints||[]){
    if(ep.type==='install'&&ep.value)return String(ep.value).slice(0,300);
    if(ep.type==='source'&&ep.url)return String(ep.url).slice(0,300);
  }
  return String(row.source_url||'').slice(0,300);
}

export function ossDevicesAndCaps(row){
  const ALLOWED_DEVICES=new Set(['desktop','server','phone','phone-via-desktop','watch-thin','web']);
  let dev=(row.devices||['desktop']).filter(d=>ALLOWED_DEVICES.has(d));
  if(row['x-hf']&&row['x-hf'].phone_ok===false)dev=dev.filter(d=>d!=='phone');
  let c=[...(row.caps||[]).filter(x=>typeof x==='string')].slice(0,8);
  const needsGpu=/needs GPU/i.test(c.join(' '))||/\bneeds GPU\b/.test((row['x-notes']||''));
  const llama=row.id==='oss:catalog:ggml-org/llama.cpp'||row.id==='oss:resources:abetlen/llama-cpp-python';
  if(llama){c=c.filter(x=>x!=='needs GPU');if(!c.includes('GPU optional'))c.push('GPU optional');}
  else if(needsGpu&&!c.includes('needs GPU'))c.push('needs GPU');
  if(needsGpu&&!llama)dev=dev.filter(d=>d==='desktop');
  if(!dev.length)dev=['desktop'];
  return {devices:dev,caps:c};
}


export function ossMeta(row){
  const meta={};
  const connect=(row.endpoints||[]).map(ep=>{
    const o={type:ep.type};
    if(ep.value)o.value=String(ep.value).slice(0,400);
    if(ep.url)o.url=String(ep.url).slice(0,400);
    if(ep.os)o.os=ep.os;
    if(ep.protocol)o.protocol=ep.protocol;
    if(ep.bytes!=null)o.bytes=ep.bytes;
    if(ep.sha256)o.sha256=ep.sha256;
    return o;
  }).slice(0,16);
  if(connect.length)meta.connect=connect;
  if(row['x-hf']){
    const h=row['x-hf'];
    meta.hf={
      repo:h.repo,revision:h.revision,
      files:(h.files||[]).map(f=>({path:f.path,bytes:f.bytes,size:f.size,sha256:f.sha256,url:f.url})),
      total_bytes:h.total_bytes,total_size:h.total_size,runner:h.runner,
      runner_notes:h.runner_notes,phone_ok:!!h.phone_ok,needs_token:!!h.needs_token,
      model_type:h.model_type
    };
  }
  if(row['x-supersedes'])meta.supersedes=row['x-supersedes'];
  if(row['x-formerly-ollama-tag'])meta.formerTag=row['x-formerly-ollama-tag'];
  return Object.keys(meta).length?meta:undefined;
}

export function ossRowToTuple(row){
  const {devices,caps:rowCaps}=ossDevicesAndCaps(row);
  const kind=row.kind;
  const OSS_KINDS=['http','npx','uvx','botboozle','hf'];
  if(!OSS_KINDS.includes(kind))return null;
  const t=[row.id,String(row.name).slice(0,160),kind,'O',ossEndpoint(row),String(row.license||'').slice(0,80),String(row.source_url||'').slice(0,300),0,rowCaps,devices,kind==='botboozle','oss'];
  const meta=ossMeta(row);if(meta)t.push(meta);
  return t;
}

export function filterOssRows(lines){
  const stats={in:0,kept:0,dropped:{}};
  const rows=[];
  for(const line of lines){if(!line.trim())continue;stats.in++;let row;try{row=JSON.parse(line);}catch{stats.dropped.parse=(stats.dropped.parse||0)+1;continue;}
    const why=ossDropReason(row);
    if(why){stats.dropped[why]=(stats.dropped[why]||0)+1;continue;}
    const t=ossRowToTuple(row);
    if(!t){stats.dropped['bad-kind']=(stats.dropped['bad-kind']||0)+1;continue;}
    rows.push(t);stats.kept++;
  }
  return {rows,stats};
}

export function mergeOssIntoBots(bots,ossRows,existingIds){
  const stats={duplicates:0,added:0,superseded:0,supersedeMissing:0};
  const idSet=existingIds||new Set(bots.map(b=>b[0]));
  for(const t of ossRows){
    const sup=t[12]?.supersedes;
    if(sup){
      if(idSet.has(sup)){
        const idx=bots.findIndex(b=>b[0]===sup);
        if(idx>=0)bots.splice(idx,1);
        idSet.delete(sup);
        stats.superseded++;
      }else stats.supersedeMissing++;
    }
    if(idSet.has(t[0])){stats.duplicates++;continue;}
    bots.push(t);idSet.add(t[0]);stats.added++;
  }
  return stats;
}

function parseArgs(argv){
  const out={subset:'full',base:resolve(root,'data/catalog/deployable-bots-base.json.gz'),oss:[],dest:resolve(root,'src/deployable-bots.json.gz'),stats:resolve(root,'data/catalog/bundle-stats.json')};
  for(let i=0;i<argv.length;i++){
    const a=argv[i];
    if(a==='--subset')out.subset=argv[++i];
    else if(a==='--base')out.base=resolve(argv[++i]);
    else if(a==='--out')out.dest=resolve(argv[++i]);
    else if(a==='--oss')out.oss.push(resolve(argv[++i]));
    else if(a==='--stats')out.stats=resolve(argv[++i]);
    else throw new Error('Unknown argument '+a);
  }
  if(!out.oss.length){
    const dir=resolve(root,'data/oss');
    if(existsSync(dir)){
      const names=readdirSync(dir).filter(n=>/^manifests-OSS.*\.jsonl$/i.test(n)&&!/-flagged\.jsonl$/i.test(n)&&!/^manifests-OSS-ollama/i.test(n)).sort((a,c)=>{
        if(a==='manifests-OSS.jsonl')return -1;
        if(c==='manifests-OSS.jsonl')return 1;
        return a.localeCompare(c);
      });
      for(const n of names)out.oss.push(resolve(dir,n));
    }
  }
  if(out.subset!=='full'&&out.subset!=='verified-oss')throw new Error('subset must be full or verified-oss');
  return out;
}



export function dedupeBotsById(bots){
  const seen=new Set();
  const kept=[];
  const dupes=[];
  for(const r of bots){
    if(seen.has(r[0])){dupes.push({id:r[0],cls:r[3],name:r[1],endpoint:r[4]});continue;}
    seen.add(r[0]);
    kept.push(r);
  }
  return {bots:kept,dupes};
}

export function loadAbSurvivors(path=process.env.KLOUDY_AB_SURVIVORS||resolve(root,'data/oss/ab-survivors.json')){
  if(!path||!existsSync(path))return null;
  const raw=readFileSync(path,'utf8').replace(/^\uFEFF/,'');
  const j=path.endsWith('.jsonl')?null:JSON.parse(raw);
  const ids=j?(j.ids||j.survivors||j):raw.split(/\r?\n/).filter(Boolean).map(l=>{try{const r=JSON.parse(l);return r.id||r;}catch{return l.trim();}});
  if(!Array.isArray(ids))throw new Error('A/B survivor list must be an array of ids');
  return new Set(ids.map(x=>typeof x==='string'?x:x.id).filter(Boolean));
}
export function filterAbBySurvivors(bots,survivors){
  if(!survivors)return {bots,dropped:0,applied:false};
  const kept=[];let dropped=0;
  for(const r of bots){
    if((r[3]==='A'||r[3]==='B')&&!survivors.has(r[0])){dropped++;continue;}
    kept.push(r);
  }
  return {bots:kept,dropped,applied:true};
}


export function resolveModalityTagsPaths(){
  if(process.env.KLOUDY_MODALITY_TAGS)return [process.env.KLOUDY_MODALITY_TAGS];
  const dir=resolve(root,'data/oss');
  return ['modality-tags.jsonl','modality-tags.ab.jsonl'].map(n=>resolve(dir,n)).filter(p=>existsSync(p));
}

export function loadModalityTags(path){
  const paths=path===undefined?resolveModalityTagsPaths():(Array.isArray(path)?path:[path]);
  const map=new Map();
  let any=false;
  for(const p of paths){
    if(!p||!existsSync(p))continue;
    any=true;
    for(const line of readFileSync(p,'utf8').replace(/^\uFEFF/,'').split(/\r?\n/)){
      if(!line.trim())continue;
      const r=JSON.parse(line);
      const modalities=[...new Set((r.modalities||[]).filter(x=>typeof x==='string'&&x.trim()))].map(s=>s.trim());
      if(!r.id||!modalities.length)continue;
      map.set(r.id,{modalities,primary:r.primary||r.modality_primary||null,source:r.source||null});
    }
  }
  return any?map:null;
}
export function applyModalityTags(bots,tags){
  const missing=[];
  for(const t of bots){
    const tag=tags&&tags.get(t[0]);
    if(tag&&tag.modalities&&tag.modalities.length){
      t[12]=t[12]||{};
      t[12].modalities=tag.modalities;
      if(tag.primary)t[12].modalityPrimary=tag.primary;
    }else missing.push({id:t[0],cls:t[3]});
  }
  return missing;
}

export function mergeOverrideTags(tags){
  const map=tags?new Map(tags):new Map();
  // Override tags are a fallback only when v2 (or another tag file) lacks the id.
  for(const [id,tag] of OSS_OVERRIDES.tag)if(!map.has(id))map.set(id,tag);
  return map.size?map:tags;
}

export function buildCatalog({base,oss,subset}){
  if(!existsSync(base))throw new Error('Missing base catalog '+base);
  const hash=createHash('sha256');
  const baseBytes=readFileSync(base);hash.update(baseBytes);
  const decoded=JSON.parse(gunzipSync(baseBytes,{maxOutputLength:250*1024*1024}));
  let bots=(decoded.bots||[]).filter(r=>r[3]!=='O'&&r[3]!=='D').map(r=>r.slice(0,11));
  const ossStats=[];
  for(const p of oss){
    const text=readFileSync(p,'utf8');hash.update(text);
    const {rows,stats}=filterOssRows(text.split('\n'));
    const merge=mergeOssIntoBots(bots,rows);
    ossStats.push({file:p,in:stats.in,kept:stats.kept,added:merge.added,duplicatesSkipped:merge.duplicates,superseded:merge.superseded,dropped:stats.dropped});
  }
  const ab=filterAbBySurvivors(bots,loadAbSurvivors());
  bots=ab.bots;
  const deduped=dedupeBotsById(bots);
  bots=deduped.bots;
  const untagged=applyModalityTags(bots,mergeOverrideTags(loadModalityTags()));
  if(untagged.length){
    const by={A:0,B:0,C:0,O:0};for(const m of untagged)by[m.cls]=(by[m.cls]||0)+1;
    throw new Error(`modality tags missing for ${untagged.length} rows (A ${by.A}, B ${by.B}, C ${by.C}, O ${by.O}). Refusing to ship a catalog without tags.`);
  }
  if(subset==='verified-oss'){hash.update('subset:verified-oss');}
  let packed=bots;
  if(subset==='verified-oss')packed=bots.filter(r=>r[3]==='A'||r[3]==='O');
  const rank={A:0,C:1,O:2,B:3};
  packed.sort((a,b)=>(rank[a[3]]??9)-(rank[b[3]]??9)||(b[7]||0)-(a[7]||0)||String(a[0]).localeCompare(String(b[0])));
  const classes={};
  for(const r of packed)classes[r[3]]=(classes[r[3]]||0)+1;
  const body={schema:'kloudy.deployable-bots-data/1',revision:hash.digest('hex').slice(0,16),built:new Date().toISOString(),bots:packed};
  const gz=gzipSync(JSON.stringify(body),{level:9});
  return {body,gz,classes,ossStats,baseCount:bots.length,shipped:packed.length,subset};
}

const isMain=process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url);
if(isMain){
  const args=parseArgs(process.argv.slice(2));
  const {gz,classes,ossStats,baseCount,shipped,subset}=buildCatalog(args);
  mkdirSync(dirname(args.dest),{recursive:true});
  writeFileSync(args.dest,gz);
  const stats={subset,baseBots:baseCount,shipped,gzBytes:gz.length,classes,oss:ossStats.map(s=>({...s,file:s.file.replace(root,'').replaceAll('\\','/')}))};
  if(args.stats){mkdirSync(dirname(args.stats),{recursive:true});writeFileSync(args.stats,JSON.stringify(stats,null,2)+'\n');}
  console.log(JSON.stringify(stats));
}
