'use strict';
// Experimental Stage 1b. Propose contingent strategic plans and validate
// their outcomes against independent counterplans using actual battle turns.
// A policy is NOT certified optimal unless an analytical terminal game solves.
const crypto=require('node:crypto');
const {seedFrom,pick,exactSupported,mixedPolicy}=require('./probability-planner.cjs');
const {analyzePlans}=require('./adversarial-plan-search.cjs');
const {buildPlans,actionForPlan}=require('./strategic-plans.cjs');
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
 let activePlans=null,firstSearch=null;
 for(let turn=0;turn<depth&&!B.ended;turn++){
  if(Date.now()>totalDeadline-180){stopReason='compute_timeout';break}
  let result=null,left=null,right=null;
  if(activePlans){
   // The plan itself selects the continuation in response to changes in
   // HP/PP/boosts/status. Do not abandon a successfully evaluated 8-turn
   // strategy every turn due to a fresh noisy one-turn calculation.
   left=actionForPlan(B,deps,'p1',activePlans.left,turn);
   right=actionForPlan(B,deps,'p2',activePlans.right,turn);
  }
  if(!left||!right){
   const budgetMs=Math.min(turn===0?13500:3700,totalDeadline-Date.now()-120);
   if(budgetMs<120){stopReason='compute_timeout';break}
   result=search(B,deps,budgetMs,seed,turn);
   if(!result?.leftActions?.length||!result?.rightActions?.length){
    stopReason='no_available_actions';break;
   }
   if(result.planBankLeft?.length&&result.planBankRight?.length){
    // First sample the visible root-action equilibrium, then choose the
    // best validated continuation for that action. This retains seeded
    // reproducibility when redundant plans are merged or reordered.
    const openingL=choose(result.leftActions,result.policyLeft,seed+':p1:'+turn);
    const openingR=choose(result.rightActions,result.policyRight,seed+':p2:'+turn);
    const matching=(plans,weights,opening)=>{
     const indices=plans.map((p,i)=>p.first===opening?i:-1).filter(i=>i>=0);
     const best=indices.reduce((i,j)=>i<0||weights[j]>weights[i]?j:i,-1);
     return best>=0?plans[best]:null;
    };
    const planL=matching(result.planBankLeft,result.planPolicyLeft,openingL);
    const planR=matching(result.planBankRight,result.planPolicyRight,openingR);
    if(planL&&planR){
     activePlans={left:planL,right:planR};
     left=actionForPlan(B,deps,'p1',planL,turn);
     right=actionForPlan(B,deps,'p2',planR,turn);
    }else{
     left=openingL;right=openingR;
    }
   }else{
    left=choose(result.leftActions,result.policyLeft,seed+':p1:'+turn);
    right=choose(result.rightActions,result.policyRight,seed+':p2:'+turn);
   }
   if(!result.certified)searchFallbacks++;
   if(!firstSearch)firstSearch=result;
  }
  if(!left||!right){stopReason='no_available_actions';break}
  if(turn<20)details.push({turn:turn+1,left,right,depth:result?.horizon||null,
   experimental:result?{mode:result.method,utility:'terminal-win-probability',
    estimateType:result.strategyType||result.estimateType,
    certified:!!result.certified,
    winBounds:result.valueBounds,estimatedGameValuePct:result.estimatedGameValuePct??null,
    horizon:result.horizon??null,samples:result.samples||0,
    unresolved:result.unresolved??null,coverage:result.coverage??null,
    planCounts:result.planCounts||null,
    planningHorizon:result.planningHorizon||null,
    leadingPlans:result.leadingPlans||[],bestCounterplans:result.bestCounterplans||[],
    selectedPlanLeft:activePlans?.left?.name||null,
    selectedPlanRight:activePlans?.right?.name||null,
    actionsLeft:result.leftActions,actionsRight:result.rightActions,
    policyLeft:result.policyLeft.map(x=>Math.round(x*1000)/1000),
    policyRight:result.policyRight.map(x=>Math.round(x*1000)/1000),
    payoff:result.payoff,warning:result.warning||null
   }:{mode:'conditional-plan-continuation',utility:'terminal-win-probability',
    selectedPlanLeft:activePlans?.left?.name||null,
    selectedPlanRight:activePlans?.right?.name||null,
    certified:false,warning:'앞서 상대 반박에 대조한 조건부 계획을 연속 실행'}});
  B.makeChoices(left,right);choices.push([left,right]);
 }
 if(B.ended)stopReason='battle_ended';
 else if(!stopReason)stopReason=choices.length>=depth?'turn_limit':'other';
 return {model:'experimental',engineVersion:'stage1b-persistent-contingent-plans',
  winner:B.ended?(B.winner||'draw'):'unresolved',stopReason,
  policy:'goal-generated-adversarial-contingent-plans',rngSeed:seed,
  log:B.log,choices,turns:choices.length,maxTurns:depth,
  decisionDetails:details,searchFallbacks,
  disclaimer:'Conditional strategic plans countertested by Showdown. Opponent plans are a finite candidate set; estimated victory rates are not mathematically certified optimal win probabilities.'};
}
module.exports={simulateExperimental,options,equilibrium,planning,buildPlans};
