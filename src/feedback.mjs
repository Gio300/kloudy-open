// Anonymous stack feedback. Opt-in. No goal text, paths, env, or tokens.
// POST https://kloudy.ai/api/feedback and queue in the Kloudy data directory on failure.
import {existsSync,mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {dataDir} from './scores.mjs';

export const FEEDBACK_URL='https://kloudy.ai/api/feedback';
export const RESULTS=new Set(['worked','failed','partial']);
export const REASON_MAX=80;
const ALLOWED=new Set(['stackId','botId','result','reason','version','client']);
const DISABLED=new Set(['','off','offline','0','false']);

function packageVersion(){
  return JSON.parse(readFileSync(new URL('../package.json',import.meta.url),'utf8')).version;
}

export function feedbackEndpoint(explicit){
  const value=explicit??process.env.KLOUDY_FEEDBACK_URL??FEEDBACK_URL;
  return DISABLED.has(String(value).trim())?null:value;
}

export function sanitizeReason(reason){
  if(reason==null||reason==='')return undefined;
  let text=String(reason).replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim();
  if(!text)return undefined;
  if(/[\\/]|~|\.\.|[A-Za-z]:[\\/]|@[A-Za-z0-9.-]+\.[A-Za-z]{2,}|\b(?:bearer|token|secret|password|api[_-]?key)\b|-----BEGIN/i.test(text))return undefined;
  if(/[A-Fa-f0-9]{24,}/.test(text))return undefined;
  if(/(?:sk|pk|ghp|gho|xox[baprs])-/.test(text))return undefined;
  if(text.length>REASON_MAX)text=text.slice(0,REASON_MAX).trim();
  return text||undefined;
}

export function sanitizeClient(client){
  if(client==null||client==='')return undefined;
  const text=String(client).trim();
  if(!/^[A-Za-z][A-Za-z0-9._-]{0,31}$/.test(text))return undefined;
  return text;
}

export function buildFeedbackPayload(input={}){
  const stackId=String(input.stackId||'').trim();
  const botId=String(input.botId||'').trim();
  const result=input.result;
  if(!/^[a-f0-9]{64}$/.test(stackId))throw new Error('stack id must be the stackId from recommend --json');
  if(!botId||botId.length>200||/[\s\\]/.test(botId)||botId.includes('..'))throw new Error('bot id is required');
  if(!RESULTS.has(result))throw new Error('result must be worked, failed, or partial');
  const payload={stackId,botId,result,version:input.version||packageVersion()};
  const reason=sanitizeReason(input.reason===input.goal?undefined:input.reason);
  if(reason)payload.reason=reason;
  const client=sanitizeClient(input.client);
  if(client)payload.client=client;
  return payload;
}

export function queuePath(dir=dataDir()){
  return join(dir,'feedback-queue.json');
}

function safeQueued(item){
  if(!item||typeof item!=='object'||Array.isArray(item))return false;
  const keys=Object.keys(item);
  if(!keys.length||!keys.every(key=>ALLOWED.has(key)))return false;
  if(typeof item.stackId!=='string'||typeof item.botId!=='string'||typeof item.version!=='string')return false;
  if(!RESULTS.has(item.result))return false;
  if(item.reason!=null&&typeof item.reason!=='string')return false;
  if(item.client!=null&&typeof item.client!=='string')return false;
  return true;
}

export function readQueue(dir=dataDir()){
  const file=queuePath(dir);
  try{
    if(!existsSync(file))return [];
    const data=JSON.parse(readFileSync(file,'utf8'));
    return Array.isArray(data)?data.filter(safeQueued):[];
  }catch{
    return [];
  }
}

function writeQueue(dir,items){
  mkdirSync(dir,{recursive:true});
  writeFileSync(queuePath(dir),JSON.stringify(items,null,2)+'\n');
}

async function postOne(payload,fetchImpl,url){
  const response=await fetchImpl(url,{
    method:'POST',
    redirect:'error',
    credentials:'omit',
    headers:{'content-type':'application/json',accept:'application/json'},
    body:JSON.stringify(payload),
    signal:AbortSignal.timeout(8000)
  });
  if(!response?.ok)throw new Error('Feedback was not accepted');
}

export async function submitFeedback({payload,dir=dataDir(),fetchImpl=fetch,url=feedbackEndpoint()}={}){
  const queued=readQueue(dir);
  if(payload)queued.push(payload);
  if(!queued.length)return {sent:0,queued:0,status:'empty'};
  if(!url){
    writeQueue(dir,queued);
    return {sent:0,queued:queued.length,status:'queued'};
  }
  const pending=[];
  let sent=0;
  let failed=false;
  for(const item of queued){
    if(failed){pending.push(item);continue;}
    try{
      await postOne(item,fetchImpl,url);
      sent++;
    }catch{
      failed=true;
      pending.push(item);
    }
  }
  writeQueue(dir,pending);
  return {sent,queued:pending.length,status:pending.length?(sent?'partial':'queued'):'sent'};
}

export function parseFeedbackArgs(args){
  const o={};
  for(let i=0;i<args.length;i++){
    const arg=args[i];
    if(arg==='--flush'){o.flush=true;continue;}
    if(arg==='--json'){o.json=true;continue;}
    if(!arg.startsWith('--'))throw new Error('Usage: kloudy feedback --stack ID --bot ID --result worked|failed|partial [--reason TEXT] [--client NAME] [--flush]');
    const key=arg.slice(2);
    const value=args[++i];
    if(value==null||String(value).startsWith('--'))throw new Error('Option value required');
    if(!['stack','bot','result','reason','client'].includes(key))throw new Error('Unknown feedback option');
    o[key]=value;
  }
  return o;
}

function statusLine(result){
  if(result.status==='empty')return 'feedback queue is empty';
  if(result.status==='sent')return `sent ${result.sent} feedback report${result.sent===1?'':'s'}`;
  if(result.status==='partial')return `sent ${result.sent} feedback report${result.sent===1?'':'s'}; ${result.queued} still queued`;
  return `queued ${result.queued} feedback report${result.queued===1?'':'s'}`;
}

export async function feedbackCommand(args,opts={}){
  const out=opts.out||(s=>console.log(s));
  const o=parseFeedbackArgs(args);
  const hasReport=o.stack!=null||o.bot!=null||o.result!=null||o.reason!=null||o.client!=null;
  if(!hasReport&&!o.flush)throw new Error('Usage: kloudy feedback --stack ID --bot ID --result worked|failed|partial [--reason TEXT] [--client NAME] [--flush]');
  if(hasReport&&(!o.stack||!o.bot||!o.result))throw new Error('Feedback requires --stack, --bot, and --result');
  const payload=hasReport?buildFeedbackPayload({stackId:o.stack,botId:o.bot,result:o.result,reason:o.reason,client:o.client,version:opts.version}):undefined;
  const endpoint=opts.url===undefined?feedbackEndpoint():opts.url;
  const result=await submitFeedback({payload,dir:opts.dataDir,fetchImpl:opts.fetch,url:endpoint||null});
  const line=statusLine(result);
  if(o.client!=null&&payload&&!payload.client)out(line+'\nclient omitted');
  else out(line);
  return {...result,payload};
}
