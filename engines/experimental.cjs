'use strict';
// Stage 1B was rebuilt from scratch. The prior strategic-plan engine is
// intentionally not imported; historical source remains in Git history.
// Legacy dispatch is owned by server.cjs and MUST NOT be changed.
const crypto=require('node:crypto');
const S=require('./stage1b/duct-search.cjs');
const A=require('./stage1b/showdown-adapter.cjs');

function readySeed(seed){
  if(seed==null||seed===''){
    return Array.from({length:4},()=>crypto.randomBytes(2).readUInt16BE(0)).join(',');
  }
  if(!/^\d{1,5}(,\d{1,5}){3}$/.test(seed)||seed.split(',').some(n=>Number(n)>65535))
    throw Error('Invalid RNG seed');
  return seed;
}
// Optional sixth parameter is a test-only, dependency-injected budget override.
// Production HTTP routing continues to call the original five-argument API.
function simulateExperimental(a,b,depth=120,rngSeed,deps,opts={}){
  depth=Number.isInteger(depth)?Math.min(250,Math.max(1,depth)):120;
  if(!deps?.battle||!deps?.legal||!deps?.Sim)throw Error('Stage 1B requires pinned Showdown dependencies');
  const seed=readySeed(rngSeed),B=deps.battle(a,b,seed);
  const choices=[],details=[];
  const bounded=(value,fallback,lo,hi)=>Number.isFinite(value)?Math.max(lo,Math.min(hi,value)):fallback;
  const totalBudgetMs=bounded(opts.totalBudgetMs,55000,100,55000);
  const firstTurnBudgetMs=bounded(opts.firstTurnBudgetMs,1800,20,1800);
  const laterTurnBudgetMs=bounded(opts.laterTurnBudgetMs,550,20,550);
  const maxIterations=bounded(opts.maxIterations,10000,1,10000);
  const deadline=Date.now()+totalBudgetMs;
  let stopReason='',unresolvedSearches=0;
  for(let turn=0;turn<depth&&!B.ended;turn++){
    const remaining=deadline-Date.now();
    if(remaining<80){stopReason='compute_timeout';break}
    const budget=Math.max(20,Math.min(turn===0?firstTurnBudgetMs:laterTurnBudgetMs,remaining-50));
    const result=S.runDuct(B,deps,{
      budgetMs:budget,seed:seed+':turn:'+turn,treeDepth:10,maxRolloutTurns:24,
      // Conservative validated default: structural open-loop/widening trials
      // reached deeper but lost 120ms adversarial head-to-head checks.
      maxIterations,exploration:1.35,treeMode:'exact',jointWidening:false
    });
    if(!result.leftActions.length||!result.rightActions.length){
      stopReason='no_available_actions';break
    }
    if(result.unresolved)unresolvedSearches++;
    // Separate deterministic policy-randomness streams for both sides.
    const l=S.sample(result.leftActions,result.policyLeft,A.makeRandom(seed+':pick:'+turn+':p1'));
    const r=S.sample(result.rightActions,result.policyRight,A.makeRandom(seed+':pick:'+turn+':p2'));
    if(!l||!r){stopReason='no_available_actions';break}
    if(details.length<20){
      details.push({turn:turn+1,left:l,right:r,depth:result.maxReachedDepth,
        experimental:{
          mode:'duct-simultaneous-mcts',estimateType:result.estimateType,
          utility:'sampled-terminal-plus-uncertain-continuation',certified:false,
          winBounds:[0,100],estimatedGameValuePct:null,
          actionsLeft:result.leftActions,actionsRight:result.rightActions,
          policyLeft:result.policyLeft,policyRight:result.policyRight,
          samples:result.iterations,completed:result.completed,
          unresolved:result.unresolved,searchNodes:result.nodes,
          elapsedMs:result.elapsedMs,maxReachedDepth:result.maxReachedDepth,
          warning:result.warning
        }});
    }
    B.makeChoices(l,r);
    choices.push([l,r]);
  }
  if(B.ended)stopReason='battle_ended';
  else if(!stopReason)stopReason=choices.length>=depth?'turn_limit':'other';
  return {
    model:'experimental',engineVersion:'stage1b-duct-open-sheet-v1',
    policy:'simultaneous-duct-showdown',winner:B.ended?(B.winner||'draw'):'unresolved',
    stopReason,rngSeed:seed,choices,log:B.log,turns:choices.length,
    maxTurns:depth,decisionDetails:details,searchFallbacks:unresolvedSearches,
    disclaimer:'Untrained DUCT baseline: root action visits are not win probabilities; truncated rollouts and limited compute can miss rare long-term plans.'
  };
}
module.exports={simulateExperimental};
