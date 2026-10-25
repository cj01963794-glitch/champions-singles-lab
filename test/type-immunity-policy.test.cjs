'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {battle,legal,simulation,provablyImmuneAttack,strategicLegal,avoidImmuneChoice}=require('../server.cjs');

const dragonite={
 species:'Dragonite-Mega',name:'조심CS메망나',nature:'Modest',item:'Dragoninite',
 ability:'Multiscale',preMegaAbility:'Multiscale',
 evs:{hp:2,atk:0,def:0,spa:32,spd:0,spe:32},
 moves:['Draco Meteor','Thunderbolt','Flamethrower','Extreme Speed']
};
const mimikyu={
 species:'Mimikyu',name:'초점HA따라큐',nature:'Adamant',item:'Scope Lens',
 ability:'Disguise',evs:{hp:32,atk:32,def:0,spa:0,spd:0,spe:2},
 moves:['Shadow Claw','Play Rough','Swords Dance','Shadow Sneak']
};
test('type-chart immunity is not mistaken for breaking Disguise',()=>{
 const b=battle(dragonite,mimikyu);
 assert.deepEqual(b.p2.pokemon[0].getTypes(),['Ghost','Fairy']);
 for(const a of ['move 1','move 1 mega','move 4','move 4 mega'])
  assert.equal(provablyImmuneAttack(b,'p1',a),true,a);
 for(const a of ['move 2','move 2 mega','move 3','move 3 mega'])
  assert.equal(provablyImmuneAttack(b,'p1',a),false,a);
 assert.equal(legal(b,'p1').length,8,'full legal choices must remain unchanged');
 assert.deepEqual(strategicLegal(b,'p1'),['move 2','move 2 mega','move 3','move 3 mega']);
 const changed=avoidImmuneChoice(b,'p1','move 1 mega');
 assert.ok(['move 2','move 2 mega','move 3','move 3 mega'].includes(changed));
});
test('futile Normal/Dragon attacks are also excluded when Dragonite is second player',()=>{
 const b=battle(mimikyu,dragonite);
 assert.equal(provablyImmuneAttack(b,'p2','move 1 mega'),true);
 assert.equal(provablyImmuneAttack(b,'p2','move 4 mega'),true);
 assert.deepEqual(strategicLegal(b,'p2'),['move 2','move 2 mega','move 3','move 3 mega']);
});
test('Mega scrappy must not be incorrectly pruned by static Ghost immunity',()=>{
 const scrap={species:'Kangaskhan-Mega',nature:'Adamant',item:'Kangaskhanite',
 ability:'Parental Bond',preMegaAbility:'Scrappy',
 evs:{hp:2,atk:32,spe:32},moves:['Body Slam','Crunch']};
 const foe={species:'Gengar',nature:'Modest',ability:'Cursed Body',moves:['Shadow Ball']};
 const b=battle(scrap,foe);
 assert.equal(provablyImmuneAttack(b,'p1','move 1'),false);
 assert.equal(provablyImmuneAttack(b,'p1','move 1 mega'),true);
 assert.equal(provablyImmuneAttack(b,'p1','move 2 mega'),false);
});
test('do not prune on possibility of defender changing type by Mega evolution',()=>{
 const b=battle(mimikyu,dragonite);
 // Showdown may change the Mega foe's type. Preserve conservative legality
 // for other Pokemon that do change types with Mega evolution.
 assert.equal(provablyImmuneAttack(b,'p1','move 4'),false);
});
test('Mega Dragonite never chooses Draco Meteor or Extreme Speed on saved Mimikyu set',()=>{
 const prev=process.env.MEGA_TIMING_MAX_SAMPLES;
 process.env.MEGA_TIMING_MAX_SAMPLES='5';
 try{
  for(const [a,b,side] of [
   [dragonite,mimikyu,0],[mimikyu,dragonite,1]
  ]){
   const res=simulation(a,b,3,'1579,3137,6027,8191');
   const opening=res.choices?.[0]?.[side]||'';
   assert.ok(/^move [23](?: mega)?$/.test(opening),
    'The Dragonite opening must break Disguise, not waste a turn: '+JSON.stringify({
     opening,choices:res.choices,detail:res.decisionDetails?.[0]}));
  }
 }finally{
  if(prev===undefined)delete process.env.MEGA_TIMING_MAX_SAMPLES;
  else process.env.MEGA_TIMING_MAX_SAMPLES=prev;
 }
});
