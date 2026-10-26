'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const core=require('../server.cjs');
const exp=require('../engines/experimental.cjs');
const p=require('../engines/probability-planner.cjs');
const fixture=require('./experimental-cases.json');
const samples=new Map(fixture.sets.map(x=>[x.name,x]));
const deps={battle:core.battle,legal:core.legal,strategicLegal:core.strategicLegal,
 avoidImmuneChoice:core.avoidImmuneChoice,estimatedDirectDamage:core.estimatedDirectDamage,Sim:core.Sim};
const seed='1579,3137,6027,8191';
test('stage1 event importance sampling restores rare probabilities without species rules',()=>{
 const random=p.rng('test-rare-probability'),N=30000;
 const expected=0.12/24;
 let estimate=0,seen=0,weightSum=0;
 for(let i=0;i<N;i++){
  const miss=p.sampleBernoulliWithImportance(0.12,random);
  const critical=p.sampleBernoulliWithImportance(1/24,random);
  const weight=miss.ratio*critical.ratio;
  weightSum+=weight;
  if(miss.yes&&critical.yes){estimate+=weight;seen++}
 }
 assert.ok(seen>1000,'must deliberately preserve rare events');
 assert.ok(Math.abs(estimate/N-expected)<0.0008,
  'weighted event frequency must converge to 0.12*1/24, not oversample its contribution');
 assert.ok(Math.abs(weightSum/N-1)<0.04,'total importance weight expectation must be one');
});
test('stage1 simultaneous game solver handles mixed decisions without fixed opponent weights',()=>{
 const m=p.mixedPolicy([[1,0],[0,1]],2000);
 for(const x of [...m.left,...m.right])assert.ok(Math.abs(x-0.5)<0.07);
});
test('stage1 optimizes only terminal results and labels incomplete estimates unverified',()=>{
 const B=core.battle(samples.get('원본H32C32누리레느'),
  samples.get('원본광각리베로에이스번'),seed);
 const r=p.analyze(B,deps,{budgetMs:1200,seed,turnCap:70});
 assert.ok(r&&r.leftActions.length===4&&r.rightActions.length===4);
 assert.ok(['sampled-terminal-outcomes','bounded-game-tree'].includes(r.estimateType));
 if(r.estimateType==='sampled-terminal-outcomes'){
  assert.equal(r.certified,false);
  assert.deepEqual(r.valueBounds,[0,100]);
  assert.ok(r.samples>=1);
  for(const row of r.payoff)for(const c of row){
   assert.ok(c.winPct===null||c.winPct>=0&&c.winPct<=100);
   assert.ok(c.unresolved>=0);
   assert.equal(c.estimateType,'importance-weighted-rollout-not-certified');
  }
 }
});
test('stage1 engine has no fixed 2-turn HP/boost weighted evaluation',()=>{
 assert.equal(exp.evaluation,undefined);
 assert.equal(typeof exp.simulateExperimental,'function');
 assert.equal(p.reward({ended:false}),null);
 assert.equal(p.reward({ended:true,winner:'Left'}),1);
 assert.equal(p.reward({ended:true,winner:'Right'}),0);
});

test('rollout uses general immediate-KO mechanics rather than irrational follow-up moves',()=>{
 const bulky=samples.get('원본H32B20C14누리레느');
 const foe=samples.get('원본광각리베로에이스번');
 const B=core.battle(bulky,foe,'47168,18538,47050,37854');
 B.makeChoices('move 2','move 1'); // Natural Gunk Shot miss, Aria critical
 assert.ok(!B.ended);
 const L=core.legal(B,'p1');
 const choice=p.immediateFinisher(B,deps,'p1',L);
 console.log('[STAGE1-IMMEDIATE-TERMINAL]',JSON.stringify({hp:[
  B.p1.pokemon[0].hp,B.p2.pokemon[0].hp],
  left:L,choice:choice<0?null:L[choice],rival:
   p.immediateFinisher(B,deps,'p2',core.legal(B,'p2'))}));
 assert.equal(L[choice],'move 3',
  'Aqua Jet should be found as a general priority immediate knockout, not species rule');
});

test('inspect both Cinderace spreads with unrestricted chance-aware game strategies',()=>{
 const bulky=samples.get('원본H32B20C14누리레느');
 const foe=samples.get('원본광각리베로에이스번');
 const result=exp.simulateExperimental(bulky,foe,1,seed,deps);
 const q=result.decisionDetails[0]?.experimental;
 console.log('[STAGE1-BULKY-ROOT-AUDIT]',JSON.stringify({
  first:result.choices[0],policyLeft:q?.policyLeft,
  policyRight:q?.policyRight,samples:q?.samples,
  estimatedGameValuePct:q?.estimatedGameValuePct,
  versusGunk:q?.payoff?.map(row=>row[0]),
  status:q?.certified?'certified':'provisional'}));
 assert.ok(q?.samples>0);
 assert.equal(q?.certified,false,'cannot call a small self-play sample a proven optimal win rate');
});
