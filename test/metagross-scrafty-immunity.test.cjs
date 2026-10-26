'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {battle,legal,provablyImmuneAttack,strategicLegal,avoidImmuneChoice,simulation}=require('../server.cjs');

// Exact saved samples from the exported sample library (2026-10-26).
const M={name:'고집AS메메타',species:'Metagross-Mega',nature:'Adamant',
 item:'Metagrossite',ability:'Tough Claws',preMegaAbility:'Clear Body',
 moves:['Psychic Fangs','Ice Punch','Earthquake','Bullet Punch'],
 evs:{hp:2,atk:32,def:0,spa:0,spd:0,spe:32}};
const S={name:'용춤 메가곤율거니',species:'Scrafty-Mega',nature:'Adamant',
 item:'Scraftinite',ability:'Intimidate',preMegaAbility:'Intimidate',
 moves:['Drain Punch','Knock Off','Dragon Dance','Taunt'],
 evs:{hp:19,atk:21,def:0,spa:0,spd:0,spe:26}};

test('both Scrafty forms stay Psychic immune; both Metagross Mega timings filtered',()=>{
 for(const [left,right,side] of [[M,S,'p1'],[S,M,'p2']]){
  const B=battle(left,right);
  assert.ok(B.getSide(side==='p1'?'p2':'p1').activeRequest.active[0].canMegaEvo);
  const foe=B.getSide(side==='p1'?'p2':'p1').pokemon[0];
  const next=B.dex.species.get(B.actions.canMegaEvo(foe));
  assert.ok(foe.getTypes().includes('Dark'));
  assert.ok(next.types.includes('Dark'));
  for(const action of ['move 1','move 1 mega']){
   assert.ok(legal(B,side).includes(action));
   assert.equal(provablyImmuneAttack(B,side,action),true,
    action+' is guaranteed ineffective even if opposing Scrafty Mega evolves');
   assert.ok(!strategicLegal(B,side).includes(action));
   assert.notEqual(avoidImmuneChoice(B,side,action),action);
  }
 }
});

test('type-changing Mega still preserves an attack useful against its base form',()=>{
 const G={species:'Gyarados-Mega',item:'Gyaradosite',nature:'Adamant',
  ability:'Mold Breaker',preMegaAbility:'Intimidate',
  moves:['Power Whip','Earthquake','Ice Fang','Dragon Dance'],
  evs:{hp:2,atk:32,spe:32}};
 const B=battle(M,G);
 assert.equal(provablyImmuneAttack(B,'p1','move 1'),false,
  'Gyarados base Water/Flying is not Psychic immune before optional Mega');
 assert.equal(provablyImmuneAttack(B,'p1','move 1 mega'),false);
});

test('real opening choices never use guaranteed-immune Psychic Fangs',()=>{
 const prev=process.env.MEGA_TIMING_MAX_SAMPLES;
 process.env.MEGA_TIMING_MAX_SAMPLES='4';
 try{
  for(const [a,b,side] of [[M,S,0],[S,M,1]]){
   for(const seed of ['1579,3137,6027,8191','9050,5038,6950,14342']){
    const r=simulation(a,b,2,seed);
    const first=r.choices[0]?.[side];
    assert.ok(first,'must return first action');
    assert.ok(!first.startsWith('move 1'),JSON.stringify({seed,first,choices:r.choices}));
    console.log('[METAGROSS-SCRAFTY-IMMUNITY]',JSON.stringify({
      seed,metagrossSide:side,first,correction:r.decisionDetails[0]?.immunityCorrection,
      choices:r.choices}));
   }
  }
 }finally{
  if(prev===undefined)delete process.env.MEGA_TIMING_MAX_SAMPLES;
  else process.env.MEGA_TIMING_MAX_SAMPLES=prev;
 }
});
