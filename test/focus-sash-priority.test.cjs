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
  const b=side==='p1'?battle(dragonite,sash,seed):battle(sash,dragonite,seed);
  b.makeChoices(...(side==='p1'?['move 1 mega','move 1']:['move 1','move 1 mega']));
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
