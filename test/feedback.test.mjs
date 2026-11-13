import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtempSync,readFileSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {buildFeedbackPayload,feedbackCommand,queuePath,REASON_MAX} from '../src/feedback.mjs';
import {loadScoreOverrides,SCORES_URL,scoresCachePath} from '../src/scores.mjs';
import {recommendCommand} from '../src/recommend.mjs';
import {SCORE_RULES,aggregateFeedbackScores} from '../scripts/aggregate-feedback-scores.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const entry=resolve(root,'bin/entry.mjs');
const script=resolve(root,'scripts/aggregate-feedback-scores.mjs');
const goal='voice assistant that transcribes calls, summarizes them, and stores them in a database';
const stackId='ab'.repeat(32);
const botId='httpk:npm:mendelio-voice-mcp';

function tempDir(){
  return mkdtempSync(join(tmpdir(),'kloudy-feedback-'));
}

test('feedback payload keeps only anonymous fields',()=>{
  const payload=buildFeedbackPayload({
    stackId,
    botId,
    result:'failed',
    reason:'timed out',
    client:'cursor',
    goal,
    path:'C:\\Users\\me\\secret.env',
    env:{KLOUDY_MCP_TOKEN:'should-not-send'},
    version:'1.0.2'
  });
  assert.deepEqual(Object.keys(payload).sort(),['botId','client','reason','result','stackId','version']);
  assert.equal(payload.stackId,stackId);
  assert.equal(payload.botId,botId);
  assert.equal(payload.result,'failed');
  assert.equal(payload.reason,'timed out');
  assert.equal(payload.client,'cursor');
  assert.equal(payload.version,'1.0.2');
  const raw=JSON.stringify(payload);
  assert.equal(raw.includes(goal),false);
  assert.equal(raw.includes('transcribes'),false);
  assert.equal(raw.includes('secret'),false);
  assert.equal(raw.includes('should-not-send'),false);
  const long=buildFeedbackPayload({stackId,botId,result:'partial',reason:'x'.repeat(200),version:'1.0.2'});
  assert.equal(long.reason.length,REASON_MAX);
  const dropped=buildFeedbackPayload({stackId,botId,result:'worked',reason:'see C:\\Users\\me\\notes.txt',client:'person@example.com',version:'1.0.2'});
  assert.equal(dropped.reason,undefined);
  assert.equal(dropped.client,undefined);
  assert.equal(JSON.stringify(dropped).includes('Users'),false);
  assert.equal(JSON.stringify(dropped).includes('example.com'),false);
  assert.throws(()=>buildFeedbackPayload({stackId:goal,botId,result:'failed'}));
  assert.throws(()=>buildFeedbackPayload({stackId,botId,result:'maybe'}));
});

test('offline queue flushes on the next feedback command',async()=>{
  const dir=tempDir();
  const secret='queued-env-secret';
  process.env.KLOUDY_EXAMPLE_SECRET=secret;
  const sent=[];
  const fail=async()=>{throw new Error('network down');};
  try{
    const queued=await feedbackCommand(['--stack',stackId,'--bot',botId,'--result','worked','--reason','ran','--client','cursor'],{dataDir:dir,fetch:fail,url:'https://kloudy.ai/api/feedback',out(){}});
    assert.equal(queued.status,'queued');
    assert.equal(queued.queued,1);
    const stored=JSON.parse(readFileSync(queuePath(dir),'utf8'));
    assert.equal(stored.length,1);
    assert.deepEqual(Object.keys(stored[0]).sort(),['botId','client','reason','result','stackId','version']);
    const text=JSON.stringify(stored);
    assert.equal(text.includes(goal),false);
    assert.equal(text.includes(secret),false);
    assert.equal(text.includes('transcribes'),false);
    const refused=await feedbackCommand(['--flush'],{dataDir:dir,fetch:async()=>({ok:false,status:500}),url:'https://kloudy.ai/api/feedback',out(){}});
    assert.equal(refused.status,'queued');
    assert.equal(JSON.parse(readFileSync(queuePath(dir),'utf8')).length,1);
    const flushed=await feedbackCommand(['--flush'],{dataDir:dir,fetch:async(url,init)=>{
      assert.equal(url,'https://kloudy.ai/api/feedback');
      assert.equal(init.method,'POST');
      assert.equal(init.headers.authorization,undefined);
      assert.equal(init.credentials,'omit');
      sent.push(JSON.parse(init.body));
      return {ok:true,status:200};
    },url:'https://kloudy.ai/api/feedback',out(){}});
    assert.equal(flushed.sent,1);
    assert.equal(flushed.queued,0);
    assert.equal(sent.length,1);
    assert.deepEqual(sent[0],stored[0]);
    assert.equal(JSON.parse(readFileSync(queuePath(dir),'utf8')).length,0);
    const empty=await feedbackCommand(['--flush'],{dataDir:dir,fetch:async()=>{throw new Error('unused');},out(){}});
    assert.equal(empty.status,'empty');
  }finally{
    delete process.env.KLOUDY_EXAMPLE_SECRET;
  }
});

test('score cache is used for about 24h and misses fall back',async()=>{
  const dir=tempDir();
  const now=1_700_000_000_000;
  const scores={schema:'kloudy.feedback-scores/1',bots:{'boost-b':{action:'boost',reports:5}}};
  let calls=0;
  const fetchImpl=async(url,init)=>{
    calls++;
    assert.equal(url,SCORES_URL);
    assert.equal(init.method,'GET');
    assert.equal(init.headers.authorization,undefined);
    assert.equal(init.credentials,'omit');
    return {ok:true,json:async()=>scores};
  };
  const loaded=await loadScoreOverrides({fetchImpl,now,dir,url:SCORES_URL});
  assert.equal(calls,1);
  assert.equal(loaded.bots['boost-b'].action,'boost');
  const cached=await loadScoreOverrides({fetchImpl:async()=>{throw new Error('cache should answer');},now:now+60_000,dir,url:SCORES_URL});
  assert.deepEqual(cached.bots['boost-b'],{action:'boost'});
  const stale=await loadScoreOverrides({fetchImpl:async()=>{throw new Error('offline');},now:now+(25*60*60*1000),dir,offline:true});
  assert.equal(stale,null);
  const missing=await loadScoreOverrides({fetchImpl:async()=>{throw new Error('offline');},dir:tempDir()});
  assert.equal(missing,null);
  const wrapped=JSON.parse(readFileSync(scoresCachePath(dir),'utf8'));
  assert.equal(typeof wrapped.fetchedAt,'number');
  assert.equal(JSON.stringify(wrapped).includes(goal),false);
});

test('recommend applies fetched overrides and keeps bundled order when offline',async()=>{
  const dir=tempDir();
  const fetchImpl=async()=>({ok:true,json:async()=>({bots:{'httpk:npm:mendelio-voice-mcp':{action:'exclude'}}})});
  const excluded=await recommendCommand(['transcribe phone calls','--json'],{fetch:fetchImpl,dataDir:dir,scoresUrl:SCORES_URL,out(){}});
  assert.equal(excluded.parts[0].modalities[0],'audio');
  assert.equal(excluded.parts[0].bots.some(bot=>bot.id==='httpk:npm:mendelio-voice-mcp'),false);
  assert.equal(excluded.complete,true);
  const again=await recommendCommand(['transcribe phone calls','--json'],{fetch:async()=>{throw new Error('cache should answer');},dataDir:dir,scoresUrl:SCORES_URL,out(){}});
  assert.equal(again.stackId,excluded.stackId);
  const offline=await recommendCommand(['transcribe phone calls','--offline'],{fetch:async()=>{throw new Error('offline skips fetch');},dataDir:tempDir(),scoresUrl:SCORES_URL,out(){}});
  assert.equal(offline.parts[0].bots[0].id,'httpk:npm:mendelio-voice-mcp');
  assert.equal(offline.parts[0].modalities.includes('audio'),true);
});

test('aggregation applies the weekly thresholds and drops goal text',()=>{
  assert.equal(SCORE_RULES.ignoreBelowReports,3);
  assert.equal(SCORE_RULES.demoteMinDistinctFailingClients,3);
  assert.equal(SCORE_RULES.demoteMinFailureRatio,0.6);
  assert.equal(SCORE_RULES.excludeMinReports,10);
  assert.equal(SCORE_RULES.excludeMinFailureRatio,0.8);
  assert.equal(SCORE_RULES.boostMinReports,5);
  assert.equal(SCORE_RULES.boostMinSuccessRatio,0.8);
  const records=[
    {botId:'few',result:'failed',client:'cursor',goal},
    {botId:'few',result:'failed',client:'claude',goal},
    {botId:'same',result:'failed',client:'cursor',goal},
    {botId:'same',result:'failed',client:'cursor',goal},
    {botId:'same',result:'failed',client:'cursor',goal},
    {botId:'demoted',result:'failed',client:'cursor',goal,path:'C:\\secret'},
    {botId:'demoted',result:'failed',client:'claude',goal},
    {botId:'demoted',result:'failed',client:'codex',goal},
    {botId:'demoted',result:'worked',client:'cursor',goal},
    {botId:'demoted',result:'worked',client:'claude',goal},
    {botId:'almost',result:'worked',client:'vscode',goal},
    {botId:'boosted',result:'failed',client:'cursor',goal},
    {botId:'plain',result:'partial',client:'cursor',goal},
    {botId:'plain',result:'partial',client:'claude',goal},
    {botId:'plain',result:'partial',client:'codex',goal},
    {botId:'plain',result:'partial',client:'vscode',goal},
    {botId:'plain',result:'partial',client:'windsurf',goal}
  ];
  for(const client of ['cursor','claude','codex'])records.push({botId:'almost',result:'failed',client,goal});
  for(let i=0;i<5;i++)records.push({botId:'almost',result:'failed',client:'cursor',goal});
  for(let i=0;i<4;i++)records.push({botId:'boosted',result:'worked',client:'claude',goal});
  for(let i=0;i<8;i++)records.push({botId:'excluded',result:'failed',client:'cursor',goal});
  for(let i=0;i<2;i++)records.push({botId:'excluded',result:'worked',client:'claude',goal});
  const scores=aggregateFeedbackScores(records,new Date('2026-11-15T10:00:00.000Z'));
  assert.equal(scores.schema,'kloudy.feedback-scores/1');
  assert.equal(scores.schedule,'weekly Sunday 03:00 America/Phoenix');
  assert.equal(scores.bots.few,undefined);
  assert.equal(scores.bots.same,undefined);
  assert.equal(scores.bots.plain,undefined);
  assert.equal(scores.bots.demoted.action,'demote');
  assert.equal(scores.bots.demoted.reports,5);
  assert.equal(scores.bots.demoted.failingClients,3);
  assert.equal(scores.bots.almost.action,'demote');
  assert.equal(scores.bots.almost.reports,9);
  assert.equal(scores.bots.boosted.action,'boost');
  assert.equal(scores.bots.excluded.action,'exclude');
  assert.deepEqual(Object.keys(scores.bots),['almost','boosted','demoted','excluded']);
  const raw=JSON.stringify(scores);
  assert.equal(raw.includes(goal),false);
  assert.equal(raw.includes('secret'),false);
  assert.equal(raw.includes('transcribes'),false);
});

test('aggregation script writes feedback-scores.json',()=>{
  const dir=tempDir();
  const input=join(dir,'reports.json');
  const output=join(dir,'feedback-scores.json');
  const records=[];
  for(let i=0;i<5;i++)records.push({botId:'boosted',result:'worked',client:'cursor',goal});
  writeFileSync(input,JSON.stringify(records));
  const run=spawnSync(process.execPath,[script,input,output],{encoding:'utf8',cwd:dir});
  assert.equal(run.status,0,run.stderr);
  assert.match(run.stdout,/wrote 1 score overrides/);
  const scores=JSON.parse(readFileSync(output,'utf8'));
  assert.equal(scores.bots.boosted.action,'boost');
  assert.equal(JSON.stringify(scores).includes(goal),false);
  const help=spawnSync(process.execPath,[entry,'feedback'],{encoding:'utf8',cwd:root,env:{...process.env,KLOUDY_DATA_DIR:dir,KLOUDY_FEEDBACK_URL:'off'}});
  assert.notEqual(help.status,0);
  assert.match(help.stderr,/kloudy feedback --stack/);
});
