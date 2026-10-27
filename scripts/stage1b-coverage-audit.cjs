'use strict';
// Matchup coverage is not proof of strength. It prevents the new candidate
// from silently testing only a handful of historical user reports.
const assert=require('node:assert/strict');
const core=require('../server.cjs');
const {runDuct}=require('../engines/stage1b/duct-search.cjs');
const fixture=require('../test/experimental-cases.json');
const sets=new Map(fixture.sets.map(x=>[x.name,x]));
const deps={Sim:core.Sim,legal:core.legal};
const listed=fixture.cases.filter(c=>c.available),missing=fixture.cases.filter(c=>!c.available);
let runs=0,depthSum=0,unresolved=0,totalTrials=0,invalid=0;
for(const c of listed)for(const [a,b] of [[c.a,c.b],[c.b,c.a]]){
  assert.ok(sets.has(a)&&sets.has(b),'Missing reproducible fixture: '+c.id);
  const B=core.battle(sets.get(a),sets.get(b),'1579,3137,6027,8191');
  const before=JSON.stringify(B.toJSON());
  const r=runDuct(B,deps,{budgetMs:160,maxIterations:1000,seed:'coverage:'+c.id+':'+a+':'+b,
    treeDepth:10,maxRolloutTurns:24});
  assert.equal(JSON.stringify(B.toJSON()),before,'Source mutated: '+c.id);
  assert.ok(r.iterations>0,'Missing trial: '+c.id);
  assert.ok(r.leftActions.every(x=>core.legal(B,'p1').includes(x)),c.id+' illegal left');
  assert.ok(r.rightActions.every(x=>core.legal(B,'p2').includes(x)),c.id+' illegal right');
  runs++;depthSum+=r.maxReachedDepth;totalTrials+=r.iterations;unresolved+=r.unresolved;
  console.log('[STAGE1B-COVERAGE]',JSON.stringify({id:c.id,a,b,trials:r.iterations,depth:r.maxReachedDepth,
    nodes:r.nodes,unresolved:r.unresolved,legalDivergences:r.legalDivergences}));
}
console.log('[STAGE1B-COVERAGE-SUMMARY]',JSON.stringify({listed:fixture.cases.length,
  reproducible:listed.length,missingSets:missing.map(x=>x.id),runs,totalTrials,unresolved,meanMaxTreeDepth:Number((depthSum/runs).toFixed(2)),
  caveat:'This is legal-action, reproducibility and depth coverage only, NOT optimal-play or win-rate validation.'}));
assert.equal(runs,2*listed.length);
