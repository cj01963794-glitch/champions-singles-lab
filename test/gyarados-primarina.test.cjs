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
  const p=B.getSide(side).pokemon[0],other=B.getSide(side==='p1'?'p2':'p1').pokemon[0];
  console.log('[GYARA-DIAG]',JSON.stringify({side,raw,usable,
   ownAbility:p.ability,foeAbility:other.ability,
   weather:B.field.weather,terrain:B.field.terrain,ownStatus:p.status,foeStatus:other.status,
   canMegaOpponent:B.actions.canMegaEvo(other),
   moves:p.moveSlots.map(s=>{
    const m=B.dex.moves.get(s.id);
    return {id:m.id,type:m.type,basePower:m.basePower,accuracy:m.accuracy,
     category:m.category,priority:m.priority,secondary:m.secondary,
     secondaries:m.secondaries,recoil:m.recoil,drain:m.drain,self:m.self,
     onBasePower:!!m.onBasePower,onModifyMove:!!m.onModifyMove,
     onEffectiveness:!!m.onEffectiveness,onTryHit:!!m.onTryHit,flags:m.flags};
   })}));
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
   assert.notEqual(first[pSide],'move 1','resisted Sparkling Aria must not be the opener');
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

test('diagnostic: branch on first Power Whip hit before evolving',()=>{
 // Both opening options face the identical 100%-accurate Moonblast policy.
 // Crucially, delayed evolution NEVER repeats an unevolved Power Whip:
 // HIT -> Mega Earthquake; MISS -> Mega Power Whip.
 const tally=()=>({wins:0,losses:0,draws:0,unresolved:0,
  firstHit:0,firstMiss:0,winAfterHit:0,winAfterMiss:0,
  initialSurvives:0,firstTurnResolved:0,turnTwo:{megaEarthquake:0,megaPowerWhip:0,other:0}});
 const out={immediate:tally(),adaptiveDelay:tally()};
 const N=2048;
 for(let k=0;k<N;k++){
  const seed=[101+139*k,319+251*k,503+173*k,907+107*k]
   .map(v=>v%65536).join(',');
  for(const mode of ['immediate','adaptiveDelay']){
   const B=battle(gyarados,primarina,seed),st=out[mode];
   B.makeChoices(mode==='immediate'?'move 1 mega':'move 1','move 2');
   const p=B.p2.pokemon[0],g=B.p1.pokemon[0];
   const hit=p.hp<p.maxhp;
   if(hit)st.firstHit++;else st.firstMiss++;
   if(g.hp>0)st.initialSurvives++;
   if(B.ended)st.firstTurnResolved++;
   for(let turn=1;turn<6&&!B.ended;turn++){
    const target=B.p2.pokemon[0];
    let gMove;
    if(mode==='adaptiveDelay'&&!g.species.isMega){
     gMove=turn===1&&hit?'move 2 mega':'move 1 mega';
     if(turn===1)st.turnTwo[hit?'megaEarthquake':'megaPowerWhip']++;
    }else{
     // Make the same accuracy-aware follow-up available to both arms:
     // Earthquake if its estimated minimum 40% damage finishes,
     // otherwise use Power Whip for a stronger hit.
     gMove=target.hp/target.maxhp<=0.40?'move 2':'move 1';
     if(turn===1)st.turnTwo.other++;
    }
    B.makeChoices(gMove,'move 2');
   }
   const outcome=B.ended?(B.winner==='Left'?'wins':B.winner==='Right'?'losses':'draws'):'unresolved';
   st[outcome]++;
   if(outcome==='wins')st[hit?'winAfterHit':'winAfterMiss']++;
  }
 }
 console.log('[GYARADOS-MEGA-BRANCHED-COMPARISON]',JSON.stringify({N,out}));
 assert.equal(out.adaptiveDelay.turnTwo.megaEarthquake+out.adaptiveDelay.turnTwo.megaPowerWhip,
  out.adaptiveDelay.initialSurvives-out.adaptiveDelay.firstTurnResolved,
  'all surviving nonterminal delayed cases evolve on turn 2');
});
