'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {battle,legal,simulation,wastedOpeningEncore,strategicLegal,avoidImmuneChoice}=require('../server.cjs');
const seed='1579,3137,6027,8191';
const e={name:'기띠에써르',species:'Indeedee',nature:'Modest',item:'Focus Sash',
 ability:'Psychic Surge',moves:['Expanding Force','Mystical Fire','Dazzling Gleam','Encore'],
 evs:{hp:2,atk:0,def:0,spa:32,spd:0,spe:32}};
const m={name:'초점HA따라큐',species:'Mimikyu',nature:'Adamant',item:'Scope Lens',
 ability:'Disguise',moves:['Shadow Claw','Play Rough','Swords Dance','Shadow Sneak'],
 evs:{hp:32,atk:32,def:0,spa:0,spd:0,spe:2}};
test('first-turn Indeedee Encore fails before Mimikyu can use Swords Dance',()=>{
 const b=battle(e,m,seed);
 assert.equal(b.p1.pokemon[0].getStat('spe'),147);
 assert.equal(b.p2.pokemon[0].getStat('spe'),118);
 assert.equal(b.p2.pokemon[0].lastMove,null);
 b.makeChoices('move 4','move 3');
 assert.ok(b.log.some(x=>x.startsWith('|-fail|')&&x.includes('기띠에써르')),
  'Showdown confirms Encore acted before Mimikyu and failed');
 assert.equal(b.p2.pokemon[0].boosts.atk,2);
 assert.equal(b.p2.pokemon[0].volatiles.encore,undefined);
});
test('no-prior-move Encore is not offered against slower non-priority moves, including blocked Shadow Sneak',()=>{
 for(const [left,right,who] of [[e,m,'p1'],[m,e,'p2']]){
  const b=battle(left,right,seed);
  const our=b.getSide(who).pokemon[0],foe=b.getSide(who==='p1'?'p2':'p1').pokemon[0];
  assert.ok(our.getStat('spe')>foe.getStat('spe'));
  assert.equal(b.field.terrain,'psychicterrain');
  assert.ok(legal(b,who).includes('move 4'));
  assert.equal(wastedOpeningEncore(b,who,'move 4'),true);
  assert.equal(strategicLegal(b,who).includes('move 4'),false);
  assert.notEqual(avoidImmuneChoice(b,who,'move 4'),'move 4',
   'fallback must not reintroduce provably unproductive Encore');
 }
});
test('Encore remains available after the target has actually used a move',()=>{
 for(const [a,c,side] of [[e,m,'p1'],[m,e,'p2']]){
  const b=battle(a,c,seed);
  b.makeChoices(...(side==='p1'?['move 2','move 3']:['move 3','move 2']));
  if(b.ended)throw Error('The opponent unexpectedly fainted on turn one');
  assert.equal(b.getSide(side==='p1'?'p2':'p1').pokemon[0].lastMove.id,'swordsdance');
  assert.equal(wastedOpeningEncore(b,side,'move 4'),false);
  assert.ok(strategicLegal(b,side).includes('move 4'));
  b.makeChoices(...(side==='p1'?['move 4','move 2']:['move 2','move 4']));
  assert.ok(b.getSide(side==='p1'?'p2':'p1').pokemon[0].volatiles.encore,
   'Encore correctly punishes a Swords Dance used on the previous turn');
 }
});
test('do not prune Encore if a truly earlier priority move could be captured',()=>{
 const defender={...m,moves:['Shadow Claw','Play Rough','Swords Dance','Protect']};
 const b=battle(e,defender,seed);
 assert.equal(wastedOpeningEncore(b,'p1','move 4'),false,
  'Protect +4 may act before Encore even while user is faster');
 assert.ok(strategicLegal(b,'p1').includes('move 4'));
});
test('saved Indeedee/Mimikyu samples never open with a failing Encore from either seat',()=>{
 for(const [a,b,index] of [[e,m,0],[m,e,1]]){
  const res=simulation(a,b,3,seed);
  assert.notEqual(res.choices?.[0]?.[index],'move 4',
   'AI must not waste turn one using Encore against untouched Mimikyu');
  assert.equal(res.decisionDetails?.[0]?.[index===0?'left':'right'],res.choices[0][index]);
 }
});
