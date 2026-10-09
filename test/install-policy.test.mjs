import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
test('tracked non-proof content never advertises the unrelated Python package',()=>{
 const files=execFileSync('git',['ls-files','-z'],{encoding:'utf8'}).split('\0').filter(f=>f&&!f.startsWith('proof/'));
 const forbidden=new RegExp('pip\\s+install\\s+'+'kloudy','i');
 assert.deepEqual(files.filter(f=>forbidden.test(readFileSync(f,'utf8'))),[]);
});
