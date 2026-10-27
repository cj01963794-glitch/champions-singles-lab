'use strict';
// Stage 1B intentionally replaces the rejected Experimental engine. Do not
// silently execute its old contract/hand-tuned opener assertions as release
// gates; archive them in-place until rewritten as independent matchup audits.
// Every other test file is discovered automatically, including new ones.
const fs = require('node:fs');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const excluded = new Set([
  'experimental.test.cjs', // removed equilibrium/options exports
  'experimental-historical.test.cjs', // old exact per-species opener assertions
  'experimental-counterfactual.test.cjs', // removed planning() interface
  'strategic-plan-regression.test.cjs' // expects abandoned plan-continuation
]);
const testDir=path.join(__dirname,'..','test');
const files=fs.readdirSync(testDir).filter(f=>f.endsWith('.test.cjs')&&!excluded.has(f))
  .sort().map(f=>path.join(testDir,f));
if(!files.length)throw Error('No tests discovered');
console.log('[STAGE1B-TEST-GATE]',JSON.stringify({files:files.map(f=>path.basename(f)),archived:[...excluded].sort()}));
const proc=spawnSync(process.execPath,['--test','--test-concurrency=2',...files],
  {stdio:'inherit',timeout:9*60*1000});
if(proc.error)console.error('[STAGE1B-TEST-GATE] error:',proc.error.message);
process.exit(proc.status??1);
