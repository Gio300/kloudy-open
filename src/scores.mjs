// Optional recommend score overrides. No model call.
// GET https://kloudy.ai/api/feedback/scores, cache about 24h, else bundled ranking.
import {existsSync,mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {homedir} from 'node:os';
import {join} from 'node:path';

export const SCORES_URL='https://kloudy.ai/api/feedback/scores';
export const SCORES_SCHEMA='kloudy.feedback-scores/1';
export const SCORE_TTL_MS=24*60*60*1000;
const ACTIONS=new Set(['boost','demote','exclude']);
const DISABLED=new Set(['','off','offline','0','false']);

export function dataDir(){
  return process.env.KLOUDY_DATA_DIR||join(homedir(),'.kloudy');
}

export function scoresCachePath(dir=dataDir()){
  return join(dir,'feedback-scores-cache.json');
}

function botsOf(body){
  if(body.bots&&typeof body.bots==='object'&&!Array.isArray(body.bots))return body.bots;
  const scores=body.scores;
  if(!scores||typeof scores!=='object'||Array.isArray(scores))return null;
  if(scores.bots&&typeof scores.bots==='object'&&!Array.isArray(scores.bots))return scores.bots;
  return scores;
}

export function normalizeScores(body){
  if(!body||typeof body!=='object'||Array.isArray(body))return null;
  const source=botsOf(body);
  if(!source)return null;
  const bots={};
  for(const [id,row] of Object.entries(source)){
    if(typeof id!=='string'||!id)continue;
    const action=typeof row==='string'?row:row&&row.action;
    if(ACTIONS.has(action))bots[id]={action};
  }
  return {schema:typeof body.schema==='string'?body.schema:SCORES_SCHEMA,bots};
}

function scoresUrl(explicit){
  const value=explicit??process.env.KLOUDY_SCORES_URL??SCORES_URL;
  return DISABLED.has(String(value).trim())?null:value;
}

function readCache(file,now){
  try{
    if(!existsSync(file))return null;
    const wrapped=JSON.parse(readFileSync(file,'utf8'));
    const scores=normalizeScores(wrapped.scores??wrapped);
    const fetchedAt=Number(wrapped.fetchedAt);
    if(!scores||!Number.isFinite(fetchedAt))return null;
    return {fetchedAt,scores,fresh:now-fetchedAt>=0&&now-fetchedAt<SCORE_TTL_MS};
  }catch{
    return null;
  }
}

function writeCache(file,fetchedAt,scores){
  mkdirSync(join(file,'..'),{recursive:true});
  writeFileSync(file,JSON.stringify({fetchedAt,scores})+'\n');
}

export async function loadScoreOverrides({fetchImpl=fetch,now=Date.now(),offline=false,dir=dataDir(),url}={}){
  const cached=readCache(scoresCachePath(dir),now);
  if(cached?.fresh)return cached.scores;
  const endpoint=scoresUrl(url);
  if(offline||!endpoint)return null;
  try{
    const response=await fetchImpl(endpoint,{method:'GET',redirect:'error',credentials:'omit',headers:{accept:'application/json'},signal:AbortSignal.timeout(4000)});
    if(!response?.ok)return null;
    const scores=normalizeScores(await response.json());
    if(!scores)return null;
    writeCache(scoresCachePath(dir),now,scores);
    return scores;
  }catch{
    return null;
  }
}
