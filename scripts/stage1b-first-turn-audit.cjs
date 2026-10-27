'use strict';
// Diagnostic-only: realistic first-turn 1.8-second budget on pinned Champions.
// No hand-coded preferred move and no claim that visit shares are win rates.
const assert=require('node:assert/strict');
const core=require('../server.cjs');
const {runDuct}=require('../engines/stage1b/duct-search.cjs');
const fixture=require('../test/experimental-cases.json');
const sets=new Map(fixture.sets.map(s=>[s.name,s]));
const matchups=[
  ['HS명상메플라','HB와자몽'],
  ['초점HA따라큐','울멧HB아머까오'],
  ['조심CS메망나','기띠고집한카'],
  ['기띠에써르','초점HA따라큐'],
  ['노자속기메갸라','HBC자뭉누리']
];
const deps={Sim:core.Sim,legal:core.legal};
const baseSeed='1579,3137,6027,8191';
const results=[];
for(const [a,b] of matchups)for(const [left,right] of [[a,b],[b,a]]){
  const B=core.battle(sets.get(left),sets.get(right),baseSeed);
  const old=JSON.stringify(B.toJSON());
  // Paired same-budget controls distinguish structural reuse from extra compute.
  const control=runDuct(B,deps,{
    seed:'first-turn-strength-audit:'+left+':'+right,
    budgetMs:450,treeDepth:10,maxRolloutTurns:24,
    maxIterations:10000,exploration:1.35,treeMode:'exact'
  });
  const candidate=runDuct(B,deps,{
    seed:'first-turn-strength-audit:'+left+':'+right,
    budgetMs:450,treeDepth:10,maxRolloutTurns:24,
    maxIterations:10000,exploration:1.35,treeMode:'open-loop'
  });
  const widened450=runDuct(B,deps,{
    seed:'first-turn-strength-audit:'+left+':'+right,
    budgetMs:450,treeDepth:10,maxRolloutTurns:24,
    maxIterations:10000,exploration:1.35,treeMode:'open-loop',jointWidening:true
  });
  const r=runDuct(B,deps,{
    seed:'first-turn-strength-audit:'+left+':'+right,
    budgetMs:1800,treeDepth:10,maxRolloutTurns:24,
    maxIterations:10000,exploration:1.35,treeMode:'open-loop',jointWidening:true
  });
  assert.equal(JSON.stringify(B.toJSON()),old,'search must never mutate original');
  assert.ok(r.iterations>=1);
  const top=(actions,probabilities)=>actions.map((a,i)=>({action:a,visitShare:Number(probabilities[i].toFixed(3))}))
    .sort((a,b)=>b.visitShare-a.visitShare).slice(0,4);
  const row={left,right,ms:r.elapsedMs,trials:r.iterations,
    resolved:r.completed,unresolved:r.unresolved,
    unresolvedFraction:Number((r.unresolved/r.iterations).toFixed(3)),
    maxReachedDepth:r.maxReachedDepth,nodes:r.nodes,
    control450:{trials:control.iterations,depth:control.maxReachedDepth,nodes:control.nodes},
    openLoop450:{trials:candidate.iterations,depth:candidate.maxReachedDepth,nodes:candidate.nodes},
    widened450:{trials:widened450.iterations,depth:widened450.maxReachedDepth,nodes:widened450.nodes,
      deferred:widened450.deferredPairExpansions},
    wideningDeferrals:r.deferredPairExpansions,
    legalDivergences:r.legalDivergences,
    topLeft:top(r.leftActions,r.policyLeft),topRight:top(r.rightActions,r.policyRight)};
  results.push(row);console.log('[STAGE1B-PRODUCTION-BUDGET-AUDIT]',JSON.stringify(row));
}
const summary={matchups:results.length,budgetMsPerRoot:1800,
  medianTrials:[...results.map(x=>x.trials)].sort((a,b)=>a-b)[4],
  totalUnresolved:results.reduce((a,b)=>a+b.unresolved,0),
  totalTrials:results.reduce((a,b)=>a+b.trials,0),
  improvedDepthAt450:results.filter(x=>x.openLoop450.depth>x.control450.depth).length,
  regressedDepthAt450:results.filter(x=>x.openLoop450.depth<x.control450.depth).length,
  widenedVsOpenImprovedAt450:results.filter(x=>x.widened450.depth>x.openLoop450.depth).length,
  widenedVsOpenRegressedAt450:results.filter(x=>x.widened450.depth<x.openLoop450.depth).length,
  note:'First-turn 1.8-second GitHub-runner trial counts, not win-rate accuracy or real Render host performance.'};
console.log('[STAGE1B-PRODUCTION-BUDGET-SUMMARY]',JSON.stringify(summary));
