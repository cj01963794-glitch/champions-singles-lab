'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {battle,legal,simulation,continuationMove,Sim}=require('../server.cjs');
const R={name:'HB불로톰',species:'Rotom-Heat',nature:'Bold',item:'Leftovers',ability:'Levitate',
 moves:['Volt Switch','Overheat','Will-O-Wisp','Pain Split'],
 evs:{hp:32,atk:0,def:32,spa:0,spd:2,spe:0}};
const S={name:'고집AS메만다',species:'Salamence-Mega',nature:'Adamant',item:'Salamencite',
 ability:'Aerilate',preMegaAbility:'Intimidate',
 moves:['Double-Edge','Earthquake','Dragon Dance','Roost'],
 evs:{hp:2,atk:32,def:0,spa:0,spd:0,spe:32}};
test('diagnose current opening, both sides and seeds',()=>{
 for(const [a,b,rotom] of [[R,S,0],[S,R,1]]){
  for(const seed of ['1579,3137,6027,8191','9050,5038,6950,14342']){
   const r=simulation(a,b,4,seed);
   const actions=r.decisionDetails[0]?.megaTimingAudit?.[rotom===0?'leftActions':'rightActions'];
   assert.ok(actions?.includes('move 3'),'Burn must be present in full-turn win-rate search, not pruned out');
   console.log('[ROTOM-SALAMENCE-MATRIX]',JSON.stringify({seed,rotom,first:r.choices[0],
    audit:r.decisionDetails[0]?.megaTimingAudit}));
   assert.ok(r.choices.slice(0,3).some(turn=>turn[rotom]==='move 3'),
    'Long-horizon plan must actually attempt burn within three turns instead of repeating Volt Switch');
   console.log('[ROTOM-SALAMENCE-POLICY]',JSON.stringify({seed,rotom,choices:r.choices,stop:r.stopReason,
    details:r.decisionDetails.slice(0,2).map(x=>({turn:x.turn,left:x.left,right:x.right,megaTiming:x.megaTimingAudit&&{
     samples:x.megaTimingAudit.samples,leftActions:x.megaTimingAudit.leftActions,rightActions:x.megaTimingAudit.rightActions
    },depth:x.depth}))}));
  }
 }
});
test('burn vs volt switch, measured in actual showdown, without guessing aura or switch effects',()=>{
 for(const enemyMove of ['move 1 mega','move 3 mega']){
  for(const ourMove of ['move 1','move 2','move 3']){
   const B=battle(R,S,'1579,3137,6027,8191');
   B.makeChoices(ourMove,enemyMove);
   const ro=B.p1.pokemon[0],sa=B.p2.pokemon[0];
   console.log('[ROTOM-SALAMENCE-TURN-1]',JSON.stringify({ourMove,enemyMove,rotomHp:[ro.hp,ro.maxhp],
    salamenceHp:[sa.hp,sa.maxhp],status:sa.status,boosts:sa.boosts,
    followup:[continuationMove(B,'p1'),continuationMove(B,'p2')],
    log:B.log.filter(x=>/\\|move\\||\\|-damage\\||\\|-status\\||\\|-miss\\||\\|-mega\\||\\|-boost\\||\\|-heal\\||\\|-immune\\|/.test(x)).slice(-16)}));
  }
 }
});

test('defensive ability immunity is respected by every attack-ranking pathway',()=>{
 const {estimatedDirectDamage,provablyImmuneAttack,avoidImmuneChoice}=require('../server.cjs');
 const B=battle(S,R,'1579,3137,6027,8191');
 for(const option of ['move 2','move 2 mega']){
  assert.equal(provablyImmuneAttack(B,'p1',option),true,
   'Earthquake cannot affect Levitate even after Mega evolution');
  assert.equal(estimatedDirectDamage(B,'p1',option),0,
   'heuristic threat estimates must not treat Levitate as a 4x Ground weakness');
  assert.notEqual(avoidImmuneChoice(B,'p1',option),option);
 }
 const base=battle(S,R,'1579,3137,6027,8191');
 // Change the live battle's ability only to test the matchup heuristic's
 // counterfactual. Team import validation correctly disallows this set.
 base.p2.pokemon[0].ability='pressure';
 assert.ok(estimatedDirectDamage(base,'p1','move 2')>0,
  'the same Ground move should still do damage without Levitate');
});

test('a burned physical booster evaluates actual weakened damage and future setup',()=>{
 const {estimatedDirectDamage}=require('../server.cjs');
 const B=battle(S,R,'1579,3137,6027,8191');
 B.makeChoices('move 3 mega','move 3');
 const mence=B.p1.pokemon[0],hp=mence.hp;
 assert.equal(mence.status,'brn','Showdown records real burn');
 const burned=estimatedDirectDamage(B,'p1','move 1');
 mence.status='';
 const healthy=estimatedDirectDamage(B,'p1','move 1');
 mence.status='brn';
 assert.ok(healthy>=burned*1.95,{burned,healthy});
 const next=continuationMove(B,'p1');
 console.log('[BURNED-MENCE-CONTINUATION]',JSON.stringify({hp,menceMaxHp:mence.maxhp,
  boost:mence.boosts.atk,burned,healthy,next,pp:mence.moveSlots.map(x=>({id:x.id,pp:x.pp}))}));
 assert.equal(next,'move 3','healthy boosted attacker should seek a winning damage threshold, not waste Roost');
});

test('sustained route re-evaluates attacking win attempts for both sides after burn',()=>{
 const r=simulation(S,R,6,'1579,3137,6027,8191');
 const mence=r.choices.map(x=>x[0]),rotom=r.choices.map(x=>x[1]);
 console.log('[SUSTAINED-BOTH-SIDES]',JSON.stringify({mence,rotom,stop:r.stopReason,
  final:r.log.filter(x=>/^\\|move\\||^\\|-status\\||^\\|-boost\\||^\\|-heal\\|/.test(x)).slice(-28)}));
 assert.ok(rotom.includes('move 3'),'defender must have a burn line');
 assert.ok(mence.includes('move 1') || mence.includes('move 1 mega') ||
  mence.filter(x=>x.startsWith('move 3')).length>=2,
  'attacker must pursue attack or setup rather than repeat Roost after turn one');
});
