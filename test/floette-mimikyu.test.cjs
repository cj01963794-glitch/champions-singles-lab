'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {battle,simulation,legal,continuationMove,estimatedDirectDamage}=require('../server.cjs');
const F={name:'HS명상메플라',species:'Floette-Mega',nature:'Timid',
 item:'Floettite',ability:'Fairy Aura',preMegaAbility:'Flower Veil',
 moves:['Moonblast','Synthesis','Draining Kiss','Calm Mind'],
 evs:{hp:22,atk:0,def:11,spa:1,spd:0,spe:32}};
const M={name:'초점HA따라큐',species:'Mimikyu',nature:'Adamant',
 item:'Scope Lens',ability:'Disguise',
 moves:['Shadow Claw','Play Rough','Swords Dance','Shadow Sneak'],
 evs:{hp:32,atk:32,def:0,spa:0,spd:0,spe:2}};

test('observe saved Floette and Mimikyu opening on both sides',()=>{
 const prev=process.env.MEGA_TIMING_MAX_SAMPLES;process.env.MEGA_TIMING_MAX_SAMPLES='5';
 try{
 for(const [left,right,fl] of [[F,M,0],[M,F,1]]){
  const r=simulation(left,right,4,'1579,3137,6027,8191');
  console.log('[FLOETTE-MIMIKYU-LIVE-OPEN]',JSON.stringify({fl,choices:r.choices,win:r.winner,stop:r.stopReason,first:r.decisionDetails[0]&&{
   left:r.decisionDetails[0].left,right:r.decisionDetails[0].right,
   samples:r.decisionDetails[0].megaTimingAudit?.samples,
   leftActions:r.decisionDetails[0].megaTimingAudit?.leftActions,
   rightActions:r.decisionDetails[0].megaTimingAudit?.rightActions,
   payoff:r.decisionDetails[0].megaTimingAudit?.payoff
  },turns:r.decisionDetails.map(d=>({l:d.left,r:d.right,depth:d.depth}))}));
 }
 }finally{if(prev===undefined)delete process.env.MEGA_TIMING_MAX_SAMPLES;else process.env.MEGA_TIMING_MAX_SAMPLES=prev}
});
test('compare immediate vs delayed Fairy Aura and second-turn Moonblast vs Calm Mind',()=>{
 for(const open of ['move 1','move 1 mega']){
  for(const mimikyu of ['move 1','move 2','move 3']){
   const B=battle(F,M,'1579,3137,6027,8191'),before=B.p1.pokemon[0].hp;
   B.makeChoices(open,mimikyu);
   const f=B.p1.pokemon[0],m=B.p2.pokemon[0];
   console.log('[FLOETTE-MIMIKYU-ONE-TURN]',JSON.stringify({open,mimikyu,
    hp:[f.hp,f.maxhp,m.hp,m.maxhp],damageTaken:before-f.hp,
    types:f.getTypes(),abilities:[f.ability,m.ability],boosts:[f.boosts,m.boosts],
    next:continuationMove(B,'p1'),legal:legal(B,'p1'),
    log:B.log.filter(x=>/\\|move\\||\\|-damage\\||\\|-start\\||\\|-boost\\||\\|-miss\\||\\|-activate\\|/.test(x)).slice(-12)}));
   if(!B.ended){
    for(const next of ['move 1','move 4']){
     const C=require('../server.cjs').Sim.Battle.fromJSON(JSON.stringify(B.toJSON()));
     C.makeChoices(next,'move 2');
     console.log('[FLOETTE-MIMIKYU-TWO-TURNS]',JSON.stringify({open,mimikyu,next,
      outcome:C.winner,after:[C.p1.pokemon[0].hp,C.p2.pokemon[0].hp],
      boosts:[C.p1.pokemon[0].boosts,C.p2.pokemon[0].boosts],
      log:C.log.filter(x=>/\\|move\\||\\|-damage\\||\\|-boost\\||\\|-miss\\||\\|-activate\\|/.test(x)).slice(-10)}));
    }
   }
  }
 }
});
