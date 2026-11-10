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
// Default --subset verified-oss keeps class A (the build's verified HTTP class) and class O (OSS).
// The full A/B/C/O catalog packed over ~2 MB, so the npm snapshot omits class B (untested npx/uvx).
// `kloudy bots sync` downloads that remainder into the local cache. Pass --subset full to write it anyway.
import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {gunzipSync,gzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

const __dir=dirname(fileURLToPath(import.meta.url));
const root=resolve(__dir,'..');

const DENY_LICENSE=/(non-?commercial|academic-?only|proprietary|no license|source-?available|REVIEW|OpenMDW|Cursor skills|Cursor OSS|CC-BY-NC)/i;
const SPDX_ID=String.raw`(?:Apache-2\.0|MIT|BSD-2-Clause|BSD-3-Clause|ISC|Unlicense|CC-BY-4\.0|MPL-2\.0|GPL-2\.0(?:-only|-or-later)?|GPL-3\.0(?:-only|-or-later)?|AGPL-3\.0(?:-only|-or-later)?|LGPL-2\.1(?:-only|-or-later)?|LGPL-3\.0(?:-only|-or-later)?)`;
const ALLOW_LICENSE=new RegExp(`^${SPDX_ID}(?:\\s+(?:AND|OR)\\s+${SPDX_ID})*$`,'i');
const SECRET_VAL=/(Bearer\s+\S{8,}|sk-[a-zA-Z0-9]{10,}|AKIA[0-9A-Z]{16}|\bapi[_-]?key\s*[:=]\s*['\"]?\S{8,}|password\s*[:=]\s*['\"]?\S+)/i;
const TRITON_ID='oss:cuda:triton-inference-server/server';

export function ossDropReason(row){
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
  let dev=(row.devices||['desktop']).filter(d=>d==='desktop');
  if(!dev.length)dev=['desktop'];
  let c=[...(row.caps||[]).filter(x=>typeof x==='string')].slice(0,8);
  const needsGpu=/needs GPU/i.test(c.join(' '))||/\bneeds GPU\b/.test((row['x-notes']||''));
  const llama=row.id==='oss:catalog:ggml-org/llama.cpp'||row.id==='oss:resources:abetlen/llama-cpp-python';
  if(llama){c=c.filter(x=>x!=='needs GPU');if(!c.includes('GPU optional'))c.push('GPU optional');}
  else if(needsGpu&&!c.includes('needs GPU'))c.push('needs GPU');
  return {devices:dev,caps:c};
}

export function ossRowToTuple(row){
  const {devices,caps:rowCaps}=ossDevicesAndCaps(row);
  const kind=row.kind;
  if(!['http','npx','uvx','botboozle'].includes(kind))return null;
  return [row.id,String(row.name).slice(0,160),kind,'O',ossEndpoint(row),String(row.license||'').slice(0,80),String(row.source_url||'').slice(0,300),0,rowCaps,devices,kind==='botboozle','oss'];
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
  const stats={duplicates:0,added:0};
  const idSet=existingIds||new Set(bots.map(b=>b[0]));
  for(const t of ossRows){
    if(idSet.has(t[0])){stats.duplicates++;continue;}
    bots.push(t);idSet.add(t[0]);stats.added++;
  }
  return stats;
}

function parseArgs(argv){
  const out={subset:'verified-oss',base:resolve(root,'data/catalog/deployable-bots-base.json.gz'),oss:[],dest:resolve(root,'src/deployable-bots.json.gz'),stats:resolve(root,'data/catalog/bundle-stats.json')};
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
    for(const rel of ['data/oss/manifests-OSS.jsonl','data/oss/manifests-OSS-batch2.jsonl']){
      const p=resolve(root,rel);if(existsSync(p))out.oss.push(p);
    }
  }
  if(out.subset!=='full'&&out.subset!=='verified-oss')throw new Error('subset must be full or verified-oss');
  return out;
}

export function buildCatalog({base,oss,subset}){
  if(!existsSync(base))throw new Error('Missing base catalog '+base);
  const hash=createHash('sha256');
  const baseBytes=readFileSync(base);hash.update(baseBytes);
  const decoded=JSON.parse(gunzipSync(baseBytes,{maxOutputLength:250*1024*1024}));
  const bots=(decoded.bots||[]).filter(r=>r[3]!=='O'&&r[3]!=='D').map(r=>r.slice(0,11));
  const ossStats=[];
  for(const p of oss){
    const text=readFileSync(p,'utf8');hash.update(text);
    const {rows,stats}=filterOssRows(text.split('\n'));
    const merge=mergeOssIntoBots(bots,rows);
    ossStats.push({file:p,in:stats.in,kept:stats.kept,added:merge.added,duplicatesSkipped:merge.duplicates,dropped:stats.dropped});
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
