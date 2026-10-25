'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {battle,legal,simulation,Sim}=require('../server.cjs');
const {exactAttackRace}=require('../attack-race.cjs');
const {makeTacticalSearch}=require('../tactical-race.cjs');

const kangaskhan={species:'Kangaskhan-Mega',nature:'Adamant',item:'Kangaskhanite',
 ability:'Parental Bond',preMegaAbility:'Scrappy',evs:{hp:2,atk:32,spe:32},
 moves:['Body Slam']};
const ghost={species:'Gengar',nature:'Modest',ability:'Cursed Body',
 evs:{hp:32,def:32,spe:2},moves:['Sludge Bomb']};
const garchomp={species:'Garchomp',nature:'Adamant',ability:'Rough Skin',
 evs:{hp:2,atk:32,spe:32},moves:['Earthquake']};
const salamence={species:'Salamence-Mega',nature:'Adamant',item:'Salamencite',
 ability:'Aerilate',preMegaAbility:'Intimidate',evs:{hp:2,atk:32,spe:32},
 moves:['Double-Edge']};
const gyarados={species:'Gyarados-Mega',nature:'Adamant',item:'Gyaradosite',
 ability:'Mold Breaker',preMegaAbility:'Intimidate',evs:{hp:2,atk:32,spe:32},
 moves:['Waterfall']};

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
 assert.equal(!!delayed.p1.pokemon[0].species.isMega,false);
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
 assert.equal(!!base.p1.pokemon[0].species.isMega,false);
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


test('pre-Mega Intimidate lowers the opponent attack before turn one',()=>{
 for(const mega of [salamence,gyarados]){
  const b=battle(mega,garchomp);
  assert.equal(b.p1.pokemon[0].ability,'intimidate');
  assert.equal(b.p2.pokemon[0].boosts.atk,-1);
  assert.ok(b.log.some(line=>line.includes('Intimidate')));
  b.makeChoices('move 1 mega','move 1');
  assert.equal(b.p2.pokemon[0].boosts.atk,-1,
   'evolving does not retroactively undo Intimidate');
 }
});
test('base-form Scrappy hits Ghost with Normal attacks, while immediate Mega cannot',()=>{
 const before=battle(kangaskhan,ghost,'111,222,333,444');
 const evolved=battle(kangaskhan,ghost,'111,222,333,444');
 assert.equal(before.p1.pokemon[0].ability,'scrappy');
 const baseHP=before.p2.pokemon[0].hp;
 const megaHP=evolved.p2.pokemon[0].hp;
 before.makeChoices('move 1','move 1');
 evolved.makeChoices('move 1 mega','move 1');
 assert.ok(before.p2.pokemon[0].hp<baseHP,'Scrappy bypasses Ghost immunity');
 assert.equal(evolved.p2.pokemon[0].hp,megaHP,'Parental Bond cannot bypass Ghost immunity');
 assert.equal(!!before.p1.pokemon[0].species.isMega,false);
 assert.equal(evolved.p1.pokemon[0].species.isMega,true);
});
test('decision policy must consider retaining Scrappy to attack Ghost',()=>{
 const result=simulation(kangaskhan,ghost,3,'1579,3137,6027,8191');
 assert.equal(result.choices[0][0],'move 1');
 assert.equal(result.decisionDetails[0].megaTimingConsidered,true);
});
