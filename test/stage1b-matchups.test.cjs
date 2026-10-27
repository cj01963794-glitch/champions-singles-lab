'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const core=require('../server.cjs');
const A=require('../engines/stage1b/showdown-adapter.cjs');
const {runDuct}=require('../engines/stage1b/duct-search.cjs');
const exp=require('../engines/experimental.cjs');
const fixture=require('./experimental-cases.json');
const sets=new Map(fixture.sets.map(x=>[x.name,x]));
const seed='1579,3137,6027,8191';
const deps={battle:core.battle,legal:core.legal,Sim:core.Sim};

function get(name){
  const x=sets.get(name);assert.ok(x,'Missing stored matchup sample: '+name);return x;
}
function approxOne(weights){
  assert.ok(weights.every(x=>Number.isFinite(x)&&x>=0&&x<=1),JSON.stringify(weights));
  assert.ok(Math.abs(weights.reduce((a,b)=>a+b,0)-1)<1e-8,JSON.stringify(weights));
}
test('real Champions search is read-only, legal, two-sided, and reports unresolved work',()=>{
  const pairs=[
    ['초점HA따라큐','울멧HB아머까오'],
    ['HS명상메플라','HB와자몽'],
    ['조심CS메망나','기띠고집한카'],
    ['기띠에써르','초점HA따라큐'],
    ['노자속기메갸라','HBC자뭉누리']
  ];
  for(const [a,b] of pairs){
    for(const [left,right] of [[a,b],[b,a]]){
      const B=core.battle(get(left),get(right),seed);
      const before=JSON.stringify(B.toJSON());
      const r=runDuct(B,deps,{seed:'acceptance:'+left+':'+right,
        budgetMs:130,treeDepth:8,maxRolloutTurns:20,maxIterations:350});
      assert.equal(JSON.stringify(B.toJSON()),before,'search mutated source battle');
      assert.ok(r.iterations>=1,left+' vs '+right+' no search iterations');
      assert.ok(r.completed+r.unresolved===r.iterations);
      assert.ok(r.leftActions.length&&r.rightActions.length);
      for(const a of r.leftActions)assert.ok(core.legal(B,'p1').includes(a),'illegal left '+a);
      for(const a of r.rightActions)assert.ok(core.legal(B,'p2').includes(a),'illegal right '+a);
      approxOne(r.policyLeft);approxOne(r.policyRight);
      assert.equal(r.certified,false);
      assert.equal(r.treeMode,'open-loop');
      assert.equal(r.estimatedGameValuePct,null);
      console.log('[STAGE1B-CASE]',JSON.stringify({left,right,iterations:r.iterations,
        resolved:r.completed,unresolved:r.unresolved,nodes:r.nodes,depth:r.maxReachedDepth,
        ms:r.elapsedMs,rootTopLeft:r.leftActions[r.policyLeft.indexOf(Math.max(...r.policyLeft))],
        rootTopRight:r.rightActions[r.policyRight.indexOf(Math.max(...r.policyRight))]}));
    }
  }
});
test('Stage 1B produces correct public structure and honors test-only computation limits',()=>{
  const a=get('HS명상메플라'),b=get('HB와자몽');
  const result=exp.simulateExperimental(a,b,3,seed,deps,{
    totalBudgetMs:1200,firstTurnBudgetMs:150,laterTurnBudgetMs:90,maxIterations:200
  });
  assert.equal(result.model,'experimental');
  assert.equal(result.engineVersion,'stage1b-duct-open-sheet-v1');
  assert.equal(result.rngSeed,seed);
  assert.ok(result.choices.length>0&&result.choices.length<=3);
  assert.equal(result.decisionDetails[0].experimental.certified,false);
  assert.equal(result.decisionDetails[0].experimental.estimatedGameValuePct,null);
  for(const d of result.decisionDetails){
    assert.equal(d.experimental.mode,'duct-simultaneous-mcts');
    assert.ok(d.experimental.samples>=1);
    assert.ok(d.experimental.samples<=200);
    approxOne(d.experimental.policyLeft);
    approxOne(d.experimental.policyRight);
  }
});
test('same RNG produces identical restored branch, optional Mega and future turn updates',()=>{
  for(const [a,b] of [
    ['HS명상메플라','HB와자몽'],
    ['조심CS메망나','기띠고집한카'],
    ['노자속기메갸라','HBC자뭉누리']
  ]){
    const B=core.battle(get(a),get(b),seed);
    const C=A.restore(A.snapshot(B),core.Sim);
    for(let turn=0;turn<3&&!B.ended;turn++){
      const L=core.legal(B,'p1'),R=core.legal(B,'p2');
      const ml=L.find(x=>x.endsWith(' mega'))||L[0],mr=R.find(x=>x.endsWith(' mega'))||R[0];
      assert.ok(core.legal(C,'p1').includes(ml)&&core.legal(C,'p2').includes(mr));
      B.makeChoices(ml,mr);C.makeChoices(ml,mr);
      const p=s=>[s.turn,s.ended,s.winner,s.prng.getSeed(),
        s.sides.map(side=>side.pokemon.map(mon=>({hp:mon.hp,status:mon.status,
          types:mon.getTypes(),boosts:mon.boosts,item:mon.item,ability:mon.ability,
          moves:mon.moveSlots.map(m=>({id:m.id,pp:m.pp}))})))];
      assert.deepEqual(p(C),p(B),a+' / '+b+' after turn '+(turn+1));
    }
  }
});
test('snapshot and restoration throughput is visibly reported without an invented limit',()=>{
  const B=core.battle(get('HS명상메플라'),get('HB와자몽'),seed);
  const start=process.hrtime.bigint(), count=30;
  for(let i=0;i<count;i++)A.restore(A.snapshot(B),core.Sim);
  const elapsedMs=Number(process.hrtime.bigint()-start)/1e6;
  console.log('[STAGE1B-SNAPSHOT-PROFILE]',JSON.stringify({
    count,totalMs:Math.round(elapsedMs),msPerClone:Number((elapsedMs/count).toFixed(3))
  }));
  assert.ok(Number.isFinite(elapsedMs)&&elapsedMs>=0);
});

test('Showdown restored trials do not share battle-log arrays',()=>{
  const B=core.battle(get('초점HA따라큐'),get('울멧HB아머까오'),seed);
  const initial=B.log.slice(),snapshot=A.snapshot(B);
  assert.notStrictEqual(B.log,snapshot.log);
  const X=A.restore(snapshot,core.Sim,'isolation-A');
  const Y=A.restore(snapshot,core.Sim,'isolation-B');
  assert.notStrictEqual(X.log,Y.log);
  assert.notStrictEqual(X.log,B.log);
  assert.notStrictEqual(X.log,snapshot.log);
  X.makeChoices(core.legal(X,'p1')[0],core.legal(X,'p2')[0]);
  assert.deepEqual(B.log,initial);
  assert.deepEqual(Y.log,initial);
  assert.deepEqual(snapshot.log,initial);
});
