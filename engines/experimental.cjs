'use strict';
// Experimental v0.1: a separate, reversible two-ply simultaneous-action
// planner. It shares ONLY the verified Showdown battle mechanics, input
// validator and type-immunity guards with Legacy. It does not invoke Legacy
// simulation() or continuationMove(). All numeric outcomes are approximate
// finite-horizon utilities, NOT proven win rates.
const crypto=require('node:crypto');
const STATS=['atk','spa','def','spd','spe'];
function seedFrom(x){
 const hash=crypto.createHash('sha256').update(String(x)).digest();
 return [0,2,4,6].map(n=>hash.readUInt16BE(n)).join(',');
}
function readySeed(seed){
 if(seed==null||seed==='')return seedFrom(crypto.randomBytes(16).toString('hex'));
 if(!/^\d{1,5}(,\d{1,5}){3}$/.test(seed)||seed.split(',').some(n=>+n>65535))
  throw Error('Invalid RNG seed');
 return seed;
}
const ix=a=>(Number(String(a).match(/move (\d+)/)?.[1]||0)-1);
function move(B,side,action){return B.dex.moves.get(B.getSide(side).pokemon[0].moveSlots[ix(action)]?.id)}
function normalized(B,side,p){return p.hp/Math.max(1,p.maxhp)}
function statusValue(B,own,foe){
 if(!own.status)return 0;
 const moves=foe.moveSlots.map(m=>B.dex.moves.get(m.id));
 const physical=moves.some(m=>m.category==='Physical'&&m.basePower>0);
 const special=moves.some(m=>m.category==='Special'&&m.basePower>0);
 switch(own.status){
 case 'brn':return physical&&!['guts','quickfeet'].includes(own.ability)?90:16;
 case 'tox':return 65;
 case 'psn':return 42;
 case 'par':return 32+(physical||special?14:0);
 case 'slp':return 95;
 case 'frz':return 125;
 default:return 0;
 }
}
function boostValue(B,p,foe){
 const physical=p.moveSlots.some(s=>{const m=B.dex.moves.get(s.id);return m.category==='Physical'&&m.basePower>0});
 const special=p.moveSlots.some(s=>{const m=B.dex.moves.get(s.id);return m.category==='Special'&&m.basePower>0});
 const a=physical?(p.boosts.atk||0)*20:0;
 const sp=special?(p.boosts.spa||0)*20:0;
 const de=(p.boosts.def||0)*(foe.moveSlots.some(s=>B.dex.moves.get(s.id).category==='Physical')?13:4);
 const sd=(p.boosts.spd||0)*(foe.moveSlots.some(s=>B.dex.moves.get(s.id).category==='Special')?13:4);
 const spe=(p.boosts.spe||0)*10;
 return a+sp+de+sd+spe;
}
function tauntValue(B,own,foe){
 if(!own.volatiles?.taunt)return 0;
 const important=own.moveSlots.filter(s=>{
  const m=B.dex.moves.get(s.id);
  return m.category==='Status'&&(m.status||m.boosts||m.heal||m.id==='painsplit'||m.id==='roost'||m.id==='synthesis');
 }).length;
 return Math.min(68,important*26);
}
function evaluation(B,deps){
 if(B.ended)return B.winner==='Left'?3000:B.winner==='Right'?-3000:0;
 const a=B.getSide('p1').pokemon[0],b=B.getSide('p2').pokemon[0];
 function advantage(p,q,side){
  const hp=normalized(B,side,p)*180;
  const stats=boostValue(B,p,q);
  const status=-statusValue(B,p,q);
  const taunt=-tauntValue(B,p,q);
  // Effective future attack pressure is ranked with live Showdown stats,
  // including boosts, burns, immunities and current opponent HP.
  // The reported values are only continuation heuristics; all actual
  // damage, drain healing and recoil are resolved in Battle.makeChoices.
  const attacks=p.moveSlots.map((s,i)=>({m:B.dex.moves.get(s.id),i}))
    .filter(x=>x.m.category!=='Status'&&x.m.basePower>0);
  let damage=0;
  for(const x of attacks){
   // Reuse the legacy-mechanics damage approximation only as a shared
   // mechanical primitive (status, boosts, Levitate, Mega); policy is new.
   const approx=deps.estimatedDirectDamage(B,side,'move '+(x.i+1));
   damage=Math.max(damage,Math.min(120,approx/Math.max(1,q.hp)*95));
  }
  return hp+stats+status+taunt+damage;
 }
 return Math.max(-2200,Math.min(2200,advantage(a,b,'p1')-advantage(b,a,'p2')));
}
// Structural impossibilities can be pruned. Never remove a speculative
// status move solely because the opponent happens to carry Taunt.
function saneMove(B,side,action){
 const p=B.getSide(side).pokemon[0],foe=B.getSide(side==='p1'?'p2':'p1').pokemon[0],m=move(B,side,action);
 if(!m?.exists)return false;
 if(m.category!=='Status')return true;
 if(m.status&&foe.status)return false;
 if(m.heal&&p.hp===p.maxhp&&m.id!=='painsplit')return false;
 if(m.id==='painsplit'&&p.hp>=foe.hp)return false;
 if(m.target==='self'){
  const boosts=m.boosts||m.self?.boosts||{};
  if(Object.entries(boosts).length&&Object.entries(boosts).every(([k,v])=>v>0?p.boosts[k]>=6:p.boosts[k]<=-6))return false;
 }
 return true;
}
function options(B,side,dependencies,limit=8){
 const all=dependencies.strategicLegal(B,side).filter(a=>saneMove(B,side,a));
 if(all.length<=limit)return all;
 // Keep all distinct move identities, and prefer a Mega variant while
 // retaining delayed-Mega when its type/ability differs. No hardcoded species.
 const sorted=[...all].sort((a,b)=>{
  const ma=move(B,side,a),mb=move(B,side,b);
  const rank=(m,x)=>m.category==='Status'?40+(m.status?20:0)+(m.boosts?10:0):
   10+Math.min(90,m.basePower)*(m.accuracy===true?1:typeof m.accuracy==='number'?m.accuracy/100:1)+(String(x).endsWith(' mega')?3:0);
  return rank(mb,b)-rank(ma,a);
 });
 const selected=[],seen=new Set();
 for(const a of sorted){
  const id=move(B,side,a).id;
  if(!seen.has(id)){seen.add(id);selected.push(a)}
 }
 for(const a of sorted){
  if(selected.length>=limit)break;
  if(!selected.includes(a))selected.push(a);
 }
 return selected.slice(0,limit);
}
function simpleMatrix(B,deps,deadline){
 const L=options(B,'p1',deps,5),R=options(B,'p2',deps,5);
 if(!L.length||!R.length)return null;
 const saved=JSON.stringify(B.toJSON());
 const out=L.map(()=>R.map(()=>0));
 for(let i=0;i<L.length;i++)for(let j=0;j<R.length;j++){
  if(Date.now()>deadline)return null;
  const child=deps.Sim.Battle.fromJSON(saved);
  child.makeChoices(L[i],R[j]);
  out[i][j]=evaluation(child,deps);
 }
 return {L,R,values:out};
}
function equilibrium(mat,iterations=150){
 const n=mat.length,m=mat[0].length;
 let R1=Array(n).fill(0),R2=Array(m).fill(0),avg1=Array(n).fill(0),avg2=Array(m).fill(0);
 const strategy=R=>{
  const plus=R.map(x=>Math.max(0,x)),sum=plus.reduce((a,b)=>a+b,0);
  return plus.map(x=>sum?x/sum:1/R.length);
 };
 for(let k=0;k<iterations;k++){
  const x=strategy(R1),y=strategy(R2);
  for(let i=0;i<n;i++)avg1[i]+=x[i];
  for(let j=0;j<m;j++)avg2[j]+=y[j];
  const u=mat.map(row=>row.reduce((s,v,j)=>s+v*y[j],0));
  const v=Array.from({length:m},(_,j)=>mat.reduce((s,row,i)=>s+row[j]*x[i],0));
  const avg=u.reduce((s,q,i)=>s+q*x[i],0);
  for(let i=0;i<n;i++)R1[i]+=u[i]-avg;
  for(let j=0;j<m;j++)R2[j]+=avg-v[j];
 }
 const sum=x=>x.reduce((a,b)=>a+b,0)||1;
 return {left:avg1.map(x=>x/sum(avg1)),right:avg2.map(x=>x/sum(avg2))};
}
function pick(actions,probabilities,seed){
 const bytes=crypto.createHash('sha256').update(seed).digest(),r=bytes.readUInt32BE(0)/4294967296;
 let cum=0;
 for(let i=0;i<actions.length;i++){cum+=probabilities[i];if(r<cum)return actions[i]}
 return actions[actions.length-1];
}
function oneTurn(B,deps,deadline){
 const matrix=simpleMatrix(B,deps,deadline);
 if(!matrix)return null;
 const probs=equilibrium(matrix.values,110);
 return {...matrix,policies:probs};
}
// Depth-2 search with simultaneous opponent responses, applied to the
// actual result of each root action pair. All response actions are selected
// independently for both sides, not secretly from the actual next move.
function planning(B,deps,deadline,seed,turn){
 const L=options(B,'p1',deps),R=options(B,'p2',deps);
 if(!L.length||!R.length)return null;
 const initial=JSON.stringify(B.toJSON()),values=L.map(()=>R.map(()=>0));
 const seedList=[seedFrom(seed+':experiment:'+turn+':0'),seedFrom(seed+':experiment:'+turn+':1')];
 const sampleN=L.length*R.length>32?1:2;
 let complete=0;
 for(let z=0;z<sampleN;z++){
  const round=L.map(()=>R.map(()=>0));
  for(let i=0;i<L.length;i++)for(let j=0;j<R.length;j++){
   if(Date.now()>deadline)return complete?{L,R,values:values.map(row=>row.map(x=>x/complete)),samples:complete,truncated:true}:null;
   const child=deps.Sim.Battle.fromJSON(initial);
   child.resetRNG(seedList[z]);
   child.makeChoices(L[i],R[j]);
   if(child.ended){round[i][j]=evaluation(child,deps);continue}
   // A second simultaneous choice is assessed with a fresh zero-sum
   // response matrix, avoiding a fixed greedy opponent.
   const second=simpleMatrix(child,deps,deadline);
   if(!second)return complete?{L,R,values:values.map(row=>row.map(x=>x/complete)),samples:complete,truncated:true}:null;
   const policy=equilibrium(second.values,55);
   let utility=0;
   for(let x=0;x<second.L.length;x++)for(let y=0;y<second.R.length;y++)
    utility+=policy.left[x]*policy.right[y]*second.values[x][y];
   round[i][j]=utility;
  }
  for(let i=0;i<L.length;i++)for(let j=0;j<R.length;j++)values[i][j]+=round[i][j];
  complete++;
 }
 return {L,R,values:values.map(row=>row.map(x=>x/complete)),samples:complete,truncated:false};
}
function simulateExperimental(a,b,depth=120,rngSeed,deps){
 depth=Number.isInteger(depth)?Math.min(250,Math.max(1,depth)):120;
 const seed=readySeed(rngSeed),B=deps.battle(a,b,seed),choices=[],details=[];
 const start=Date.now(),overallDeadline=start+28000;
 let mode='two-ply-simultaneous-response',stopReason='',estimatedValue=null;
 for(let turn=0;turn<depth&&!B.ended;turn++){
  if(Date.now()>overallDeadline){stopReason='compute_timeout';break}
  const deadline=Math.min(Date.now()+(turn===0?7000:1900),overallDeadline-800);
  const result=planning(B,deps,deadline,seed,turn);
  let equilibriumResult,from='two-ply';
  if(result){
   equilibriumResult=equilibrium(result.values,200);
   if(result.truncated)from='partial-two-ply';
  }else{
   const fallback=oneTurn(B,deps,Math.min(Date.now()+850,overallDeadline-100));
   if(!fallback){stopReason='compute_timeout';break}
   equilibriumResult=fallback.policies;
   estimatedValue=null;
   from='one-ply-provisional';
   mode='bounded-simultaneous-policy-with-fallback';
  }
  const L=result?.L||undefined,R=result?.R||undefined;
  const availableL=L||options(B,'p1',deps,5),availableR=R||options(B,'p2',deps,5);
  const left=pick(availableL,equilibriumResult.left,seed+':p1:'+turn);
  const right=pick(availableR,equilibriumResult.right,seed+':p2:'+turn);
  const l=deps.avoidImmuneChoice(B,'p1',left),r=deps.avoidImmuneChoice(B,'p2',right);
  if(!l||!r){stopReason='no_available_actions';break}
  if(turn<8)details.push({turn:turn+1,left:l,right:r,depth:from==='one-ply-provisional'?1:2,
   experimental:{mode:from,samples:result?.samples||0,actionsLeft:availableL,actionsRight:availableR,
    policyLeft:equilibriumResult.left.map(x=>Math.round(x*1000)/1000),
    policyRight:equilibriumResult.right.map(x=>Math.round(x*1000)/1000),
    utility:'finite-horizon-not-win-probability',seed}});
  B.makeChoices(l,r);choices.push([l,r]);
 }
 if(B.ended)stopReason='battle_ended';
 else if(!stopReason)stopReason=choices.length>=depth?'turn_limit':'other';
 return {model:'experimental',winner:B.ended?(B.winner||'draw'):'unresolved',
  stopReason,policy:mode,rngSeed:seed,log:B.log,choices,turns:choices.length,
  maxTurns:depth,decisionDetails:details,searchFallbacks:details.filter(x=>x.experimental.mode==='one-ply-provisional').length,
  disclaimer:'Experimental two-ply utility equilibrium; not certified optimal win probability'};
}
module.exports={simulateExperimental,options,equilibrium,evaluation,planning};
