// `kloudy bots` — offline-first deployable-bots catalog.
//   kloudy bots list   [--status verified|untested|reported-broken] [--kind http|npx|uvx|botboozle|hf] [--modality m] [--all-modalities] [--device d] [--limit n] [--offset n] [--json]
//   kloudy bots search <words> [same flags]
//   kloudy bots get    <id> [--json]
//   kloudy bots sync                      download the full catalog to the local cache
//   kloudy bots probe  <id>               HTTPK: MCP initialize + tools/list against a verified HTTP bot
//   --api <base> or KLOUDY_API=<base>     use that server (e.g. http://127.0.0.1:4360) live, cache as fallback
//   kloudy bots works|broken <id>         tell Kloudy whether a bot worked for you (free, keyless, no personal data)
// Lookup order: bundled catalog (if this build ships one) -> ~/.cache/kloudy/deployable-bots.json.gz -> live API.
import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {homedir} from 'node:os';
import {join} from 'node:path';
import {modalityWant,rowMatchesModalities,primarySortHint} from './modalities.mjs';
let BASE=process.env.KLOUDY_BOTS_API||(process.env.KLOUDY_API?process.env.KLOUDY_API.replace(/\/$/,'')+'/api/deployable-bots':'https://kloudy.ai/api/deployable-bots');
let EXPLICIT=!!(process.env.KLOUDY_BOTS_API||process.env.KLOUDY_API);
const cacheDir=()=>process.env.KLOUDY_CACHE_DIR||join(process.env.XDG_CACHE_HOME||join(homedir(),'.cache'),'kloudy');
const cacheFile=()=>join(cacheDir(),'deployable-bots.json.gz');
const bundled=[new URL('./deployable-bots.json.gz',import.meta.url)];
const words=s=>String(s||'').toLowerCase().split(/[^\p{L}\p{N}_]+/u).filter(w=>w.length>1);
function decode(buf){const d=JSON.parse(gunzipSync(buf));return d.bots.map(r=>{const [id,name,kind,cls,endpoint,license,url,score,caps,targets,botboozle,source,meta]=r;return {id,name,kind,cls,endpoint,license,url,score,caps,targets,botboozle,source,meta,modalities:meta?.modalities||[],modality_primary:meta?.modalityPrimary||null};}).filter(b=>b.cls!=='D');}
export function loadLocal(){
  for(const p of [cacheFile(),...bundled])try{if(existsSync(p))return {source:String(p),bots:decode(readFileSync(p))};}catch{}
  return null;
}

function localEndpoints(b){
  if(Array.isArray(b.meta?.connect)&&b.meta.connect.length){
    return b.meta.connect.map(ep=>{
      const out={type:ep.type};
      if(ep.url)out.url=ep.url;
      if(ep.value)out.command=ep.value;
      if(ep.os)out.os=ep.os;
      if(ep.protocol)out.protocol=ep.protocol;
      return out;
    });
  }
  if(b.kind==='http')return [{type:'mcp-http',url:b.endpoint}];
  return [{type:b.kind==='hf'?b.kind:'local-'+b.kind,command:b.endpoint}];
}
function formatHfGet(bot){
  const h=bot.meta?.hf||{};
  const lines=[`${bot.id}  [hf]${bot.license?'  '+bot.license:''}`];
  if(h.repo)lines.push('Repo: '+h.repo);
  if(h.revision)lines.push('Revision: '+h.revision);
  if(h.total_size)lines.push('Size: '+h.total_size);
  if(h.runner)lines.push('Runner: '+h.runner);
  if(bot.license)lines.push('License: '+bot.license);
  lines.push('');
  lines.push('Connect (files are not downloaded automatically; say yes before any fetch):');
  const steps=(bot.meta?.connect||[]).filter(ep=>ep.type!=='source');
  if(!steps.length&&bot.endpoint)lines.push('  '+bot.endpoint);
  for(const ep of steps){
    const val=ep.value||ep.url||'';
    const os=ep.os?` (${ep.os})`:'';
    if(val)lines.push(`  [${ep.type}${os}] ${val}`);
  }
  if(bot.url)lines.push('Source: '+bot.url);
  lines.push('');
  lines.push('Nothing is installed or downloaded until you say yes.');
  return lines.join('\n');
}

const TIER={A:0,C:1,O:2,B:3};
export function localSearch(bots,{q='',status,kind,device,modality,modalities,allModalities=false,limit=25,offset=0}={}){
  const terms=words(q);let pool=bots.map((b,i)=>({b,i,hits:terms.filter(t=>(b.name+' '+b.id+' '+b.caps.join(' ')).toLowerCase().includes(t)).length}));
  if(terms.length)pool=pool.filter(x=>x.hits);
  pool=pool.map(x=>({...x,status:x.b.cls==='A'?'verified':'untested'}));
  if(status)pool=pool.filter(x=>x.status===status);if(kind)pool=pool.filter(x=>x.b.kind===kind);if(device)pool=pool.filter(x=>x.b.targets.includes(device));
  const want=modalityWant(modality||modalities);
  if(want.length)pool=pool.filter(x=>rowMatchesModalities(x.b.modalities,want,{all:!!allModalities}));
  pool.sort((x,y)=>TIER[x.b.cls]-TIER[y.b.cls]||primarySortHint(y.b.modality_primary,want)-primarySortHint(x.b.modality_primary,want)||y.hits-x.hits||y.b.score-x.b.score||x.i-y.i);
  return {matched:pool.length,offset,items:pool.slice(offset,offset+limit).map(({b,status})=>({id:b.id,name:b.name,kind:b.kind,status,endpoints:localEndpoints(b),free:true,needs_botboozle:!!b.botboozle,works_count:null,broken_count:null,license:b.license,source_url:b.url,devices:b.targets,modalities:b.modalities||[],modality_primary:b.modality_primary||null,meta:b.meta||undefined}))};
}
async function remote(path,init){const r=await fetch(BASE+path,{...init,signal:AbortSignal.timeout(8000)});const body=await r.json().catch(()=>({}));if(!r.ok)throw Object.assign(new Error(body.error||'HTTP '+r.status),{status:r.status});return body;}
// HTTPK fetch: MCP streamable-http initialize + tools/list (read-only; no tools are called).
export async function mcpProbe(url){
  const h={'content-type':'application/json',accept:'application/json, text/event-stream'};
  const rpc=async(body,extra={})=>{const r=await fetch(url,{method:'POST',headers:{...h,...extra},body:JSON.stringify(body),signal:AbortSignal.timeout(15000)});
    const t=await r.text();if(!r.ok&&r.status!==202)throw new Error('MCP HTTP '+r.status);
    const msg=r.headers.get('content-type')?.includes('event-stream')?t.split('\n').filter(l=>l.startsWith('data:')).map(l=>{try{return JSON.parse(l.slice(5))}catch{return null}}).find(m=>m&&m.id===body.id):t?JSON.parse(t):null;
    return {msg,session:r.headers.get('mcp-session-id')};};
  const init=await rpc({jsonrpc:'2.0',id:1,method:'initialize',params:{protocolVersion:'2025-06-18',capabilities:{},clientInfo:{name:'kloudy-bots',version:'0.1'}}});
  const s=init.session?{'mcp-session-id':init.session}:{};
  await fetch(url,{method:'POST',headers:{...h,...s},body:JSON.stringify({jsonrpc:'2.0',method:'notifications/initialized'}),signal:AbortSignal.timeout(15000)}).catch(()=>{});
  const list=await rpc({jsonrpc:'2.0',id:2,method:'tools/list',params:{}},s);
  if(init.msg?.error)throw new Error('initialize: '+init.msg.error.message);
  return {protocol:init.msg?.result?.protocolVersion,server:init.msg?.result?.serverInfo,tools:(list.msg?.result?.tools||[]).map(t=>({name:t.name,description:(t.description||'').slice(0,160)}))};
}
export function flags(args){const o={_:[]};for(let i=0;i<args.length;i++){const a=args[i];if(a.startsWith('--')){const k=a.slice(2);if(k==='json'||k==='offline'||k==='live'||k==='all-modalities'){o[k==='all-modalities'?'allModalities':k]=true;}else if(k==='modality'||k==='modalities'){const v=args[++i];o.modality=o.modality||[];if(v!=null)o.modality.push(...modalityWant(v));}else o[k]=args[++i];}else o._.push(a);}return o;}
const line=b=>`${b.status==='verified'?'✔':b.status==='reported-broken'?'✖':'·'} ${b.id}  [${b.kind}${b.works_count!=null?` +${b.works_count}/-${b.broken_count}`:''}]  ${b.endpoints[0].url||b.endpoints[0].command}`;
export async function botsCommand(args,opts={}){
  const out=opts.out||(s=>console.log(s));
  const [sub='list',...rest]=args,o=flags(rest);
  if(o.api){BASE=o.api.replace(/\/$/,'')+(/\/api\/deployable-bots$/.test(o.api)?'':'/api/deployable-bots');EXPLICIT=true;}
  const limit=Number(o.limit||25),offset=Number(o.offset||0);
  const print=(r,src)=>{if(o.json)return out(JSON.stringify({...r,source:src},null,2));out(`${r.matched} bots (${src})`);for(const b of r.items)out(line(b));if(r.matched>offset+r.items.length)out(`more: --offset ${offset+r.items.length}`);};
  if(sub==='sync'){const r=await fetch(BASE+'/export',{signal:AbortSignal.timeout(60000)});if(!r.ok)throw new Error('Sync failed: HTTP '+r.status);
    const {gzipSync}=await import('node:zlib');const text=await r.text();mkdirSync(cacheDir(),{recursive:true});writeFileSync(cacheFile(),gzipSync(text));out(`cached ${decode(gzipSync(text)).length} bots at ${cacheFile()}`);return;}
  if(sub==='works'||sub==='broken'){const id=o._[0];if(!id)throw new Error(`Usage: kloudy bots ${sub} <id>`);
    const r=await remote('/feedback',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({id,works:sub==='works'})});out(`thanks — recorded "${sub}" for ${r.id}`);return;}
  if(sub==='probe'){const id=o._[0];if(!id)throw new Error('Usage: kloudy bots probe <id>');
    let bot;try{bot=(await remote('/'+encodeURIComponent(id))).bot;}catch{const l=loadLocal();bot=l&&localSearch(l.bots.filter(b=>b.id===id)).items[0];}
    if(!bot)throw new Error('Unknown bot id.');const ep=bot.endpoints[0];if(!ep.url)throw new Error('probe supports HTTP bots; local bots run with: '+ep.command);
    const r=await mcpProbe(ep.url);if(o.json)return out(JSON.stringify(r,null,2));
    out(`${bot.id} -> ${ep.url}\nserver: ${r.server?.name||'?'} ${r.server?.version||''} (protocol ${r.protocol||'?'})\ntools (${r.tools.length}): ${r.tools.map(t=>t.name).join(', ')}`);return;}
  if(sub==='get'){const id=o._[0];if(!id)throw new Error('Usage: kloudy bots get <id>');
    let bot=null, local=loadLocal();
    if(!o.offline)try{bot=(await remote('/'+encodeURIComponent(id))).bot;}catch{}
    if(!bot){const hit=local&&localSearch(local.bots.filter(b=>b.id===id)).items[0];if(!hit)throw new Error('Unknown bot id (offline). Run `kloudy bots sync`.');bot={...hit,meta:hit.meta||local.bots.find(b=>b.id===id)?.meta};}
    const raw=local&&local.bots.find(b=>b.id===id);
    if(raw){bot.meta=bot.meta||raw.meta;bot.targets=bot.targets||raw.targets;}
    if(bot.kind==='hf'||raw?.kind==='hf'){
      const full=raw?{...raw,...bot,meta:bot.meta||raw.meta,url:bot.source_url||bot.url||raw.url}:bot;
      if(o.json)return out(JSON.stringify(bot,null,2));
      return out(formatHfGet(full));
    }
    return out(JSON.stringify(bot,null,2));}
  if(sub==='modalities'){
    const l=loadLocal();
    if(!l)throw new Error('No local catalog. Run `kloudy bots sync`.');
    const counts=new Map();
    let tagged=0,untagged=0;
    for(const b of l.bots){
      const mods=b.modalities||[];
      if(!mods.length){untagged++;continue;}
      tagged++;
      for(const m of mods)counts.set(m,(counts.get(m)||0)+1);
    }
    const items=[...counts.entries()].sort((a,c)=>c[1]-a[1]||a[0].localeCompare(c[0])).map(([modality,count])=>({modality,count}));
    if(o.json)return out(JSON.stringify({total:l.bots.length,tagged,untagged,items},null,2));
    out(`${items.length} modalities across ${tagged} tagged bots`+(untagged?` (${untagged} untagged)`:''));
    for(const it of items)out(`${it.count}\t${it.modality}`);
    return;
  }
  if(sub!=='list'&&sub!=='search')throw new Error('Usage: kloudy bots list|search|get|sync|works|broken|modalities');
  const q=sub==='search'?o._.join(' '):'';const query={q,status:o.status,kind:o.kind,device:o.device,modality:o.modality||o.modalities,allModalities:!!o.allModalities,limit,offset};
  const l=loadLocal();
  // Offline first: answer from bundled/cached data; the live API adds user-reported status when reachable and the cache is missing.
  if(!o.offline&&(EXPLICIT||o.live))try{const p=new URLSearchParams(Object.entries({q,status:o.status,kind:o.kind,device:o.device,modality:Array.isArray(o.modality)?o.modality.join(','):o.modality||o.modalities,all_modalities:o.allModalities?'true':undefined,intent:o.intent,tier:o.tier,limit,offset}).filter(([,v])=>v!=null&&v!==''));return print(await remote('?'+p),'live: '+BASE);}catch(e){if(!l)throw e;}
  if(l||o.offline){if(!l)throw new Error('No local catalog. Run `kloudy bots sync`.');return print(localSearch(l.bots,query),'local: '+l.source);}
  const p=new URLSearchParams(Object.entries({q,status:o.status,kind:o.kind,device:o.device,modality:Array.isArray(o.modality)?o.modality.join(','):o.modality||o.modalities,all_modalities:o.allModalities?'true':undefined,intent:o.intent,tier:o.tier,limit,offset}).filter(([,v])=>v!=null&&v!==''));
  return print(await remote('?'+p),'live');
}
