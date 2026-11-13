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
  ['scheduling',['scheduling'],{family:'timer'}],
  ['schedules',['scheduling'],{family:'timer'}],
  ['schedule',['scheduling'],{family:'timer'}],
  ['calendar',['scheduling']],
  ['reminders',['scheduling']],
  ['reminder',['scheduling']],
  ['cron',['scheduling'],{family:'timer'}],
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
  ['repl',['code_execution']],
  // Phone and calls are audio only when an audio cue is in the same clause.
  // Otherwise phone / Android / mobile are device sync, not voice tools.
  ['phone call',['audio']],
  ['phone calls',['audio']],
  ['call audio',['audio']],
  ['phone',['audio'],{when:'audio'}],
  ['calls',['audio'],{when:'audio'}],
  ['call',['audio'],{when:'audio'}],
  ['phones',['notifications','comms'],{family:'sync',when:'no-audio'}],
  ['phone',['notifications','comms'],{family:'sync',when:'no-audio'}],
  ['android',['notifications','comms'],{family:'sync'}],
  ['mobile',['notifications','comms'],{family:'sync'}],
  ['syncing',['notifications','comms'],{family:'sync'}],
  ['synced',['notifications','comms'],{family:'sync'}],
  ['syncs',['notifications','comms'],{family:'sync'}],
  ['sync',['notifications','comms'],{family:'sync'}],
  ['push notification',['notifications','comms'],{family:'sync'}],
  ['push notifications',['notifications','comms'],{family:'sync'}],
  ['galaxy watch',['data'],{family:'wearable'}],
  ['wear os',['data'],{family:'wearable'}],
  ['health connect',['data'],{family:'wearable'}],
  ['apple health',['data'],{family:'wearable'}],
  ['smartwatch',['data'],{family:'wearable'}],
  ['smart watch',['data'],{family:'wearable'}],
  ['pedometer',['data'],{family:'wearable'}],
  ['accelerometer',['data'],{family:'wearable'}],
  ['wearable',['data'],{family:'wearable'}],
  ['fitness',['data'],{family:'wearable'}],
  ['steps',['data'],{family:'wearable',when:'not-device'}],
  ['step',['data'],{family:'wearable',when:'not-device'}],
  ['watch',['data'],{family:'wearable'}],
  ['timers',['scheduling'],{family:'timer'}],
  ['timer',['scheduling'],{family:'timer'}],
  ['triggers',['scheduling'],{family:'timer',when:'timer'}],
  ['trigger',['scheduling'],{family:'timer',when:'timer'}],
  ['triggered',['scheduling'],{family:'timer',when:'timer'}],
  ['movement',['scheduling'],{family:'timer',when:'movement-timer'}],
  ['movement',['data'],{family:'wearable',when:'movement-sensor'}],
  ['calories',['text'],{family:'nutrition'}],
  ['calorie',['text'],{family:'nutrition'}],
  ['nutrition',['text'],{family:'nutrition'}],
  ['recipes',['text'],{family:'nutrition'}],
  ['recipe',['text'],{family:'nutrition'}],
  ['meals',['text'],{family:'nutrition'}],
  ['meal',['text'],{family:'nutrition'}],
  ['diets',['text'],{family:'nutrition'}],
  ['diet',['text'],{family:'nutrition'}],
  ['foods',['text'],{family:'nutrition'}],
  ['food',['text'],{family:'nutrition'}],
  ['facebook',['comms'],{family:'social'}],
  ['instagram',['comms'],{family:'social'}],
  ['twitter',['comms'],{family:'social'}],
  ['shares',['comms'],{family:'social',when:'social'}],
  ['shared',['comms'],{family:'social',when:'social'}],
  ['sharing',['comms'],{family:'social',when:'social'}],
  ['share',['comms'],{family:'social',when:'social'}],
  ['posting',['comms'],{family:'social',when:'social'}],
  ['posts',['comms'],{family:'social',when:'social'}],
  ['posted',['comms'],{family:'social',when:'social'}],
  ['post',['comms'],{family:'social',when:'social'}],
  ['x',['comms'],{family:'social',when:'social-x'}]
];

export const KEYWORD_RULES=RULE_LIST.map(([phrase,modalities,meta])=>({phrase,modalities:[...modalities],...(meta||{})}))
  .sort((a,b)=>b.phrase.length-a.phrase.length||a.phrase.localeCompare(b.phrase)||(a.when||'').localeCompare(b.when||''));

const CLAUSE_SPLIT=/\s*(?:,|;|&)\s*|\s+\b(?:and|then)\b\s+/i;
const EDGE_STOP=new Set(['a','an','the','that','which','who','to','for','of','in','on','with','and','then','into','from','by','or','also']);

function bounded(text,start,end){
  const before=start===0||!/[\p{L}\p{N}_]/u.test(text[start-1]);
  const after=end===text.length||!/[\p{L}\p{N}_]/u.test(text[end]);
  return before&&after;
}

const AUDIO_CUE=/\b(?:transcri(?:be|bes|bed|bing|ption|ptions)?|voices?|speech|audio|whisper|microphones?|asr|listen(?:s|ing|ed)?|phone calls?|call audio)\b/i;
const DEVICE_CUE=/\b(?:android|mobile|phones?|sync(?:ing|ed|s)?)\b/i;
const TIMER_CUE=/\b(?:timers?|schedul\w*|cron|triggers?|triggered)\b/i;
const DB_CUE=/\b(?:databases?|sql|postgres(?:ql)?|mysql|sqlite|mongodb)\b/i;
const SOCIAL_NET=/\b(?:facebook|instagram|twitter)\b/i;
const SOCIAL_X=/(?:\bx\.com\b|\b(?:post|share|tweet)(?:s|ed|ing)?\b[^.!?\n]{0,40}\bx\b|\bx\b[^.!?\n]{0,40}\b(?:post|share|tweet)(?:s|ed|ing)?\b)/i;

function ruleApplies(rule,text){
  switch(rule.when){
    case 'audio':return AUDIO_CUE.test(text);
    case 'no-audio':return !AUDIO_CUE.test(text);
    case 'social':return SOCIAL_NET.test(text)||SOCIAL_X.test(text);
    case 'social-x':return SOCIAL_X.test(text);
    case 'timer':return TIMER_CUE.test(text)&&!DB_CUE.test(text);
    case 'movement-timer':return TIMER_CUE.test(text);
    case 'movement-sensor':return !TIMER_CUE.test(text);
    case 'not-device':return !DEVICE_CUE.test(text);
    default:return true;
  }
}

export function findKeywordHits(text){
  const lower=String(text||'').toLowerCase();
  const found=[];
  for(const rule of KEYWORD_RULES){
    if(!ruleApplies(rule,lower))continue;
    let from=0;
    while(from<=lower.length-rule.phrase.length){
      const i=lower.indexOf(rule.phrase,from);
      if(i<0)break;
      const end=i+rule.phrase.length;
      if(bounded(lower,i,end)&&!found.some(h=>i<h.end&&end>h.start))found.push({start:i,end,phrase:rule.phrase,modalities:rule.modalities,family:rule.family||null});
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
    return text?[{text,modalities:[],keywords:[],family:null}]:[];
  }
  const groups=[];
  for(const hit of hits){
    const last=groups[groups.length-1];
    if(last&&overlaps(last.modalities,hit.modalities)){
      last.hits.push(hit);
      for(const m of hit.modalities)if(!last.modalities.includes(m))last.modalities.push(m);
      if(!last.keywords.includes(hit.phrase))last.keywords.push(hit.phrase);
      if(hit.family&&!last.family)last.family=hit.family;
    }else groups.push({modalities:[...hit.modalities],keywords:[hit.phrase],hits:[hit],family:hit.family||null});
  }
  if(groups.length===1){
    const text=clauseLabel(clause)||groups[0].keywords.join(' ');
    return [{text,modalities:groups[0].modalities,keywords:groups[0].keywords,family:groups[0].family}];
  }
  return groups.map((group,i)=>{
    const start=i===0?0:splitPoint(clause,groups[i-1].hits.at(-1).end,group.hits[0].start);
    const end=i===groups.length-1?clause.length:splitPoint(clause,group.hits.at(-1).end,groups[i+1].hits[0].start);
    const text=clauseLabel(clause.slice(start,end))||group.keywords.join(' ');
    return {text,modalities:group.modalities,keywords:group.keywords,family:group.family};
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

function whyLine(modality,keywords,tail='top-ranked in modality'){
  const hint=(keywords||[]).filter(k=>KEYWORD_RULES.some(r=>r.phrase===k&&r.modalities.includes(modality))).slice(0,4).join('/');
  return hint?`matched ${modality}/${hint}; ${tail}`:`matched ${modality}; ${tail}`;
}

const KIND_CATALOG='catalog integration';
const KIND_SUGGEST='suggestion: build yourself / platform API';
const OPTIONAL_COVERAGE=new Set(['share','shares','shared','sharing','post','posts','posting','posted','send','sends','sending','sent','detect','detects','detecting','start','starts','starting','create','creates','use','uses','using','based','optionally','optional','results','data','experience','that','them']);
const SUGGEST={
  wearable:'Wear OS sensor APIs and Health Connect are not in the kloudy 1.0 catalog. Build the sensing yourself or call the platform API. Unverified non-catalog guidance, not a catalog bot.',
  sync:'Health Connect is not in the kloudy 1.0 catalog. It is a platform API for sending step data to an Android phone. Unverified non-catalog guidance, not a catalog bot.',
  social:'The Facebook Graph API, Instagram API, and X API are not catalog bots. Unverified non-catalog guidance. Build the post yourself or call the platform API.'
};
const WEAK_REASON={
  wearable:'Nearest catalog bots match a related fitness wearable (Garmin, Fitbit, or Apple Health), not Galaxy Watch step sensing.',
  timer:'Catalog timers or schedulers share a timer or schedule keyword, but none start a timer from movement.',
  sync:'Catalog Android tools share the Android keyword, but they do not send step data to a phone.',
  nutrition:'Catalog nutrition tools only partly overlap this meal or calorie need.',
  social:'Catalog social tools only partly overlap this post or share need.'
};
const CAP_NOISE=new Set(['connect','mcp','llm','language','agents','agent','scheduling','notifications','notification','api','calls','call','data','text','code','web','database','audio','video','image','memory','search','orchestration','skill','vision','browser','filesystem','security','cloud','comms']);
const SYNC_DENY=/\b(?:figma|frida|linkedin|phonepe|phonehome|phone-a-friend|phone-harness)\b/i;
const WATCH_DENY=/opencode|watchtower|framewatch|filewatch|firewatch|cloudwatch|swatch|cybersec|rewatch|langwatch|webwatch|vibewatch/i;

function contentKeywords(keywords){
  const out=[];
  for(const keyword of keywords||[]){
    const text=String(keyword||'').toLowerCase();
    if(!text||OPTIONAL_COVERAGE.has(text)||out.includes(text))continue;
    out.push(text);
  }
  return out;
}

function botBlob(bot){
  const caps=(bot.caps||[]).map(c=>String(c).replace(/^cap\./,'').replace(/^mcp\./,''));
  return `${bot.name||''} ${bot.id||''} ${caps.join(' ')}`.toLowerCase();
}

function botTokens(bot){
  return new Set(words(botBlob(bot)).filter(token=>!CAP_NOISE.has(token)));
}

function tokenCovers(tokens,raw,keyword){
  const key=String(keyword||'').toLowerCase();
  if(!key)return false;
  if(key==='x')return tokens.has('twitter')||/(^|[^a-z0-9])x([^a-z0-9]|$)/.test(raw);
  if(key.includes(' '))return raw.includes(key);
  if(tokens.has(key))return true;
  if(key.length>=6&&raw.includes(key))return true;
  if(key.length>=4){
    for(const token of tokens)if(token.startsWith(key)&&token.length<=key.length+3)return true;
  }
  return false;
}

function timerToken(token){
  if(token==='timer'||token==='timers')return true;
  if(token.startsWith('schedule')||token.includes('scheduler'))return true;
  if(token==='cron'||(token.startsWith('cron')&&!token.startsWith('cronomet')&&token.length<=10))return true;
  return false;
}

function familyHit(family,tokens,raw,keywords){
  if(family==='wearable'){
    const asked=(keywords||[]).join(' ').toLowerCase();
    if(!/watch|step|fitness|pedometer|accelerometer|wear|health|garmin|fitbit|sensor/.test(asked))return null;
    if(WATCH_DENY.test(raw))return null;
    if([...tokens].some(token=>['garmin','fitbit','pedometer','accelerometer','smartwatch','wearable','fitness'].includes(token)))return 'related';
    if(/apple-health|applehealth|health-connect|healthconnect|wear-os|wearos|galaxy-watch/.test(raw))return 'related';
    return null;
  }
  if(family==='timer'){
    const want=new Set((keywords||[]).map(keyword=>keyword.toLowerCase()));
    if([...tokens].some(timerToken))return [...tokens].some(token=>token==='timer'||token==='timers')?'direct':'related';
    if((want.has('trigger')||want.has('triggers')||want.has('triggered'))&&[...tokens].some(token=>token==='trigger'||token.startsWith('trigger')))return 'direct';
    return null;
  }
  if(family==='sync'){
    if(SYNC_DENY.test(raw))return null;
    if([...tokens].some(token=>token==='android'||token==='adb'))return 'direct';
    const want=new Set((keywords||[]).map(keyword=>keyword.toLowerCase()));
    if(want.has('mobile')&&tokens.has('mobile'))return 'related';
    if((want.has('phone')||want.has('phones'))&&(tokens.has('android')||tokens.has('adb')||tokens.has('sms')||[...tokens].some(token=>token.startsWith('push')||token.startsWith('notif'))))return 'related';
    if((want.has('sync')||want.has('syncs')||want.has('synced')||want.has('syncing'))&&tokens.has('sync'))return 'related';
    return null;
  }
  if(family==='nutrition'){
    const want=new Set((keywords||[]).map(keyword=>keyword.toLowerCase()));
    const allowed=new Set(['calorie','calories','nutrition','meal','meals','mealie','diet','diets','recipe','recipes']);
    if(want.has('food')||want.has('foods')){allowed.add('food');allowed.add('foods');}
    const hit=[...tokens].some(token=>allowed.has(token)||(allowed.has('meal')&&token.startsWith('meal')&&token.length<=7)||token.startsWith('calorie'));
    return hit?'related':null;
  }
  if(family==='social'){
    const want=new Set((keywords||[]).map(keyword=>keyword.toLowerCase()));
    const nets=['facebook','instagram','twitter'].filter(net=>want.has(net)||(net==='twitter'&&want.has('x')));
    const have=[...tokens].filter(token=>token==='facebook'||token==='instagram'||token==='twitter');
    if(!have.length)return null;
    if(nets.length&&!nets.some(net=>have.includes(net)))return null;
    return 'direct';
  }
  return null;
}

function selectFamily(bots,piece,limit){
  const want=piece.modalities||[];
  const pool=[];
  for(let i=0;i<bots.length;i++){
    const bot=bots[i];
    if(!installCommand(bot))continue;
    const raw=botBlob(bot);
    const tokens=botTokens(bot);
    const hit=familyHit(piece.family,tokens,raw,piece.keywords);
    if(!hit)continue;
    const need=contentKeywords(piece.keywords);
    const hits=need.filter(keyword=>tokenCovers(tokens,raw,keyword)).length;
    pool.push({b:bot,i,hits,direct:hit==='direct'||need.some(keyword=>tokenCovers(tokens,raw,keyword))?1:0});
  }
  const tier=cls=>CLASS_TIER[cls]??9;
  pool.sort((x,y)=>y.direct-x.direct||tier(x.b.cls)-tier(y.b.cls)||primarySortHint(y.b.modality_primary,want)-primarySortHint(x.b.modality_primary,want)||y.hits-x.hits||(y.b.score||0)-(x.b.score||0)||x.i-y.i||String(x.b.id).localeCompare(String(y.b.id)));
  const chosen=pool.slice(0,limit).map(x=>x.b);
  const need=contentKeywords(piece.keywords);
  const confidence=!chosen.length?'none':!need.length||need.every(keyword=>chosen.some(bot=>tokenCovers(botTokens(bot),botBlob(bot),keyword)))?'match':'weak';
  return {bots:chosen,confidence};
}

function botItem(bot,modality,keywords,tail){
  return {
    id:bot.id,
    name:bot.name,
    class:bot.cls,
    command:installCommand(bot),
    license:bot.license||'',
    description:oneLine(bot),
    why:whyLine(modality,keywords,tail),
    modalities:[modality]
  };
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

function recordPiece(piece,bots,confidence,parts,unmatched,gaps){
  if(bots.length)parts.push({part:piece.text,modalities:piece.modalities,confidence,bots});
  else unmatched.push({part:piece.text,reason:'no modality or catalog match'});
  if(confidence==='match')return;
  if(bots.length)gaps.push({part:piece.text,confidence,reason:WEAK_REASON[piece.family]||'Catalog hits only partly overlap this part.',kind:KIND_CATALOG});
  const suggestKind=piece.family==='wearable'||piece.family==='sync'||piece.family==='social';
  if(suggestKind&&SUGGEST[piece.family])gaps.push({part:piece.text,confidence:'none',reason:SUGGEST[piece.family],kind:KIND_SUGGEST});
  else if(!bots.length)gaps.push({part:piece.text,confidence:'none',reason:'no modality or catalog match'});
}

export function recommendGoal(goal,options={}){
  const source=options.bots?{bots:options.bots}:loadLocal();
  if(!source?.bots)throw new Error('No local catalog. Run `kloudy bots sync`.');
  const limit=options.perModality??PER_MODALITY;
  const pieces=decomposeGoal(goal);
  const parts=[];
  const unmatched=[];
  const gaps=[];
  const consider=pieces.length?pieces:[{text:String(goal||'').trim(),modalities:[],keywords:[],family:null}];
  for(const piece of consider){
    if(!piece.text)continue;
    if(piece.family){
      const picked=selectFamily(source.bots,piece,limit);
      const modality=piece.modalities[0];
      const bots=picked.bots.map(bot=>botItem(bot,modality,piece.keywords,'catalog name search'));
      for(const bot of bots)bot.modalities=[...piece.modalities];
      recordPiece(piece,bots,picked.confidence,parts,unmatched,gaps);
      continue;
    }
    if(!piece.modalities.length){
      recordPiece(piece,[], 'none',parts,unmatched,gaps);
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
        const item=botItem(bot,modality,piece.keywords);
        seen.set(bot.id,item);
        bots.push(item);
      }
    }
    recordPiece(piece,bots,bots.length?'match':'none',parts,unmatched,gaps);
  }
  const complete=parts.length>0&&parts.every(part=>part.confidence==='match')&&gaps.length===0&&unmatched.length===0;
  return {schema:RECOMMEND_SCHEMA,catalog:CATALOG_NAME,version:options.version||packageVersion(),goal:String(goal??''),complete,parts,unmatched,gaps};
}

export function formatRecommend(result){
  const lines=[`${result.catalog}  ·  package ${result.version}`,`Goal: ${result.goal}`,`complete=${result.complete?'true':'false'}`];
  result.parts.forEach((part,index)=>{
    lines.push('',`${index+1}. ${part.part}`,`Modalities: ${part.modalities.join(', ')}`,`Confidence: ${part.confidence}`);
    part.bots.forEach((bot,n)=>{
      lines.push(`  ${n+1}) ${bot.id}  [${bot.class}]  ${bot.license||'unknown license'}`,`     ${bot.command}`,`     ${bot.description}`,`     why: ${bot.why}`);
    });
  });
  if(result.unmatched.length){
    lines.push('','Unmatched');
    for(const item of result.unmatched)lines.push(`- ${item.part}: ${item.reason}`);
  }
  lines.push('','Gaps');
  if(!result.gaps.length)lines.push('(none)');
  else for(const gap of result.gaps)lines.push(`- ${gap.part} [${gap.confidence}]${gap.kind?` ${gap.kind}:`:''} ${gap.reason}`);
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
