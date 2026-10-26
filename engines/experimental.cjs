'use strict';
// Experimental Stage 1: probability-first action decisions.
// The previous fixed 2-ply HP/boost/status utility code is removed.
// In supported mechanical subsets: exact chance distributions and bounded
// zero-sum game values. Else: importance-weighted terminal-outcome self-play
// with explicit non-certification. No matchup-specific forced moves.
const crypto=require('node:crypto');
const {seedFrom,pick,rootActions,mixedPolicy,analyze}=require('./probability-planner.cjs');
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
 if(!actions?.length)return null;
 return pick(actions,probabilities,()=>actionRandom(seed));
}
function options(B,side,deps){
 return rootActions(B,deps,side);
}
function equilibrium(matrix,iterations=150){
 const result=mixedPolicy(matrix,iterations);
 return {left:result.left,right:result.right};
}
function planning(B,deps,deadline,seed,turn){
 const result=analyze(B,deps,{budgetMs:Math.max(100,deadline-Date.now()),
  seed:seed+':turn:'+turn,turnCap:120});
 if(!result)return null;
 return {L:result.leftActions,R:result.rightActions,
  values:result.payoff.map(row=>row.map(cell=>
   cell.winPct!==undefined?(cell.winPct===null?0.5:cell.winPct/100):
   (cell.winLowerPct+cell.winUpperPct)/200)),
  chanceGame:result};
}
function simulateExperimental(a,b,depth=120,rngSeed,deps){
 depth=Number.isInteger(depth)?Math.min(250,Math.max(1,depth)):120;
 const seed=readySeed(rngSeed),B=deps.battle(a,b,seed),choices=[],details=[];
 const totalDeadline=Date.now()+28000;
 let stopReason='',searchFallbacks=0;
 for(let turn=0;turn<depth&&!B.ended;turn++){
  if(Date.now()>totalDeadline-200){stopReason='compute_timeout';break}
  const budgetMs=Math.min(turn===0?2800:1150,totalDeadline-Date.now()-150);
  if(budgetMs<100){stopReason='compute_timeout';break}
  const game=analyze(B,deps,{budgetMs,seed:seed+':turn:'+turn,turnCap:Math.min(180,depth+20)});
  if(!game||!game.leftActions?.length||!game.rightActions?.length){
   stopReason='no_available_actions';break;
  }
  const left=choose(game.leftActions,game.policyLeft,seed+':p1:'+turn);
  const right=choose(game.rightActions,game.policyRight,seed+':p2:'+turn);
  if(!left||!right){stopReason='no_available_actions';break}
  if(game.certified===false)searchFallbacks++;
  if(turn<20)details.push({turn:turn+1,left,right,depth:game.horizon||null,
   experimental:{mode:game.method,utility:'terminal-win-probability',
    estimateType:game.estimateType,certified:!!game.certified,
    winBounds:game.valueBounds,estimatedGameValuePct:game.estimatedGameValuePct??null,
    horizon:game.horizon??null,samples:game.samples,unresolved:game.unresolved??null,
    coverage:game.coverage??null,visitedStates:game.visitedStates??null,
    actionsLeft:game.leftActions,actionsRight:game.rightActions,
    policyLeft:game.policyLeft.map(x=>Math.round(x*1000)/1000),
    policyRight:game.policyRight.map(x=>Math.round(x*1000)/1000),
    payoff:game.payoff,warning:game.warning||null}});
  // The executed battle always uses the real Showdown RNG and mechanics.
  B.makeChoices(left,right);choices.push([left,right]);
 }
 if(B.ended)stopReason='battle_ended';
 else if(!stopReason)stopReason=choices.length>=depth?'turn_limit':'other';
 return {model:'experimental',engineVersion:'stage1-probability-2026-10',
  winner:B.ended?(B.winner||'draw'):'unresolved',stopReason,
  policy:'probability-first-adaptive-search',rngSeed:seed,log:B.log,choices,
  turns:choices.length,maxTurns:depth,decisionDetails:details,searchFallbacks,
  disclaimer:'Exact bounded probabilities where mechanics permit; otherwise importance-weighted terminal-only self-play estimates. Uncertified estimates are not proven optimal win rates.'};
}
module.exports={simulateExperimental,options,equilibrium,planning};
