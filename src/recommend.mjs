// Offline stack recommender. No network and no model call.
// `kloudy recommend <goal> [--json]` and `kloudy stack <goal> [--json]`.
import {readFileSync} from 'node:fs';
import {flags,loadLocal,localEndpoints} from './bots.mjs';
import {primarySortHint} from './modalities.mjs';

export const RECOMMEND_SCHEMA='kloudy.recommend/1';
export const CATALOG_NAME='kloudy 1.0';
const PER_MODALITY=5;
// Class order for recommendations is A, then B, then O.
// Primary-modality hint, keyword hits, catalog score, and index tie-break
// follow the comparator in localSearch.
const CLASS_TIER={A:0,B:1,O:2};
const words=s=>String(s||'').toLowerCase().split(/[^\p{L}\p{N}_]+/u).filter(w=>w.length>1);

const RULE_LIST=[
  ['text to speech',['voice_generation']],
  ['text-to-speech',['voice_generation']],
  ['speech synthesis',['voice_generation']],
  ['voice generation',['voice_generation']],
  ['voice over',['voice_generation']],
  ['voiceover',['voice_generation']],
  ['text to image',['image_generation']],
  ['text-to-image',['image_generation']],
  ['image generation',['image_generation']],
  ['generate images',['image_generation']],
  ['generate image',['image_generation']],
  ['stable diffusion',['image_generation']],
  ['txt2img',['image_generation']],
  ['code execution',['code_execution']],
  ['execute code',['code_execution']],
  ['run code',['code_execution']],
  ['browser automation',['browser_automation']],
  ['web scraping',['browser_automation']],
  ['file system',['file_system']],
  ['command line',['cli']],
  ['command-line',['cli']],
  ['vector database',['embedding']],
  ['vector store',['embedding']],
  ['rest api',['api_calls']],
  ['api calls',['api_calls']],
  ['api call',['api_calls']],
  ['function calls',['agent_tools']],
  ['function call',['agent_tools']],
  ['function calling',['agent_tools']],
  ['tool calling',['agent_tools']],
  ['agent tools',['agent_tools']],
  ['agent tool',['agent_tools']],
  ['retrieval augmented',['rag']],
  ['microsoft teams',['chat_platforms']],
  ['chat window',['chat_ui']],
  ['chat ui',['chat_ui']],
  ['model server',['inference']],
  ['web search',['search']],
  ['transcribes',['audio']],
  ['transcribe',['audio']],
  ['transcribed',['audio']],
  ['transcribing',['audio']],
  ['transcriptions',['audio']],
  ['transcription',['audio']],
  ['summarizes',['text']],
  ['summarize',['text']],
  ['summarized',['text']],
  ['summarizing',['text']],
  ['summarization',['text']],
  ['summaries',['text']],
  ['summary',['text']],
  ['voice',['audio']],
  ['speech',['audio']],
  ['audio',['audio']],
  ['whisper',['audio']],
  ['microphone',['audio']],
  ['phone',['audio']],
  ['calls',['audio']],
  ['listen',['audio']],
  ['asr',['audio']],
  ['tts',['voice_generation']],
  ['speak',['voice_generation']],
  ['speaking',['voice_generation']],
  ['draw',['image_generation']],
  ['drawing',['image_generation']],
  ['images',['image']],
  ['image',['image']],
  ['pictures',['image']],
  ['picture',['image']],
  ['photos',['image']],
  ['photo',['image']],
  ['vision',['image']],
  ['videos',['video']],
  ['video',['video']],
  ['youtube',['video']],
  ['multimodal',['multimodal']],
  ['translates',['translation']],
  ['translate',['translation']],
  ['translation',['translation']],
  ['translator',['translation']],
  ['databases',['database_access']],
  ['database',['database_access']],
  ['postgresql',['database_access']],
  ['postgres',['database_access']],
  ['mongodb',['database_access']],
  ['sqlite',['database_access']],
  ['mysql',['database_access']],
  ['sql',['database_access']],
  ['storage',['database_access']],
  ['stored',['database_access']],
  ['stores',['database_access']],
  ['storing',['database_access']],
  ['store',['database_access']],
  ['filesystem',['file_system']],
  ['files',['file_system']],
  ['file',['file_system']],
  ['directory',['file_system']],
  ['folders',['file_system']],
  ['folder',['file_system']],
  ['disk',['file_system']],
  ['playwright',['browser_automation']],
  ['puppeteer',['browser_automation']],
  ['selenium',['browser_automation']],
  ['scraping',['browser_automation']],
  ['scrape',['browser_automation']],
  ['browser',['browser_automation']],
  ['webhooks',['api_calls']],
  ['webhook',['api_calls']],
  ['graphql',['api_calls']],
  ['apis',['api_calls']],
  ['api',['api_calls']],
  ['scheduling',['scheduling']],
  ['schedules',['scheduling']],
  ['schedule',['scheduling']],
  ['calendar',['scheduling']],
  ['reminders',['scheduling']],
  ['reminder',['scheduling']],
  ['cron',['scheduling']],
  ['notifications',['notifications']],
  ['notification',['notifications']],
  ['notify',['notifications']],
  ['alerts',['notifications']],
  ['alert',['notifications']],
  ['authentication',['auth_encryption']],
  ['encryption',['auth_encryption']],
  ['encrypt',['auth_encryption']],
  ['passwords',['auth_encryption']],
  ['password',['auth_encryption']],
  ['oauth',['auth_encryption']],
  ['login',['auth_encryption']],
  ['auth',['auth_encryption']],
  ['analytics',['data_analysis']],
  ['analysis',['data_analysis']],
  ['analyze',['data_analysis']],
  ['statistics',['data_analysis']],
  ['statistical',['data_analysis']],
  ['dataframe',['data_analysis']],
  ['documents',['document_processing']],
  ['document',['document_processing']],
  ['docx',['document_processing']],
  ['pdf',['document_processing']],
  ['ocr',['document_processing']],
  ['robotics',['robotics']],
  ['robots',['robotics']],
  ['robot',['robotics']],
  ['ros',['robotics']],
  ['embeddings',['embedding']],
  ['embedding',['embedding']],
  ['vectors',['embedding']],
  ['vector',['embedding']],
  ['searching',['search']],
  ['searches',['search']],
  ['search',['search']],
  ['lookup',['search']],
  ['websites',['web']],
  ['website',['web']],
  ['crawling',['web']],
  ['crawl',['web']],
  ['html',['web']],
  ['url',['web']],
  ['web',['web']],
  ['datasets',['data']],
  ['dataset',['data']],
  ['csv',['data']],
  ['etl',['data']],
  ['kubernetes',['cloud']],
  ['azure',['cloud']],
  ['cloud',['cloud']],
  ['aws',['cloud']],
  ['gcp',['cloud']],
  ['k8s',['cloud']],
  ['payments',['finance']],
  ['payment',['finance']],
  ['invoices',['finance']],
  ['invoice',['finance']],
  ['accounting',['finance']],
  ['trading',['finance']],
  ['stripe',['finance']],
  ['finance',['finance']],
  ['spreadsheets',['productivity']],
  ['spreadsheet',['productivity']],
  ['productivity',['productivity']],
  ['todos',['productivity']],
  ['todo',['productivity']],
  ['notes',['productivity']],
  ['messaging',['comms']],
  ['emails',['comms']],
  ['email',['comms']],
  ['sms',['comms']],
  ['vulnerabilities',['security']],
  ['vulnerability',['security']],
  ['security',['security']],
  ['pentest',['security']],
  ['geospatial',['maps']],
  ['locations',['maps']],
  ['location',['maps']],
  ['geocode',['maps']],
  ['maps',['maps']],
  ['map',['maps']],
  ['memories',['memory']],
  ['memory',['memory']],
  ['remember',['memory']],
  ['orchestration',['orchestration']],
  ['orchestrate',['orchestration']],
  ['workflows',['orchestration']],
  ['workflow',['orchestration']],
  ['pipelines',['orchestration']],
  ['pipeline',['orchestration']],
  ['cuda',['gpu_compute']],
  ['gpu',['gpu_compute']],
  ['mathematics',['math']],
  ['equations',['math']],
  ['equation',['math']],
  ['calculator',['math']],
  ['math',['math']],
  ['rag',['rag']],
  ['telegram',['chat_platforms']],
  ['discord',['chat_platforms']],
  ['slack',['chat_platforms']],
  ['chatbot',['chat_ui']],
  ['terminal',['cli']],
  ['shell',['cli']],
  ['cli',['cli']],
  ['benchmarks',['evaluation']],
  ['benchmark',['evaluation']],
  ['evaluation',['evaluation']],
  ['evaluate',['evaluation']],
  ['observability',['observability']],
  ['monitoring',['observability']],
  ['metrics',['observability']],
  ['tracing',['observability']],
  ['logs',['observability']],
  ['rabbitmq',['queues']],
  ['queues',['queues']],
  ['queue',['queues']],
  ['kafka',['queues']],
  ['inference',['inference']],
  ['vllm',['inference']],
  ['simulations',['simulation']],
  ['simulation',['simulation']],
  ['simulator',['simulation']],
  ['simulate',['simulation']],
  ['writing',['text']],
  ['prompt',['text']],
  ['chat',['text']],
  ['llm',['text']],
  ['text',['text']],
  ['coding',['code']],
  ['programming',['code']],
  ['developer',['code']],
  ['software',['code']],
  ['code',['code']],
  ['sandbox',['code_execution']],
  ['interpreter',['code_execution']],
  ['repl',['code_execution']]
];

export const KEYWORD_RULES=RULE_LIST.map(([phrase,modalities])=>({phrase,modalities:[...modalities]}))
  .sort((a,b)=>b.phrase.length-a.phrase.length||a.phrase.localeCompare(b.phrase));

const CLAUSE_SPLIT=/\s*(?:,|;|&)\s*|\s+\b(?:and|then)\b\s+/i;
const EDGE_STOP=new Set(['a','an','the','that','which','who','to','for','of','in','on','with','and','then','into','from','by','or','also']);

function bounded(text,start,end){
  const before=start===0||!/[\p{L}\p{N}_]/u.test(text[start-1]);
  const after=end===text.length||!/[\p{L}\p{N}_]/u.test(text[end]);
  return before&&after;
}

export function findKeywordHits(text){
  const lower=String(text||'').toLowerCase();
  const found=[];
  for(const rule of KEYWORD_RULES){
    let from=0;
    while(from<=lower.length-rule.phrase.length){
      const i=lower.indexOf(rule.phrase,from);
      if(i<0)break;
      const end=i+rule.phrase.length;
      if(bounded(lower,i,end)&&!found.some(h=>i<h.end&&end>h.start))found.push({start:i,end,phrase:rule.phrase,modalities:rule.modalities});
      from=i+1;
    }
  }
  found.sort((a,b)=>a.start-b.start||a.end-b.end);
  return found;
}

function cleanPart(text){
  const bits=String(text||'').replace(/\s+/g,' ').trim().replace(/^[,;:.]+|[,;:.]+$/g,'').split(' ').filter(Boolean);
  while(bits.length&&EDGE_STOP.has(bits[0].toLowerCase()))bits.shift();
  while(bits.length&&EDGE_STOP.has(bits[bits.length-1].toLowerCase()))bits.pop();
  return bits.join(' ');
}

function overlaps(a,b){
  return a.some(m=>b.includes(m));
}

function clauseLabel(clause){
  return cleanPart(clause)||String(clause||'').replace(/\s+/g,' ').trim();
}

function partsFromClause(clause){
  const hits=findKeywordHits(clause);
  if(!hits.length){
    const text=clauseLabel(clause);
    return text?[{text,modalities:[],keywords:[]}]:[];
  }
  const groups=[];
  for(const hit of hits){
    const last=groups[groups.length-1];
    if(last&&overlaps(last.modalities,hit.modalities)){
      last.hits.push(hit);
      for(const m of hit.modalities)if(!last.modalities.includes(m))last.modalities.push(m);
      if(!last.keywords.includes(hit.phrase))last.keywords.push(hit.phrase);
    }else groups.push({modalities:[...hit.modalities],keywords:[hit.phrase],hits:[hit]});
  }
  if(groups.length===1){
    const text=clauseLabel(clause)||groups[0].keywords.join(' ');
    return [{text,modalities:groups[0].modalities,keywords:groups[0].keywords}];
  }
  return groups.map((group,i)=>{
    const start=i===0?0:splitPoint(clause,groups[i-1].hits.at(-1).end,group.hits[0].start);
    const end=i===groups.length-1?clause.length:splitPoint(clause,group.hits.at(-1).end,groups[i+1].hits[0].start);
    const text=clauseLabel(clause.slice(start,end))||group.keywords.join(' ');
    return {text,modalities:group.modalities,keywords:group.keywords};
  });
}

function splitPoint(clause,leftEnd,rightStart){
  const gap=clause.slice(leftEnd,rightStart);
  const rel=gap.lastIndexOf(' ');
  return rel>=0?leftEnd+rel+1:Math.floor((leftEnd+rightStart)/2);
}

export function decomposeGoal(goal){
  const text=String(goal||'').replace(/\s+/g,' ').trim();
  if(!text)return [];
  const parts=[];
  for(const clause of text.split(CLAUSE_SPLIT).map(s=>s.trim()).filter(Boolean))parts.push(...partsFromClause(clause));
  return parts;
}

export function packageVersion(){
  return JSON.parse(readFileSync(new URL('../package.json',import.meta.url),'utf8')).version;
}

export function installCommand(bot){
  const eps=localEndpoints(bot);
  for(const ep of eps)if(ep.command)return ep.command;
  for(const ep of eps)if(ep.url)return ep.url;
  return bot.endpoint||'';
}

function oneLine(bot){
  const caps=(bot.caps||[]).map(c=>String(c).replace(/^cap\./,'').replace(/^mcp\./,'').replace(/[._]+/g,' ').trim()).filter(c=>c&&c.toLowerCase()!=='connect');
  const kind={http:'live HTTP endpoint',npx:'npx package',uvx:'uvx package',hf:'Hugging Face model',botboozle:'open-source package'}[bot.kind]||bot.kind||'bot';
  const detail=caps.length?caps.slice(0,4).join(', '):(bot.modalities||[]).slice(0,3).join(', ');
  const line=detail?`${bot.name} — ${kind}; ${detail}`:`${bot.name} — ${kind}`;
  return line.replace(/\s+/g,' ').slice(0,180);
}

function whyLine(modality,keywords){
  const hint=(keywords||[]).filter(k=>KEYWORD_RULES.some(r=>r.phrase===k&&r.modalities.includes(modality))).slice(0,4).join('/');
  return hint?`matched ${modality}/${hint}; top-ranked in modality`:`matched ${modality}; top-ranked in modality`;
}

function rankModality(bots,modality,keywords,limit){
  const terms=[...new Set((keywords||[]).flatMap(words))];
  const want=[modality];
  const pool=[];
  for(let i=0;i<bots.length;i++){
    const b=bots[i];
    if(!(b.modalities||[]).includes(modality))continue;
    const blob=(b.name+' '+b.id+' '+(b.caps||[]).join(' ')).toLowerCase();
    pool.push({b,i,hits:terms.filter(t=>blob.includes(t)).length});
  }
  const tier=cls=>CLASS_TIER[cls]??9;
  pool.sort((x,y)=>tier(x.b.cls)-tier(y.b.cls)||primarySortHint(y.b.modality_primary,want)-primarySortHint(x.b.modality_primary,want)||y.hits-x.hits||(y.b.score||0)-(x.b.score||0)||x.i-y.i||String(x.b.id).localeCompare(String(y.b.id)));
  return pool.slice(0,limit).map(x=>x.b);
}

export function recommendGoal(goal,options={}){
  const source=options.bots?{bots:options.bots}:loadLocal();
  if(!source?.bots)throw new Error('No local catalog. Run `kloudy bots sync`.');
  const limit=options.perModality??PER_MODALITY;
  const pieces=decomposeGoal(goal);
  const parts=[];
  const unmatched=[];
  const consider=pieces.length?pieces:[{text:String(goal||'').trim(),modalities:[],keywords:[]}];
  for(const piece of consider){
    if(!piece.text)continue;
    if(!piece.modalities.length){
      unmatched.push({part:piece.text,reason:'no modality or catalog match'});
      continue;
    }
    const seen=new Map();
    const bots=[];
    for(const modality of piece.modalities){
      for(const bot of rankModality(source.bots,modality,piece.keywords,limit)){
        const prev=seen.get(bot.id);
        if(prev){
          if(!prev.modalities.includes(modality))prev.modalities.push(modality);
          continue;
        }
        const item={
          id:bot.id,
          name:bot.name,
          class:bot.cls,
          command:installCommand(bot),
          license:bot.license||'',
          description:oneLine(bot),
          why:whyLine(modality,piece.keywords),
          modalities:[modality]
        };
        seen.set(bot.id,item);
        bots.push(item);
      }
    }
    if(!bots.length){
      unmatched.push({part:piece.text,reason:'no modality or catalog match'});
      continue;
    }
    parts.push({part:piece.text,modalities:piece.modalities,bots});
  }
  return {schema:RECOMMEND_SCHEMA,catalog:CATALOG_NAME,version:options.version||packageVersion(),goal:String(goal??''),parts,unmatched};
}

export function formatRecommend(result){
  const lines=[`${result.catalog}  ·  package ${result.version}`,`Goal: ${result.goal}`];
  result.parts.forEach((part,index)=>{
    lines.push('',`${index+1}. ${part.part}`,`Modalities: ${part.modalities.join(', ')}`);
    part.bots.forEach((bot,n)=>{
      lines.push(`  ${n+1}) ${bot.id}  [${bot.class}]  ${bot.license||'unknown license'}`,`     ${bot.command}`,`     ${bot.description}`,`     why: ${bot.why}`);
    });
  });
  if(result.unmatched.length){
    lines.push('','Unmatched');
    for(const item of result.unmatched)lines.push(`- ${item.part}: ${item.reason}`);
  }
  return lines.join('\n');
}

export function recommendCommand(args,opts={}){
  const out=opts.out||(s=>console.log(s));
  const o=flags(args);
  const goal=o._.join(' ').trim();
  if(!goal)throw new Error('Usage: kloudy recommend <goal> [--json]');
  const result=recommendGoal(goal);
  out(o.json?JSON.stringify(result,null,2):formatRecommend(result));
  return result;
}

export function agentsDocument(){
  return readFileSync(new URL('../AGENTS.md',import.meta.url),'utf8');
}

export function agentsCommand(opts={}){
  const out=opts.out||(s=>console.log(s));
  const text=agentsDocument().replace(/\s*$/,'');
  out(text);
  return text;
}
