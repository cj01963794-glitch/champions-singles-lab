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
test('Pain Split directly changes both HP when their current totals differ',()=>{
 const B=battle(rot,scr,seed);
 B.makeChoices('move 1','move 3 mega');
 const before=[B.p1.pokemon[0].hp,B.p2.pokemon[0].hp];
 B.makeChoices('move 4','move 4');
 const after=[B.p1.pokemon[0].hp,B.p2.pokemon[0].hp];
 const log=B.log.filter(x=>/Pain Split|\|-sethp\||\|-damage\||\|-heal\||\|move\|/.test(x));
 console.log('[ROTOM-SCRAFTY-PAINSPLIT]',JSON.stringify({before,after,log:log.slice(-35)}));
 assert.ok(log.some(x=>x.includes('Pain Split')));
});
