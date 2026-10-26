'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {battle,strategicLegal,legal,simulation}=require('../server.cjs');

// Identical to the two entries in data/samples-export.json at the
// time this regression was reported.
const gyarados={name:'노자속기메갸라',species:'Gyarados-Mega',
 nature:'Adamant',item:'Gyaradosite',ability:'Mold Breaker',
 preMegaAbility:'Intimidate',
 moves:['Power Whip','Earthquake','Ice Fang','Dragon Dance'],
 evs:{hp:2,atk:32,def:0,spa:0,spd:0,spe:32}};
const primarina={name:'HBC자뭉누리',species:'Primarina',
 nature:'Modest',item:'Sitrus Berry',ability:'Torrent',
 moves:['Sparkling Aria','Moonblast','Encore','Aqua Jet'],
 evs:{hp:32,atk:0,def:20,spa:14,spd:0,spe:0}};

test('Moonblast strictly outclasses Sparkling Aria against both Gyarados forms at the opening',()=>{
 for(const [a,b,side] of [[gyarados,primarina,'p2'],[primarina,gyarados,'p1']]){
  const B=battle(a,b,'1579,3137,6027,8191');
  const raw=legal(B,side),usable=strategicLegal(B,side);
  assert.ok(raw.includes('move 1')&&raw.includes('move 2'));
  assert.ok(usable.includes('move 2'),'Moonblast must remain a candidate');
  assert.ok(!usable.includes('move 1'),'inferior Sparkling Aria must not win an all-loss tie');
 }
});
test('Gyarados Mega timing and an accurate Earthquake follow-up remain legal',()=>{
 const B=battle(gyarados,primarina,'1579,3137,6027,8191');
 const usable=strategicLegal(B,'p1');
 assert.ok(usable.includes('move 1'),'delayed Power Whip must be considered');
 assert.ok(usable.includes('move 1 mega'),'immediate Mega Power Whip must be considered');
 assert.ok(usable.includes('move 2'),'Earthquake must not be pruned by inaccurate Power Whip');
 assert.ok(usable.includes('move 2 mega'),'Mega Earthquake must remain eligible');
});
test('both slot orientations avoid an inferior opening Sparkling Aria',()=>{
 const saved=process.env.MEGA_TIMING_MAX_SAMPLES;
 process.env.MEGA_TIMING_MAX_SAMPLES='5';
 try{
  for(const [a,b,pSide,gSide] of [
   [gyarados,primarina,1,0],[primarina,gyarados,0,1]
  ]){
   const outcome=simulation(a,b,3,'1579,3137,6027,8191');
   assert.ok(outcome.choices.length);
   const first=outcome.choices[0];
   assert.equal(first[pSide],'move 2','Moonblast instead of resisted Sparkling Aria');
   assert.ok(['move 1','move 1 mega','move 2','move 2 mega','move 3','move 3 mega','move 4','move 4 mega'].includes(first[gSide]));
   console.log('[GYARADOS-PRIMARINA-OPENING]',JSON.stringify({
    megaSide:gSide,first,turns:outcome.turns,winner:outcome.winner,
    auditSamples:outcome.decisionDetails[0]?.megaTimingAudit?.samples
   }));
  }
 }finally{
  if(saved===undefined)delete process.env.MEGA_TIMING_MAX_SAMPLES;
  else process.env.MEGA_TIMING_MAX_SAMPLES=saved;
 }
});
