import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtempSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {loadLocal} from '../src/bots.mjs';
import {KNOWN_MODALITIES} from '../src/modalities.mjs';
import {KEYWORD_RULES,decomposeGoal,findKeywordHits,formatRecommend,recommendGoal,stackIdFor} from '../src/recommend.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const entry=resolve(root,'bin/entry.mjs');
const legacy=resolve(root,'bin/kloudy.mjs');
const cache=mkdtempSync(join(tmpdir(),'kloudy-recommend-'));
const goal='voice assistant that transcribes calls, summarizes them, and stores them in a database';

function run(file,args){
  const env={...process.env,KLOUDY_CACHE_DIR:cache,KLOUDY_DATA_DIR:cache,KLOUDY_BOTS_API:'http://127.0.0.1:9',KLOUDY_SCORES_URL:'off',KLOUDY_FEEDBACK_URL:'off'};
  delete env.KLOUDY_API;
  return spawnSync(process.execPath,[file,...args],{encoding:'utf8',cwd:root,env});
}

function row(partial){
  return {name:partial.id,kind:'npx',endpoint:'npx '+partial.id,license:'MIT',score:1,caps:[],modalities:['audio'],modality_primary:'audio',cls:'B',...partial};
}

test('keyword map covers all 44 kloudy 1.0 modalities',()=>{
  const covered=[...new Set(KEYWORD_RULES.flatMap(rule=>rule.modalities))].sort();
  assert.equal(KNOWN_MODALITIES.length,44);
  assert.deepEqual(covered,[...KNOWN_MODALITIES].sort());
  const catalog=new Set();
  for(const bot of loadLocal().bots)for(const modality of bot.modalities||[])catalog.add(modality);
  assert.deepEqual([...catalog].sort(),[...KNOWN_MODALITIES].sort());
  assert.deepEqual(findKeywordHits('text to speech').map(hit=>hit.phrase),['text to speech']);
  assert.deepEqual(findKeywordHits('database').map(hit=>hit.modalities[0]),['database_access']);
  assert.deepEqual(decomposeGoal('api calls')[0].modalities,['api_calls']);
  assert.deepEqual(decomposeGoal('function calls')[0].modalities,['agent_tools']);
  assert.ok(findKeywordHits('transcribe a phone call').some(hit=>hit.modalities.includes('audio')));
});

test('multi-part goals decompose before matching',()=>{
  const parts=decomposeGoal(goal);
  assert.equal(parts.length,3);
  assert.deepEqual(parts.map(part=>part.modalities),[['audio'],['text'],['database_access']]);
  assert.match(parts[0].text,/transcribes calls/);
  assert.match(parts[1].text,/summarizes/);
  assert.match(parts[2].text,/database/);
  const distinct=decomposeGoal('transcription summarization database');
  assert.deepEqual(distinct.map(part=>part.modalities[0]),['audio','text','database_access']);
});

test('unmatched parts are kept',()=>{
  const result=recommendGoal('transcribe phone calls, then weave a basket');
  assert.equal(result.parts.length,1);
  assert.equal(result.parts[0].modalities[0],'audio');
  assert.deepEqual(result.unmatched,[{part:'weave a basket',reason:'no modality or catalog match'}]);
  assert.deepEqual(recommendGoal('transcribe, the').unmatched,[{part:'the',reason:'no modality or catalog match'}]);
  assert.match(formatRecommend(result),/Unmatched/);
  assert.match(formatRecommend(result),/weave a basket: no modality or catalog match/);
  assert.doesNotMatch(formatRecommend(recommendGoal('transcribe')),/Unmatched/);
});

test('ranking is deterministic: class A, then B, then O, then primary, hits, score, and index',()=>{
  const ranked=recommendGoal('transcribe',{bots:[
    row({id:'o-big',cls:'O',kind:'hf',endpoint:'https://o.example',score:1000}),
    row({id:'b-mid',score:10,endpoint:'npx b-mid'}),
    row({id:'a-low',cls:'A',kind:'http',endpoint:'https://a.example',license:'Apache-2.0',score:1,modality_primary:null})
  ],perModality:5});
  assert.deepEqual(ranked.parts[0].bots.map(bot=>bot.id),['a-low','b-mid','o-big']);
  assert.equal(ranked.parts[0].bots[0].command,'https://a.example');
  assert.equal(ranked.parts[0].bots[0].class,'A');
  assert.equal(ranked.parts[0].bots[1].command,'npx b-mid');
  const hits=recommendGoal('transcribe',{bots:[
    row({id:'plain',name:'plain',score:5}),
    row({id:'hit',name:'transcribe box',score:5,endpoint:'npx hit'})
  ]});
  assert.deepEqual(hits.parts[0].bots.map(bot=>bot.id),['hit','plain']);
  const primary=recommendGoal('transcribe',{bots:[
    row({id:'other',modalities:['audio','text'],modality_primary:'text',score:5}),
    row({id:'prim',modality_primary:'audio',score:5,endpoint:'npx prim'})
  ]});
  assert.deepEqual(primary.parts[0].bots.map(bot=>bot.id),['prim','other']);
  const index=recommendGoal('transcribe',{bots:[row({id:'first',score:5}),row({id:'second',score:5})]});
  assert.deepEqual(index.parts[0].bots.map(bot=>bot.id),['first','second']);
  const score=recommendGoal('transcribe',{bots:[row({id:'low',score:1}),row({id:'high',score:9,endpoint:'npx high'})]});
  assert.deepEqual(score.parts[0].bots.map(bot=>bot.id),['high','low']);
  assert.match(ranked.parts[0].bots[0].why,/matched audio\/transcribe; top-ranked in modality/);
});

test('the same goal returns the same stack from the bundled catalog',()=>{
  const once=recommendGoal(goal);
  const twice=recommendGoal(goal);
  assert.deepEqual(once,twice);
  assert.equal(once.schema,'kloudy.recommend/1');
  assert.equal(once.catalog,'kloudy 1.0');
  assert.equal(once.version,'1.0.2');
  assert.equal(once.unmatched.length,0);
  assert.equal(once.complete,true);
  assert.deepEqual(once.gaps,[]);
  assert.equal(once.parts.length,3);
  assert.equal(once.limit,5);
  assert.equal(once.stackId,stackIdFor(once.parts,once.unmatched));
  assert.match(once.stackId,/^[a-f0-9]{64}$/);
  assert.equal(once.feedback,`kloudy feedback --stack ${once.stackId} --bot <id> --result worked|failed|partial [--reason <short>]`);
  assert.deepEqual(once.parts.map(part=>part.confidence),['match','match','match']);
  assert.deepEqual(once.parts.map(part=>part.modalities[0]),['audio','text','database_access']);
  assert.equal(once.parts[0].bots[0].id,'httpk:npm:mendelio-voice-mcp');
  assert.equal(once.parts[1].bots[0].id,'httpk:mcp:ai.liquidagent.api:liquid-agent');
  assert.equal(once.parts[2].bots[0].id,'httpk:npm:microsoft:postgres-mcp');
  for(const part of once.parts){
    assert.equal(part.bots.length,5);
    assert.ok(part.candidatesTotal>=part.bots.length);
    for(const bot of part.bots){
      for(const key of ['id','name','class','command','license','description','why','modalities'])assert.equal(typeof bot[key]==='string'||Array.isArray(bot[key]),true);
      assert.ok(['A','B','O'].includes(bot.class));
      assert.match(bot.why,/top-ranked in modality/);
      assert.ok(bot.command);
    }
  }
});

test('recommend --json is parseable and stack matches it',()=>{
  const args=['voice assistant that transcribes phone calls','--json'];
  const fromEntry=run(entry,['recommend',...args]);
  const fromLegacy=run(legacy,['stack',...args]);
  assert.equal(fromEntry.status,0,fromEntry.stderr);
  assert.equal(fromLegacy.status,0,fromLegacy.stderr);
  assert.equal(fromEntry.stderr,'');
  assert.equal(fromLegacy.stderr,'');
  assert.equal(fromEntry.stdout,fromLegacy.stdout);
  const again=run(legacy,['recommend',...args]);
  assert.equal(again.stdout,fromEntry.stdout);
  const body=JSON.parse(fromEntry.stdout);
  assert.equal(body.schema,'kloudy.recommend/1');
  assert.equal(body.catalog,'kloudy 1.0');
  assert.equal(body.version,'1.0.2');
  assert.equal(body.goal,'voice assistant that transcribes phone calls');
  assert.equal(body.parts.length,1);
  assert.deepEqual(body.parts[0].modalities,['audio']);
  assert.equal(body.parts[0].bots.length,5);
  assert.equal(body.parts[0].confidence,'match');
  assert.equal(body.complete,true);
  assert.deepEqual(body.gaps,[]);
  assert.deepEqual(body.unmatched,[]);
  assert.equal(fromEntry.stdout.trim().startsWith('{'),true);
  const text=run(entry,['recommend','transcribe phone calls, then weave a basket']);
  assert.equal(text.status,0,text.stderr);
  assert.match(text.stdout,/Unmatched/);
  assert.match(text.stdout,/weave a basket: no modality or catalog match/);
  assert.match(text.stdout,/Confidence: match/);
  assert.match(text.stdout,/complete=false/);
  assert.match(text.stdout,/Gaps/);
  assert.equal(text.stdout.trim().startsWith('{'),false);
});

test('help and agents are visible on first contact',()=>{
  const pkg=JSON.parse(readFileSync(resolve(root,'package.json'),'utf8'));
  assert.equal(pkg.version,'1.0.2');
  assert.ok(pkg.files.includes('AGENTS.md'));
  const readme=readFileSync(resolve(root,'README.md'),'utf8');
  assert.match(readme,/## For AI agents: how to use Kloudy/);
  const agents=readFileSync(resolve(root,'AGENTS.md'),'utf8');
  const fromEntry=run(entry,['agents']);
  const fromLegacy=run(legacy,['agent']);
  assert.equal(fromEntry.status,0,fromEntry.stderr);
  assert.equal(fromLegacy.status,0,fromLegacy.stderr);
  assert.equal(fromEntry.stdout.trim(),agents.trim());
  assert.equal(fromLegacy.stdout.trim(),agents.trim());
  assert.match(fromEntry.stdout,/13,440/);
  assert.match(fromEntry.stdout,/44 modality/);
  for(const file of [entry,legacy]){
    const help=run(file,['--help']);
    assert.equal(help.status,0,help.stderr);
    assert.match(help.stdout,/recommend/);
    assert.match(help.stdout,/stack/);
    assert.match(help.stdout,/feedback/);
    assert.match(help.stdout,/--limit/);
    assert.match(help.stdout,/agents/);
    assert.match(help.stdout,/modalities/);
  }
  const missing=run(entry,['recommend','--json']);
  assert.notEqual(missing.status,0);
  assert.equal(missing.stdout,'');
  assert.match(missing.stderr,/Usage: kloudy recommend/);
});

const watchGoal='Create an experience for a Galaxy Watch 4 that detects steps, starts a timer based on movement, sends step data to an Android phone, uses it in a meal/calorie planner, and optionally shares results to Facebook.';
const filler=/voice|music|whisper|mendelio|ffmpeg|transcri|voicemeeter|sonic-pi|obs-studio|phonepe|figma|framewatch|cloudwatch|watchtower|swatch|opencode|angular-movement|faiss|fasttext|facebookresearch/i;

test('the watch goal splits device needs and does not fill gaps with audio tools',()=>{
  const result=recommendGoal(watchGoal);
  assert.equal(result.schema,'kloudy.recommend/1');
  assert.equal(result.catalog,'kloudy 1.0');
  assert.equal(result.version,'1.0.2');
  assert.equal(result.complete,false);
  assert.equal(result.limit,5);
  assert.equal(result.stackId,recommendGoal(watchGoal).stackId);
  assert.match(result.feedback,new RegExp(`kloudy feedback --stack ${result.stackId} --bot <id>`));
  assert.equal(result.parts.length,5);
  assert.deepEqual(result.unmatched,[]);
  const texts=result.parts.map(part=>part.part);
  assert.match(texts[0],/Galaxy Watch/);
  assert.match(texts[0],/steps/);
  assert.match(texts[1],/timer/);
  assert.match(texts[1],/movement/);
  assert.match(texts[2],/Android/);
  assert.match(texts[2],/phone/);
  assert.match(texts[3],/meal\/calorie/);
  assert.match(texts[4],/Facebook/);
  assert.deepEqual(result.parts.map(part=>part.confidence),['weak','weak','weak','match','match']);
  assert.ok(!result.parts[2].modalities.includes('audio'));
  for(const part of result.parts){
    assert.ok(['match','weak','none'].includes(part.confidence));
    assert.ok(part.candidatesTotal>=part.bots.length);
    assert.ok(!part.modalities.includes('audio'));
    for(const bot of part.bots){
      assert.doesNotMatch(`${bot.id} ${bot.name}`,filler);
      assert.ok(bot.command);
    }
  }
  for(const bot of result.parts[0].bots)assert.match(`${bot.id} ${bot.name}`,/garmin|fitbit|apple-health/i);
  for(const bot of result.parts[1].bots)assert.match(`${bot.id} ${bot.name}`,/timer|schedul|cron/i);
  for(const bot of result.parts[2].bots)assert.match(`${bot.id} ${bot.name}`,/android|\badb\b/i);
  for(const bot of result.parts[3].bots)assert.match(`${bot.id} ${bot.name}`,/meal|calorie|nutrition|diet|recipe/i);
  for(const bot of result.parts[4].bots)assert.match(`${bot.id} ${bot.name}`,/\bfacebook\b/i);
  assert.ok(result.gaps.length>=4);
  for(const gap of result.gaps){
    assert.equal(typeof gap.part,'string');
    assert.ok(['match','weak','none'].includes(gap.confidence));
    assert.equal(typeof gap.reason,'string');
    if(gap.kind)assert.ok(['catalog integration','suggestion: build yourself / platform API'].includes(gap.kind));
  }
  const suggestions=result.gaps.filter(gap=>gap.kind==='suggestion: build yourself / platform API');
  assert.ok(suggestions.length>=2);
  assert.match(suggestions.map(gap=>gap.reason).join('\n'),/Wear OS sensor APIs/);
  assert.match(suggestions.map(gap=>gap.reason).join('\n'),/Health Connect/);
  assert.match(suggestions.map(gap=>gap.reason).join('\n'),/Unverified non-catalog guidance/);
  assert.match(suggestions.map(gap=>gap.reason).join('\n'),/not a catalog bot/);
  assert.ok(result.gaps.some(gap=>gap.kind==='catalog integration'&&gap.confidence==='weak'));
  const text=formatRecommend(result);
  assert.match(text,/complete=false/);
  assert.match(text,/Confidence: weak/);
  assert.match(text,/Confidence: match/);
  assert.match(text,/Gaps/);
  assert.doesNotMatch(text,/Modalities: audio/);
});

test('phone calls stay audio and bare phone does not',()=>{
  for(const goal of ['transcribe phone calls','phone call transcription']){
    const result=recommendGoal(goal);
    assert.equal(result.parts.length,1);
    assert.deepEqual(result.parts[0].modalities,['audio']);
    assert.equal(result.parts[0].confidence,'match');
    assert.equal(result.complete,true);
    assert.ok(result.parts[0].bots.length>=1);
    assert.match(result.parts[0].bots.map(bot=>`${bot.id} ${bot.name}`).join('\n'),/voice|call|transcri|speech|audio/i);
  }
  assert.equal(recommendGoal('transcribe phone calls').parts[0].bots[0].id,'httpk:npm:mendelio-voice-mcp');
  assert.equal(recommendGoal('transcribe phone calls',{limit:1}).parts[0].bots[0].id,'httpk:npm:mendelio-voice-mcp');
  const phone=decomposeGoal('sends step data to an Android phone');
  assert.equal(phone.length,1);
  assert.ok(!phone[0].modalities.includes('audio'));
  const ranked=recommendGoal('sends step data to an Android phone');
  assert.equal(ranked.parts[0].confidence,'weak');
  assert.equal(ranked.complete,false);
  for(const bot of ranked.parts[0].bots)assert.doesNotMatch(`${bot.id} ${bot.name}`,/voice|music|whisper|transcri|mendelio/i);
});

test('limit caps each part and reports candidatesTotal',()=>{
  const bots=[];
  for(let i=0;i<7;i++)bots.push(row({id:'b'+i,score:i,endpoint:'npx b'+i}));
  const capped=recommendGoal('transcribe',{bots,limit:2});
  assert.equal(capped.limit,2);
  assert.equal(capped.parts[0].candidatesTotal,7);
  assert.deepEqual(capped.parts[0].bots.map(bot=>bot.id),['b6','b5']);
  const wide=recommendGoal('transcribe',{bots,limit:20});
  assert.equal(wide.parts[0].bots.length,7);
  assert.equal(wide.parts[0].candidatesTotal,7);
  assert.throws(()=>recommendGoal('transcribe',{bots,limit:0}),/1 to 20/);
  assert.throws(()=>recommendGoal('transcribe',{bots,limit:21}),/1 to 20/);
  assert.throws(()=>recommendGoal('transcribe',{bots,limit:'many'}),/1 to 20/);
});

test('stackId is a stable hash of parts and chosen bot ids',()=>{
  const phone=recommendGoal('transcribe phone calls');
  assert.equal(phone.stackId,recommendGoal('transcribe phone calls').stackId);
  assert.equal(phone.stackId,stackIdFor(phone.parts,phone.unmatched));
  const narrowed=recommendGoal('transcribe phone calls',{limit:1});
  assert.equal(narrowed.parts[0].bots.length,1);
  assert.equal(narrowed.parts[0].bots[0].id,'httpk:npm:mendelio-voice-mcp');
  assert.ok(narrowed.parts[0].candidatesTotal>1);
  assert.notEqual(narrowed.stackId,phone.stackId);
  const basket=recommendGoal('transcribe phone calls, then weave a basket');
  assert.notEqual(basket.stackId,phone.stackId);
  assert.equal(JSON.stringify({stackId:phone.stackId,feedback:phone.feedback}).includes('transcribe'),false);
  assert.match(formatRecommend(phone),new RegExp(`stackId: ${phone.stackId}`));
  assert.match(formatRecommend(phone),/Candidates: /);
});

test('recommend --limit is shared by entry and legacy',()=>{
  const args=['transcribe phone calls','--json','--limit','1'];
  const fromEntry=run(entry,['recommend',...args]);
  const fromLegacy=run(legacy,['stack',...args]);
  assert.equal(fromEntry.status,0,fromEntry.stderr);
  assert.equal(fromLegacy.status,0,fromLegacy.stderr);
  assert.equal(fromEntry.stdout,fromLegacy.stdout);
  const body=JSON.parse(fromEntry.stdout);
  assert.equal(body.limit,1);
  assert.equal(body.parts[0].bots.length,1);
  assert.ok(body.parts[0].candidatesTotal>1);
  assert.equal(body.parts[0].bots[0].id,'httpk:npm:mendelio-voice-mcp');
  assert.equal(body.parts[0].modalities[0],'audio');
  assert.match(body.feedback,/kloudy feedback --stack [a-f0-9]{64} --bot <id> --result worked\|failed\|partial \[--reason <short>\]/);
  const bad=run(entry,['recommend','transcribe phone calls','--limit','21']);
  assert.notEqual(bad.status,0);
  assert.match(bad.stderr,/1 to 20/);
  const offline=run(entry,['recommend','sends step data to an Android phone','--json','--offline']);
  assert.equal(offline.status,0,offline.stderr);
  const phone=JSON.parse(offline.stdout);
  assert.equal(phone.parts[0].modalities.includes('audio'),false);
  assert.equal(phone.complete,false);
});

test('score overrides demote, exclude, and boost inside class order',()=>{
  const bots=[
    row({id:'demoted-a',cls:'A',kind:'http',endpoint:'https://a.example',score:1}),
    row({id:'normal-b',score:100,endpoint:'npx normal-b'}),
    row({id:'boost-b',score:1,endpoint:'npx boost-b'}),
    row({id:'excluded',cls:'A',kind:'http',endpoint:'https://x.example',score:999})
  ];
  const plain=recommendGoal('transcribe',{bots,limit:5});
  assert.deepEqual(plain.parts[0].bots.map(bot=>bot.id),['excluded','demoted-a','normal-b','boost-b']);
  const ranked=recommendGoal('transcribe',{bots,limit:5,scores:{bots:{'demoted-a':{action:'demote'},'boost-b':{action:'boost'},excluded:{action:'exclude'}}}});
  assert.deepEqual(ranked.parts[0].bots.map(bot=>bot.id),['demoted-a','boost-b','normal-b']);
  assert.equal(ranked.parts[0].candidatesTotal,3);
  assert.equal(ranked.stackId,recommendGoal('transcribe',{bots,limit:5,scores:{bots:{'demoted-a':{action:'demote'},'boost-b':{action:'boost'},excluded:{action:'exclude'}}}}).stackId);
  assert.notEqual(ranked.stackId,plain.stackId);
  const within=[
    row({id:'normal',score:5,endpoint:'npx normal'}),
    row({id:'demoted',score:50,endpoint:'npx demoted'}),
    row({id:'boosted',score:1,endpoint:'npx boosted'})
  ];
  const moved=recommendGoal('transcribe',{bots:within,scores:{bots:{demoted:{action:'demote'},boosted:{action:'boost'}}}});
  assert.deepEqual(moved.parts[0].bots.map(bot=>bot.id),['boosted','normal','demoted']);
  const untouched=recommendGoal('transcribe',{bots:within});
  assert.deepEqual(untouched.parts[0].bots.map(bot=>bot.id),recommendGoal('transcribe',{bots:within,scores:null}).parts[0].bots.map(bot=>bot.id));
  assert.deepEqual(untouched.parts[0].bots.map(bot=>bot.id),['demoted','normal','boosted']);
});
