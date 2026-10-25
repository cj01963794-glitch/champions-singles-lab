'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {battle,legal,simulation,Sim}=require('../server.cjs');
const {exactAttackRace}=require('../attack-race.cjs');
const {makeTacticalSearch}=require('../tactical-race.cjs');

const sceptile={species:'Sceptile-Mega',nature:'Jolly',item:'Sceptilite',
 ability:'Lightning Rod',preMegaAbility:'Overgrow',evs:{atk:32,spe:32,hp:2},
 moves:['Swords Dance','Leaf Blade','Earthquake','Rock Slide']};
const prim={species:'Primarina',nature:'Bold',ability:'Torrent',evs:{hp:32,def:32,spe:2},
 moves:['Moonblast','Sparkling Aria','Encore','Aqua Jet']};

test('every move may delay or trigger Mega, but evolution is one-time',()=>{
 const B=battle(sceptile,prim),options=legal(B,'p1');
 assert.equal(options.length,8);
 for(let i=1;i<=4;i++){
  assert.ok(options.includes('move '+i));
  assert.ok(options.includes('move '+i+' mega'));
 }
 assert.equal(legal(B,'p2').length,4);
 const delayed=battle(sceptile,prim);
 delayed.makeChoices('move 1','move 1');
 assert.equal(delayed.p1.pokemon[0].species.isMega,false);
 assert.deepEqual(delayed.p1.pokemon[0].getTypes(),['Grass']);
 if(!delayed.ended){
  assert.ok(legal(delayed,'p1').includes('move 2 mega'));
  delayed.makeChoices('move 2 mega','move 2');
  assert.equal(delayed.p1.pokemon[0].species.isMega,true);
  assert.deepEqual(delayed.p1.pokemon[0].getTypes(),['Grass','Dragon']);
  assert.ok(!legal(delayed,'p1').some(x=>x.endsWith(' mega')));
 }
});
test('delaying Mega changes the first Moonblast outcome',()=>{
 const base=battle(sceptile,prim,'111,222,333,444');
 const early=battle(sceptile,prim,'111,222,333,444');
 base.makeChoices('move 1','move 1');
 early.makeChoices('move 1 mega','move 1');
 assert.equal(base.p1.pokemon[0].species.isMega,false);
 assert.equal(early.p1.pokemon[0].species.isMega,true);
 assert.ok(base.p1.pokemon[0].hp>early.p1.pokemon[0].hp);
});
test('an unresolved Mega-timing choice cannot certify a forced-Mega probability model',()=>{
 const B=battle(sceptile,prim),snapshot=JSON.stringify(B.toJSON());
 assert.equal(exactAttackRace(B,{Sim,horizon:2,deadline:Date.now()+10000}),null);
 assert.equal(makeTacticalSearch(B,{Sim,horizon:2,deadline:Date.now()+10000}),null);
 assert.equal(JSON.stringify(B.toJSON()),snapshot);
});
test('live decisions include Mega timing without applying conditional forced-Mega tables',()=>{
 const a={...sceptile,moves:['Swords Dance','Leaf Blade']};
 const b={...prim,moves:['Moonblast']};
 const firstActions=legal(battle(a,b),'p1');
 const result=simulation(a,b,2,'1579,3137,6027,8191');
 assert.ok(result.choices.length>0);
 assert.ok(firstActions.includes(result.choices[0][0]));
 assert.equal(result.decisionDetails[0].megaTimingConsidered,true);
 assert.equal(result.decisionDetails[0].exactSearch,undefined);
 assert.equal(result.decisionDetails[0].tacticalProbability,undefined);
});
