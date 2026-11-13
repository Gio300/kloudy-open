#!/usr/bin/env node
// Aggregate anonymous kloudy feedback into feedback-scores.json.
// Meant to run weekly Sunday 3:00 America/Phoenix.
// Run it from your own scheduler. This file does not provision cloud infrastructure.
//
//   node scripts/aggregate-feedback-scores.mjs reports.json feedback-scores.json
//
// Rules:
// - Ignore bots with fewer than 3 reports.
// - Demote when failed reports come from 3 or more distinct clients and the failure ratio is 60% or more.
// - Exclude when there are 10 or more reports and the failure ratio is 80% or more. Exclude wins over demote.
// - Boost when there are 5 or more reports, at least 80% are worked, and the bot is not demoted or excluded.
// Failure ratio is failed / reports. Success ratio is worked / reports.
// partial counts as a report and counts as neither worked nor failed.
// Reports without a client still count toward ratios. They do not add a distinct client.
import {readFileSync,realpathSync,writeFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';

export const SCORE_RULES={
  ignoreBelowReports:3,
  demoteMinDistinctFailingClients:3,
  demoteMinFailureRatio:0.6,
  excludeMinReports:10,
  excludeMinFailureRatio:0.8,
  boostMinReports:5,
  boostMinSuccessRatio:0.8
};

const RESULTS=new Set(['worked','failed','partial']);

export function aggregateFeedbackScores(records,now=new Date()){
  const byBot=new Map();
  for(const record of records||[]){
    if(!record||typeof record!=='object')continue;
    const botId=typeof record.botId==='string'?record.botId.trim():'';
    const result=record.result;
    if(!botId||!RESULTS.has(result))continue;
    let row=byBot.get(botId);
    if(!row){
      row={reports:0,worked:0,failed:0,partial:0,failingClients:new Set()};
      byBot.set(botId,row);
    }
    row.reports++;
    row[result]++;
    if(result==='failed'){
      const client=typeof record.client==='string'?record.client.trim():'';
      if(client)row.failingClients.add(client);
    }
  }
  const bots={};
  for(const id of [...byBot.keys()].sort()){
    const row=byBot.get(id);
    if(row.reports<SCORE_RULES.ignoreBelowReports)continue;
    const failureRatio=row.failed/row.reports;
    const successRatio=row.worked/row.reports;
    const meets=(value,min)=>value+1e-12>=min;
    let action=null;
    if(row.reports>=SCORE_RULES.excludeMinReports&&meets(failureRatio,SCORE_RULES.excludeMinFailureRatio))action='exclude';
    else if(row.failingClients.size>=SCORE_RULES.demoteMinDistinctFailingClients&&meets(failureRatio,SCORE_RULES.demoteMinFailureRatio))action='demote';
    else if(row.reports>=SCORE_RULES.boostMinReports&&meets(successRatio,SCORE_RULES.boostMinSuccessRatio)&&failureRatio<SCORE_RULES.demoteMinFailureRatio)action='boost';
    if(!action)continue;
    bots[id]={action,reports:row.reports,worked:row.worked,failed:row.failed,partial:row.partial,failingClients:row.failingClients.size};
  }
  const generatedAt=now instanceof Date?now:new Date(now);
  return {
    schema:'kloudy.feedback-scores/1',
    generatedAt:generatedAt.toISOString(),
    schedule:'weekly Sunday 03:00 America/Phoenix',
    rules:{...SCORE_RULES},
    bots
  };
}

function readRecords(file){
  const data=JSON.parse(readFileSync(file,'utf8'));
  if(Array.isArray(data))return data;
  if(Array.isArray(data.records))return data.records;
  if(Array.isArray(data.feedback))return data.feedback;
  throw new Error('Expected a JSON array of feedback records');
}

function main(){
  const input=process.argv[2];
  if(!input){
    process.stderr.write('Usage: node scripts/aggregate-feedback-scores.mjs <feedback.json> [feedback-scores.json]\n');
    process.exitCode=1;
    return;
  }
  const output=process.argv[3]||'feedback-scores.json';
  const scores=aggregateFeedbackScores(readRecords(input));
  writeFileSync(output,JSON.stringify(scores,null,2)+'\n');
  process.stdout.write(`wrote ${Object.keys(scores.bots).length} score overrides to ${output}\n`);
}

function isDirectRun(){
  const entry=process.argv[1];
  if(!entry)return false;
  try{return import.meta.url===pathToFileURL(realpathSync(entry)).href;}catch{return false;}
}

if(isDirectRun())main();
