'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {battle,continuationMove,simulation,estimatedDirectDamage}=require('../server.cjs');
const seed='1579,3137,6027,8191';
const dragonite={species:'Dragonite-Mega',name:'조심CS메망나',nature:'Modest',item:'Dragoninite',
 ability:'Multiscale',preMegaAbility:'Multiscale',
 moves:['Draco Meteor','Thunderbolt','Flamethrower','Extreme Speed'],
 evs:{hp:2,atk:0,def:0,spa:32,spd:0,spe:32}};
const sash={species:'Garchomp',name:'기띠고집한카',nature:'Adamant',
 item:'Focus Sash',ability:'Rough Skin',
 moves:['Earthquake','Scale Shot','Fire Fang','Swords Dance'],
 evs:{hp:2,atk:32,def:0,spa:0,spd:0,spe:32}};
test('Draco Meteor triggers Focus Sash; a slower Mega Dragonite finishes with Extreme Speed',()=>{
 for(const side of ['p1','p2']){
  let b=null;
  // Draco Meteor has 90% accuracy; select an actual on-target RNG sample,
  // rather than mistaking a legitimate miss for a broken Focus Sash model.
  for(let n=1;n<=24;n++){
   const candidate=side==='p1'?battle(dragonite,sash,seed):battle(sash,dragonite,seed);
   candidate.resetRNG([131*n+1,137*n+2,139*n+3,149*n+4].map(x=>x%65536).join(','));
   candidate.makeChoices(...(side==='p1'?['move 1 mega','move 1']:['move 1','move 1 mega']));
   const target=candidate.getSide(side==='p1'?'p2':'p1').pokemon[0];
   if(target.hp===1){b=candidate;break}
  }
  assert.ok(b,'At least one Draco Meteor hit must reach Focus Sash in 24 rolls');
  assert.equal(b.ended,false,'Ground Earthquake cannot hit Dragonite');
  const foe=b.getSide(side==='p1'?'p2':'p1').pokemon[0];
  const attacker=b.getSide(side).pokemon[0];
  assert.equal(foe.hp,1,'Focus Sash protects Garchomp at 1 HP');
  assert.equal(foe.item,'','Focus Sash is consumed');
  assert.equal(attacker.boosts.spa,-2,'Draco Meteor lowered SpA');
  assert.ok(foe.getStat('spe')>attacker.getStat('spe'),'Garchomp is faster even after Mega');
  assert.ok(estimatedDirectDamage(b,side,'move 4')>1,'Extreme Speed can KO 1 HP');
  assert.equal(continuationMove(b,side),'move 4',
   'Priority finisher must trump slower second Draco Meteor');
  b.makeChoices(...(side==='p1'?['move 4','move 2']:['move 2','move 4']));
  assert.equal(b.winner,side==='p1'?'Left':'Right');
 }
});
test('normal priority should not be used blindly against Ghost type immunity',()=>{
 const foe={species:'Mimikyu',nature:'Adamant',ability:'Disguise',item:'Scope Lens',
  moves:['Shadow Claw','Play Rough','Swords Dance','Shadow Sneak'],evs:{hp:32,atk:32,spe:2}};
 const b=battle(dragonite,foe,seed);
 assert.equal(estimatedDirectDamage(b,'p1','move 4'),0);
 assert.notEqual(continuationMove(b,'p1'),'move 4');
});

test('bounded free-host samples still choose the Mega Draco -> priority plan on either side',()=>{
 const previous=process.env.MEGA_TIMING_MAX_SAMPLES;
 try{
  for(const sampleCap of ['4','8','16']){
   process.env.MEGA_TIMING_MAX_SAMPLES=sampleCap;
   for(const [a,b,side] of [[dragonite,sash,0],[sash,dragonite,1]]){
    const r=simulation(a,b,3,seed);
    const first=r.choices?.[0]?.[side];
    assert.equal(first,'move 1 mega',
     'An immediate Mega Draco Meteor should be preferred to Flamethrower / delayed Mega: '+
      JSON.stringify({sampleCap,side,choices:r.choices,sampled:r.decisionDetails?.[0]?.megaTimingAudit?.samples,
       candidates:r.decisionDetails?.[0]?.megaTimingAudit?.candidates}));
   }
  }
 }finally{
  if(previous===undefined)delete process.env.MEGA_TIMING_MAX_SAMPLES;
  else process.env.MEGA_TIMING_MAX_SAMPLES=previous;
 }
});
