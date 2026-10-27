'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const core=require('../server.cjs');
const A=require('../engines/stage1b/showdown-adapter.cjs');
const exp=require('../engines/experimental.cjs');
const manifest=JSON.parse(fs.readFileSync(path.join(__dirname,'experimental-cases.json'),'utf8'));
const sets=new Map(manifest.sets.map(s=>[s.name,s]));
const seed='1579,3137,6027,8191';
const deps={battle:core.battle,legal:core.legal,Sim:core.Sim};

function summary(B) {
  return [B.getSide('p1'),B.getSide('p2')].map(s=>{
    const p=s.pokemon[0];
    return {hp:p.hp,maxhp:p.maxhp,status:p.status,ability:p.ability,item:p.item,
      species:p.species.id,boosts:p.boosts,pp:p.moveSlots.map(m=>m.pp)};
  });
}
test('Showdown Champions snapshot preserves exact turn with same PRNG',()=>{
  const cases=[
    ['초점HA따라큐','울멧HB아머까오'],
    ['기띠고집한카','조심CS메망나'],
    ['노자속기메갸라','HBC자뭉누리']
  ];
  for(const [left,right] of cases){
    const B=core.battle(sets.get(left),sets.get(right),seed);
    const saved=A.snapshot(B);
    const C=A.restore(saved,core.Sim);
    assert.deepEqual(summary(C),summary(B),left+' / '+right+' initial state');
    const la=core.legal(B,'p1')[0],ra=core.legal(B,'p2')[0];
    B.makeChoices(la,ra);C.makeChoices(la,ra);
    assert.deepEqual(summary(C),summary(B),left+' / '+right+' restored turn outcome');
    assert.equal(C.ended,B.ended);
  }
});
test('independently reseeded search uses authoritative legal actions',()=>{
  const left=sets.get('초점HA따라큐'),right=sets.get('울멧HB아머까오');
  const B=core.battle(left,right,seed);
  const result=exp.simulateExperimental(left,right,1,seed,deps);
  assert.equal(result.model,'experimental');
  assert.equal(result.engineVersion,'stage1b-duct-open-sheet-v1');
  assert.equal(result.choices.length,1);
  assert.ok(core.legal(B,'p1').includes(result.choices[0][0]));
  assert.ok(core.legal(B,'p2').includes(result.choices[0][1]));
  const stats=result.decisionDetails[0].experimental;
  assert.equal(stats.mode,'duct-simultaneous-mcts');
  assert.equal(stats.certified,false);
  assert.ok(stats.samples>=1);
  assert.ok(stats.elapsedMs>=0);
  assert.ok(stats.actionsLeft.length>0);
  assert.ok(stats.actionsRight.length>0);
});
