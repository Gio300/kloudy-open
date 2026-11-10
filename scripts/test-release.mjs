import fs from 'node:fs/promises';import {spawnSync} from 'node:child_process';
const run=spawnSync(process.execPath,['--test','--test-reporter=tap','test/*.test.mjs'],{encoding:'utf8',maxBuffer:10000000,windowsHide:true});
await fs.writeFile('proof/test-output.log',run.stdout+'\n'+run.stderr);
const summary=run.stdout.split('\n').filter(line=>/^# (tests|pass|fail|duration_ms)/.test(line));console.log(JSON.stringify({exitCode:run.status,summary}));process.exitCode=run.status??1;
