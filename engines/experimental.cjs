'use strict';
// Experimental Stage 1b. Propose contingent strategic plans and validate
// their outcomes against independent counterplans using actual battle turns.
// A policy is NOT certified optimal unless an analytical terminal game solves.
const crypto=require('node:crypto');
const {seedFrom,pick,exactSupported,mixedPolicy}=require('./probability-planner.cjs');
const {analyzePlans}=require('./adversarial-plan-search.cjs');
const {buildPlans}=require('./strategic-plans.cjs');
function readySeed(seed){
 if(seed==null||seed==='')return seedFrom(crypto.randomBytes(16).toString('hex'));
 if(!/^\d{1,5}(,\d{1,5}){3}$/.test(seed)||seed.split(',').some(n=>+n>65535))
  throw Error('Invalid RNG seed');
 return seed;
}
function actionRandom(seed){
 const h=crypto.createHash('sha256').update(seed).digest();
 return h.readUInt32BE(0)/4294967296;
}
function choose(actions,probabilities,seed){
 return pick(actions,probabilities,()=>actionRandom(seed));
}
function options(B,side,deps){return deps.legal(B,side)}
function equilibrium(matrix,iterations=150){
 const p=mixedPolicy(matrix,iterations);return {left:p.left,right:p.right};
}
function search(B,deps,budgetMs,seed,turn){
 const start=Date.now();
 // Exact solver is eligible only for a mechanically safe state space.
 // The important long-game status/setup/optional Mega encounters go
 // through the generic goal/counterplan generator below.
 const exact=exactSupported(B,deps,start+Math.min(400,Math.max(50,budgetMs*0.10)));
 if(exact?.certified)return exact;
 const plan=analyzePlans(B,deps,{budgetMs:Math.max(100,budgetMs-(Date.now()-start)),
  seed:seed+':plans:'+turn,maxTurns:95,maxSamples:3800});
 return plan||exact;
}
function planning(B,deps,deadline,seed,turn){
 const result=search(B,deps,Math.max(100,deadline-Date.now()),seed,turn);
 if(!result)return null;
 const cells=result.payoff||[];
 return {L:result.leftActions,R:result.rightActions,
  values:cells.map(row=>row.map(c=>c.winPct!=null?c.winPct/100:0.5)),
  chanceGame:result};
}
function simulateExperimental(a,b,depth=120,rngSeed,deps){
 depth=Number.isInteger(depth)?Math.min(250,Math.max(1,depth)):120;
 const seed=readySeed(rngSeed),B=deps.battle(a,b,seed),choices=[],details=[];
 const totalDeadline=Date.now()+58000;
 let stopReason='',searchFallbacks=0;
 for(let turn=0;turn<depth&&!B.ended;turn++){
  if(Date.now()>totalDeadline-180){stopReason='compute_timeout';break}
  const budgetMs=Math.min(turn===0?9500:turn<3?3700:1450,
   totalDeadline-Date.now()-120);
  if(budgetMs<120){stopReason='compute_timeout';break}
  const result=search(B,deps,budgetMs,seed,turn);
  if(!result?.leftActions?.length||!result?.rightActions?.length){
   stopReason='no_available_actions';break;
  }
  const left=choose(result.leftActions,result.policyLeft,seed+':p1:'+turn);
  const right=choose(result.rightActions,result.policyRight,seed+':p2:'+turn);
  if(!left||!right){stopReason='no_available_actions';break}
  if(!result.certified)searchFallbacks++;
  if(turn<20)details.push({turn:turn+1,left,right,depth:result.horizon||null,
   experimental:{mode:result.method,utility:'terminal-win-probability',
    estimateType:result.strategyType||result.estimateType,
    certified:!!result.certified,
    winBounds:result.valueBounds,estimatedGameValuePct:result.estimatedGameValuePct??null,
    horizon:result.horizon??null,samples:result.samples||0,
    unresolved:result.unresolved??null,coverage:result.coverage??null,
    planCounts:result.planCounts||null,
    planningHorizon:result.planningHorizon||null,
    leadingPlans:result.leadingPlans||[],
    bestCounterplans:result.bestCounterplans||[],
    actionsLeft:result.leftActions,actionsRight:result.rightActions,
    policyLeft:result.policyLeft.map(x=>Math.round(x*1000)/1000),
    policyRight:result.policyRight.map(x=>Math.round(x*1000)/1000),
    payoff:result.payoff,warning:result.warning||null}});
  B.makeChoices(left,right);choices.push([left,right]);
 }
 if(B.ended)stopReason='battle_ended';
 else if(!stopReason)stopReason=choices.length>=depth?'turn_limit':'other';
 return {model:'experimental',engineVersion:'stage1b-contingent-plans',
  winner:B.ended?(B.winner||'draw'):'unresolved',stopReason,
  policy:'goal-generated-adversarial-contingent-plans',rngSeed:seed,
  log:B.log,choices,turns:choices.length,maxTurns:depth,
  decisionDetails:details,searchFallbacks,
  disclaimer:'Conditional strategic plans countertested by Showdown. Opponent plans are a finite candidate set; estimated victory rates are not mathematically certified optimal win probabilities.'};
}
module.exports={simulateExperimental,options,equilibrium,planning,buildPlans};
