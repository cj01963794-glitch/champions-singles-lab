'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {battle,simulation,strategicLegal,continuationMove,Sim}=require('../server.cjs');
const rot={name:'HB불로톰',species:'Rotom-Heat',nature:'Bold',item:'Leftovers',ability:'Levitate',
 moves:['Volt Switch','Overheat','Will-O-Wisp','Pain Split'],evs:{hp:32,atk:0,def:32,spa:0,spd:2,spe:0}};
const scr={name:'용춤 메가곤율거니',species:'Scrafty-Mega',nature:'Adamant',item:'Scraftinite',
 ability:'Intimidate',preMegaAbility:'Intimidate',moves:['Drain Punch','Knock Off','Dragon Dance','Taunt'],evs:{hp:19,atk:21,def:0,spa:0,spd:0,spe:26}};
const seed='1579,3137,6027,8191';
test('saved Scrafty vs Rotom actual opener and continuation',()=>{
 for(const [a,b,ri] of [[rot,scr,0],[scr,rot,1]]){
  const r=simulation(a,b,7,seed);
  console.log('[ROTOM-SCRAFTY-SIM]',JSON.stringify({ri,actions:r.choices,stop:r.stopReason,
   opening:r.decisionDetails?.[0]?.megaTimingAudit,details:r.decisionDetails?.slice(0,4).map(x=>({
    l:x.left,r:x.right,depth:x.depth,sustain:x.sustainRoute
   }))}));
 }
});
test('measure burn, Pain Split, Volt Switch mechanics versus Mega Scrafty',()=>{
 for(const sm of ['move 1 mega','move 2 mega','move 3 mega','move 4 mega']){
  for(const rm of ['move 1','move 3']){
   const B=battle(rot,scr,seed);
   B.makeChoices(rm,sm);
   const r=B.p1.pokemon[0],s=B.p2.pokemon[0];
   console.log('[ROTOM-SCRAFTY-OPEN]',JSON.stringify({rm,sm,hps:[r.hp,r.maxhp,s.hp,s.maxhp],
    status:s.status,boost:s.boosts,ability:[r.ability,s.ability],next:[continuationMove(B,'p1'),continuationMove(B,'p2')],
    roLegal:strategicLegal(B,'p1'),scLegal:strategicLegal(B,'p2'),
    moves:B.log.filter(x=>x.startsWith('|move|')||x.startsWith('|-status|')||x.startsWith('|-fail|')||x.startsWith('|-immune|')||x.startsWith('|-damage|')).slice(-16)}));
  }
 }
});
test('Pain Split updates both actual HP and emits two-sided -sethp log',()=>{
 const B=battle(rot,scr,seed);
 B.makeChoices('move 4','move 2 mega');
 const hp=[B.p1.pokemon[0].hp,B.p2.pokemon[0].hp];
 const max=[B.p1.pokemon[0].maxhp,B.p2.pokemon[0].maxhp];
 const log=B.log.filter(x=>x.includes('Pain Split')||x.includes('|-sethp|')||x.startsWith('|-damage|')||x.startsWith('|-heal|'));
 console.log('[ROTOM-SCRAFTY-PAINSPLIT]',JSON.stringify({hp,max,log:log.slice(-35)}));
 assert.ok(log.some(x=>x.includes('Pain Split')));
 assert.ok(log.some(x=>x.includes('|-sethp|')),'engine must report the new HP of both battlers');
 assert.ok(hp[0]<max[0]&&hp[0]>0&&hp[1]<max[1]&&hp[1]>0);
});
test('Mega Scrafty Taunt acts before Rotom burn and prevents status',()=>{
 const B=battle(rot,scr,seed);
 B.makeChoices('move 3','move 4 mega');
 assert.equal(B.p2.pokemon[0].status,'');
 assert.ok(B.log.some(x=>x.includes('Taunt')));
});

test('status plus Pain Split qualifies for long-horizon planning against a physical booster',()=>{
 const {needsSustainHorizon}=require('../server.cjs');
 const B=battle(rot,scr,seed);
 assert.equal(needsSustainHorizon(B),true,
  'a wall with burn, Pain Split and Leftovers cannot be evaluated with attack-only five-turn horizon');
});


test('after a successful burn the wall keeps a deep response planner on next turn',()=>{
 for(const [a,b,ri] of [[rot,scr,0],[scr,rot,1]]){
  const result=simulation(a,b,4,seed);
  const first=result.choices[0],next=result.decisionDetails[1];
  // Track only branches where the status did land. Taunt is a real
  // counterplay, not a case where forced Will-O-Wisp is always optimal.
  const played=first?.[ri];
  console.log('[ROTOM-SCRAFTY-LONG-CONTINUATION]',JSON.stringify({ri,first,second:result.choices[1],
    depth:next?.depth,sustain:next?.sustainRoute}));
  if(played==='move 3'){
   const B=battle(a,b,seed);
   B.makeChoices(first[0],first[1]);
   const opponent=B.getSide(ri===0?'p2':'p1').pokemon[0];
   if(opponent.status==='brn'){
    assert.ok(next?.sustainRoute?.includes(ri===0?'p1':'p2'),
      'continue status-defense strategy after actual burn, not 2-turn HP-only search');
   }
  }
 }
});

test('deep root includes both Taunt and Dragon Dance counterplay, not just attacks',()=>{
 const {focusedSustainOpening,needsSustainHorizon}=require('../server.cjs');
 for(const [a,b,ri] of [[rot,scr,0],[scr,rot,1]]){
  const B=battle(a,b,seed),sc=ri===0?'p2':'p1',ro=ri===0?'p1':'p2';
  assert.equal(needsSustainHorizon(B),true);
  const foe=focusedSustainOpening(B,sc),mine=focusedSustainOpening(B,ro);
  console.log('[FOCUSED-ROOT-COMPLETENESS]',JSON.stringify({ri,foe,mine}));
  assert.ok(foe.includes('move 3 mega'),'Dragon Dance must be an opponent candidate');
  assert.ok(foe.includes('move 4 mega'),'Taunt must be an opponent candidate');
  assert.ok(mine.includes('move 3'),'Will-O-Wisp must be my candidate');
  assert.ok(mine.includes('move 1'),'Volt Switch must also be compared');
 }
});


test('four-sample full-horizon search cannot override a defensible status opener with noise',()=>{
 const old=process.env.MEGA_TIMING_MAX_SAMPLES;
 process.env.MEGA_TIMING_MAX_SAMPLES='4';
 try{
  for(const [a,b,ri] of [[rot,scr,0],[scr,rot,1]]){
   const out=simulation(a,b,3,seed);
   const root=out.decisionDetails[0];
   console.log('[ROTOM-SCRAFTY-LOW-BUDGET]',JSON.stringify({ri,first:out.choices[0],
    samples:root?.megaTimingAudit?.samples,provisional:root?.megaTimingAudit?.provisionalFallback}));
   assert.equal(out.choices[0]?.[ri],'move 3',
    'avoid an arbitrary Volt Switch/Overheat from an under-sampled 15-turn search');
   assert.equal(root?.megaTimingAudit?.provisionalFallback,'mechanics-aware-status-sustain');
  }
 }finally{
  if(old===undefined)delete process.env.MEGA_TIMING_MAX_SAMPLES;
  else process.env.MEGA_TIMING_MAX_SAMPLES=old;
 }
});

test('numeric taunt/drain-punch versus overheat/burn continuation checks',()=>{
 const openings=[
  ['Taunt vs Overheat','move 2','move 4 mega'],
  ['Drain Punch vs Overheat','move 2','move 1 mega'],
  ['Dragon Dance vs Overheat','move 2','move 3 mega'],
  ['Taunt vs Will-O-Wisp','move 3','move 4 mega'],
  ['Drain Punch vs Will-O-Wisp','move 3','move 1 mega'],
  ['Dragon Dance vs Will-O-Wisp','move 3','move 3 mega'],
 ];
 for(const [caseName,ra,sa] of openings){
  const B=battle(rot,scr,seed);
  B.makeChoices(ra,sa);
  const first={
   rotHp:B.p1.pokemon[0].hp,
   scraftyHp:B.p2.pokemon[0].hp,
   scraftyMax:B.p2.pokemon[0].maxhp,
   roSpa:B.p1.pokemon[0].boosts.spa,
   scAtk:B.p2.pokemon[0].boosts.atk,
   scStatus:B.p2.pokemon[0].status,
   taunted:!!B.p1.pokemon[0].volatiles.taunt
  };
  // Preserve each opener state and compare both players' tactical
  // continuations rather than evaluating first-turn chip alone.
  const checkpoint=JSON.stringify(B.toJSON());
  const successors=[];
  for(const secondSc of ['move 1','move 3']){
   for(const secondRo of ['move 2','move 4']){
    const C=Sim.Battle.fromJSON(checkpoint);
    C.makeChoices(secondRo,secondSc);
    const sh=C.p2.pokemon[0],rh=C.p1.pokemon[0];
    successors.push({rotom:secondRo,scrafty:secondSc,
     roHp:rh.hp,scHp:sh.hp,roSpa:rh.boosts.spa,scAtk:sh.boosts.atk,
     scStatus:sh.status,taunted:!!rh.volatiles.taunt,
     drainHeal:C.log.filter(v=>v.startsWith('|-heal|')&&v.includes('곤율거니')).slice(-1)});
   }
  }
  console.log('[SCRAFTY-TAUNT-RECOVERY-NUMERIC]',JSON.stringify({caseName,first,successors}));
 }
});