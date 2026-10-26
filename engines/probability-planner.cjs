'use strict';
// Probability-first planner: no HP, boost or status-score reward.
// Use exhaustive damage distributions where a proven mechanical model
// applies. Otherwise optimize observed *terminal* win/loss/draw results;
// unresolved games are counted separately, never silently treated as wins.
// No species, move-ID or past-example decision overrides.
const crypto=require('node:crypto');
const {exactAttackRace,gameValue}=require('../attack-race.cjs');
const {makeTacticalSearch}=require('../tactical-race.cjs');

function seedFrom(value){
 const h=crypto.createHash('sha256').update(String(value)).digest();
 return [0,2,4,6].map(i=>h.readUInt16BE(i)).join(',');
}
function rng(seed){
 let state=crypto.createHash('sha256').update(String(seed)).digest().readUInt32BE(0)||1;
 return ()=>{
  state^=state<<13;state^=state>>>17;state^=state<<5;
  return (state>>>0)/4294967296;
 };
}
function pick(items,p,random){
 if(!items.length)return null;
 let v=random();
 for(let i=0;i<items.length;i++){v-=Math.max(0,p[i]||0);if(v<0)return items[i]}
 return items[items.length-1];
}
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const pct=v=>Math.round(v*10000)/100;
const tokenIndex=token=>Number(String(token).match(/move (\d+)/)?.[1]||0)-1;
function rootActions(B,deps,side){
 // Preserve every genuine legal action, including optional delayed Mega.
 // Strategically "weak-looking" moves must not be deleted without proof.
 return deps.legal(B,side);
}
function reward(B){
 if(!B.ended)return null;
 return B.winner==='Left'?1:B.winner==='Right'?0:0.5;
}
function stateKey(B){
 const pokemon=B.sides.map(s=>{
  const p=s.pokemon[0];
  const v=Object.entries(p.volatiles||{}).map(([id,x])=>[id,x.duration||0,x.move||'']).sort((a,b)=>a[0].localeCompare(b[0]));
  return [p.hp,p.maxhp,p.species.id,p.ability,p.item,p.status,p.statusState?.toxicTurns||0,
   Object.values(p.boosts),p.moveSlots.map(m=>m.pp),p.lastMove?.id||'',
   v,Object.entries(s.sideConditions||{}).map(([id,x])=>[id,x.duration||0])];
 });
 return JSON.stringify([pokemon,B.field.weather,B.field.terrain,
  Object.keys(B.field.pseudoWeather||{})]);
}
function makeBandit(actions){
 return {actions,seen:actions.map(()=>0),sum:actions.map(()=>0)};
}
function banditChoice(node,random,reverse){
 const N=node.seen.reduce((x,y)=>x+y,0);
 const unseen=node.seen.map((v,i)=>v===0?i:-1).filter(i=>i>=0);
 if(unseen.length)return unseen[Math.floor(random()*unseen.length)];
 const scores=node.actions.map((_,i)=>{
  const win=node.sum[i]/node.seen[i],value=reverse?1-win:win;
  return value+Math.sqrt(2*Math.log(N+1)/node.seen[i]);
 });
 const m=Math.max(...scores),ties=scores.map((v,i)=>v>=m-1e-12?i:-1).filter(i=>i>=0);
 return ties[Math.floor(random()*ties.length)];
}
function evaluateRollout(B,deps,rootLeft,rootRight,random,biasRng,tree,turnCap,deadline){
 let weight=1,altered=0,trajectory=[],moves=0;
 // Importance sample low-probability *mechanics*, not named species or moves.
 // The likelihood ratio restores their true probability mass.
 // This makes rare critical/miss branches observable without assigning
 // them an artificial preference in the policy.
 const original=B.randomChance.bind(B);
 B.randomChance=(num,den)=>{
  const p=num/den;
  if(!(p>0&&p<1)||altered>=4)return original(num,den);
  const q=clamp(p,0.25,0.75);
  if(Math.abs(q-p)<1e-12)return original(num,den);
  altered++;
  const yes=biasRng()<q;
  weight*=yes?p/q:(1-p)/(1-q);
  return yes;
 };
 try{B.makeChoices(rootLeft,rootRight)}
 finally{B.randomChance=original}
 moves++;
 const repeated=new Map();
 while(!B.ended&&moves<turnCap&&Date.now()<deadline){
  const key=stateKey(B);
  const count=(repeated.get(key)||0)+1;
  repeated.set(key,count);
  if(count>3)break;
  let node=tree.get(key);
  const L=rootActions(B,deps,'p1'),R=rootActions(B,deps,'p2');
  if(!L.length||!R.length)break;
  if(!node||node.l.actions.join('|')!==L.join('|')||node.r.actions.join('|')!==R.join('|')){
   node={l:makeBandit(L),r:makeBandit(R)};
   if(tree.size<900)tree.set(key,node);
  }
  const i=banditChoice(node.l,random,false),j=banditChoice(node.r,random,true);
  trajectory.push([node,i,j]);
  B.makeChoices(L[i],R[j]);
  moves++;
 }
 const outcome=reward(B);
 if(outcome!==null)for(const [node,i,j] of trajectory){
  node.l.seen[i]++;node.r.seen[j]++;
  node.l.sum[i]+=outcome;node.r.sum[j]+=outcome;
 }
 return {outcome,weight,turns:moves,altered};
}
function mixedPolicy(matrix,iterations=120){
 // Regret matching is polynomial in action count. The exact small-game
 // support enumerator is retained for certified analytic models only.
 const n=matrix.length,m=matrix[0].length;
 const rl=Array(n).fill(0),rr=Array(m).fill(0),al=Array(n).fill(0),ar=Array(m).fill(0);
 const policy=R=>{
  const q=R.map(x=>Math.max(0,x)),z=q.reduce((a,b)=>a+b,0);
  return q.map(x=>z?x/z:1/q.length);
 };
 for(let t=0;t<iterations;t++){
  const x=policy(rl),y=policy(rr);
  x.forEach((v,i)=>al[i]+=v);y.forEach((v,j)=>ar[j]+=v);
  const l=matrix.map(row=>row.reduce((v,w,j)=>v+w*y[j],0));
  const r=Array.from({length:m},(_,j)=>matrix.reduce((v,row,i)=>v+row[j]*x[i],0));
  const value=l.reduce((v,w,i)=>v+w*x[i],0);
  l.forEach((v,i)=>rl[i]+=v-value);
  r.forEach((v,j)=>rr[j]+=value-v);
 }
 const x=al.map(v=>v/iterations),y=ar.map(v=>v/iterations);
 return {left:x,right:y,value:matrix.reduce((v,row,i)=>v+x[i]*row.reduce((w,c,j)=>w+c*y[j],0),0)};
}
function asGame(result){
 if(!result)return null;
 if(result.method==='bounded-tactical-probability-game'){
  return {method:result.method,leftActions:result.leftActions,rightActions:result.rightActions,
   policyLeft:result.leftPolicy,policyRight:result.rightPolicy,
   valueBounds:result.valueBounds,certified:result.certified&&result.valueBounds[1]-result.valueBounds[0]<0.000001,
   horizon:result.horizon,states:result.states,payoff:result.payoff,
   estimateType:'bounded-game-tree',samples:0,unresolved:result.certified?0:null};
 }
 const matrixLo=result.payoff.map(row=>row.map(x=>x.winLowerPct/100));
 const matrixHi=result.payoff.map(row=>row.map(x=>x.winUpperPct/100));
 // Robust strategies calculated independently from pessimistic bound
 // matrices. A pure certified saddle is used when fully certified.
 const left=gameValue(matrixLo,true);
 const right=gameValue(matrixHi[0].map((_,j)=>matrixHi.map(row=>1-row[j])),true);
 const n=result.leftActions.length,m=result.rightActions.length;
 const leftPolicy=result.certified?result.leftActions.map(x=>x===result.left?1:0):left.probabilities;
 const rightPolicy=result.certified?result.rightActions.map(x=>x===result.right?1:0):right.probabilities;
 return {method:result.method,leftActions:result.leftActions,rightActions:result.rightActions,
  policyLeft,policyRight,valueBounds:result.valueBounds,certified:result.certified&&
   result.valueBounds[1]-result.valueBounds[0]<0.000001,
  horizon:result.horizon,states:result.states,payoff:result.payoff,
  estimateType:'bounded-game-tree',samples:0,unresolved:result.certified?0:null};
}
function exactSupported(B,deps,deadline){
 if(Date.now()>deadline-20)return null;
 try{
  const exact=exactAttackRace(B,{Sim:deps.Sim,deadline,maxStates:17000,horizon:12});
  if(exact)return asGame(exact);
 }catch(e){if(!String(e.message).includes('budget'))throw e}
 if(Date.now()>deadline-20)return null;
 try{
  const tactical=makeTacticalSearch(B,{Sim:deps.Sim,deadline,maxStates:12000,horizon:10});
  if(tactical&&tactical.applicable)return asGame(tactical);
 }catch(e){if(!String(e.message).includes('budget'))throw e}
 return null;
}
function genericTerminalSearch(B,deps,{deadline,seed,turnCap=120,maxSamples=2000}){
 const L=rootActions(B,deps,'p1'),R=rootActions(B,deps,'p2');
 if(!L.length||!R.length)return null;
 const initial=JSON.stringify(B.toJSON()),random=rng(seed+':policy'),biasRng=rng(seed+':chance');
 const table=L.map(()=>R.map(()=>({total:0,sum:0,win:0,loss:0,draw:0,unresolved:0,
  sumSq:0,count:0,rareSampled:0})));
 const tree=new Map();
 let samples=0,deadlineReached=false;
 const start=Date.now();
 while(samples<maxSamples&&Date.now()<deadline){
  let selected=null,min=Infinity;
  // Ensure joint action coverage before exploitation; never assume
  // the opponent uses every action equally when computing game value.
  for(let i=0;i<L.length;i++)for(let j=0;j<R.length;j++){
   const n=table[i][j].count;
   if(n<min){min=n;selected=[i,j]}
  }
  // Afterwards prioritize cells of strategies currently plausible,
  // with persistent uniform exploration (not a fixed opponent policy).
  if(min>=2&&random()>0.35){
   const means=table.map(row=>row.map(c=>c.total?c.sum/c.total:0.5));
   const both=mixedPolicy(means,80);
   const lp=both.left,rp=both.right;
   const i=L.indexOf(pick(L,lp,random)),j=R.indexOf(pick(R,rp,random));
   selected=[i,j];
  }
  const [i,j]=selected,cell=table[i][j];
  const trial=deps.Sim.Battle.fromJSON(initial);
  trial.resetRNG(seedFrom(seed+':roll:'+samples));
  const rollout=evaluateRollout(trial,deps,L[i],R[j],random,biasRng,tree,
   turnCap,deadline);
  cell.count++;samples++;
  if(rollout.altered)cell.rareSampled++;
  if(rollout.outcome===null){cell.unresolved++;continue}
  const w=rollout.weight;
  cell.total+=w;cell.sum+=w*rollout.outcome;cell.sumSq+=w*w;
  if(rollout.outcome===1)cell.win+=w;
  else if(rollout.outcome===0)cell.loss+=w;
  else cell.draw+=w;
 }
 if(Date.now()>=deadline)deadlineReached=true;
 const means=table.map(row=>row.map(c=>c.total?c.sum/c.total:0.5));
 // The payoff is the observed terminal win fraction, *not* a state score.
 // Unsampled/unfinished trajectories receive no invented win rate; 0.5
 // above is solely an exploration prior for choosing further simulations.
 const both=mixedPolicy(means,240);
 const payoff=table.map(row=>row.map(c=>({
  winPct:c.total?pct(c.win/c.total):null,
  lossPct:c.total?pct(c.loss/c.total):null,
  drawPct:c.total?pct(c.draw/c.total):null,
  effectiveSamples:c.sumSq?Math.round(10*c.total*c.total/c.sumSq)/10:0,
  totalSamples:c.count,unresolved:c.unresolved,
  estimateType:'importance-weighted-rollout-not-certified'
 })));
 const complete=table.every(row=>row.every(c=>c.count>=2&&c.total>0));
 // The interval [0, 100] is the only safe deterministic certification
 // if this stochastic tree was not exhaustively evaluated.
 return {method:'terminal-outcome-selfplay',leftActions:L,rightActions:R,
  policyLeft:both.left,policyRight:both.right,
  payoff,estimateType:'sampled-terminal-outcomes',certified:false,
  valueBounds:[0,100],estimatedGameValuePct:complete?pct(both.value):null,
  samples,unresolved:table.reduce((n,row)=>n+row.reduce((v,c)=>v+c.unresolved,0),0),
  coverage:table.filter(row=>row.every(c=>c.count>0)).length+'/'+L.length,
  deadlineReached,visitedStates:tree.size,turnCap,elapsedMs:Date.now()-start,
  warning:complete?'승패 결과 기반 중요도표본 추정이며 수학적 최적해는 미검증':
   '모든 행동 조합의 승률을 충분히 추정하지 못했음'};
}
function analyze(B,deps,{budgetMs=1800,seed='test',turnCap=120}={}){
 const start=Date.now(),deadline=start+budgetMs;
 const exactBudget=clamp(Math.round(budgetMs*0.30),70,750);
 const exact=exactSupported(B,deps,start+exactBudget);
 if(exact?.certified)return exact;
 const generic=genericTerminalSearch(B,deps,{deadline,seed,turnCap,maxSamples:1800});
 if(generic?.samples>0)return {...generic,exactCandidate:exact?{
  method:exact.method,winBounds:exact.valueBounds,horizon:exact.horizon}:null};
 return exact||generic;
}
module.exports={seedFrom,rng,pick,reward,rootActions,mixedPolicy,asGame,exactSupported,
 genericTerminalSearch,analyze};
