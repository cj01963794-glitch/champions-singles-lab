'use strict';
// Stage 2 research candidate inspired by battle-engine's independent-root
// search aggregation. No opponent set inference: this stage is OPEN SHEET.
// All roots run against the same pinned Showdown state and rule database.
// Serial independent trees (not parallel threads) preserve total wall budget.
const {runDuct}=require('./duct-search.cjs');

function independentRootEnsemble(B,deps,config={}) {
  const {budgetMs=1400,maxIterations=5000,roots=3,seed='stage2',...rest}=config;
  if(!Number.isInteger(roots)||roots<1||roots>8)throw Error('roots must be integer 1..8');
  if(!Number.isFinite(budgetMs)||budgetMs<20*roots)
    throw Error('At least 20ms budget per independent root');
  const start=Date.now(), deadline=start+budgetMs;
  const searched=[];
  for(let i=0;i<roots;i++){
    const remaining=deadline-Date.now();
    const left=roots-i;
    if(remaining<20*left)break;
    // Reserve equal shares at each step: total remaining wall time is bounded.
    const slice=Math.max(20,Math.floor(remaining/left));
    const result=runDuct(B,deps,{...rest,seed:seed+':independent:'+i,
      budgetMs:slice,maxIterations:Math.max(1,Math.floor(maxIterations/roots))});
    searched.push(result);
  }
  if(!searched.length)throw Error('No root produced a search result');
  const reference=searched[0];
  const left=reference.leftActions,right=reference.rightActions;
  const countsL=Array(left.length).fill(0),countsR=Array(right.length).fill(0);
  for(const r of searched){
    if(JSON.stringify(r.leftActions)!==JSON.stringify(left)||
      JSON.stringify(r.rightActions)!==JSON.stringify(right))
      throw Error('Independent root actions do not match canonical Showdown root');
    for(let i=0;i<countsL.length;i++)countsL[i]+=r.policyLeft[i]*r.iterations;
    for(let i=0;i<countsR.length;i++)countsR[i]+=r.policyRight[i]*r.iterations;
  }
  const normalize=values=>{
    const total=values.reduce((a,b)=>a+b,0);
    return values.map(x=>total>0?x/total:1/Math.max(1,values.length));
  };
  const iterations=searched.reduce((a,r)=>a+r.iterations,0);
  return {
    leftActions:left,rightActions:right,
    policyLeft:normalize(countsL),policyRight:normalize(countsR),
    iterations,completed:searched.reduce((a,r)=>a+r.completed,0),
    unresolved:searched.reduce((a,r)=>a+r.unresolved,0),
    nodes:searched.reduce((a,r)=>a+r.nodes,0),
    elapsedMs:Date.now()-start,
    maxReachedDepth:Math.max(...searched.map(r=>r.maxReachedDepth)),
    independentRoots:searched.length,
    rootsRequested:roots,
    trialsPerRoot:searched.map(r=>r.iterations),
    // Approximate diagnostic. Not a calibrated chance of winning.
    estimatedGameValuePct:null,certified:false,
    estimateType:'independent-exact-duct-aggregated-visits',
    warning:'Independent DUCT root visit shares are NOT win probabilities; this ensemble may trade strategic depth for variance reduction.'
  };
}
module.exports={independentRootEnsemble};
