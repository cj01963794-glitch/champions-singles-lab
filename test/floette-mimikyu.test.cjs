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
  const timing=r.decisionDetails[0]?.megaTimingAudit;
  assert.ok(timing,'opening should evaluate both optional Mega timings');
  const options=fl===0?timing.leftActions:timing.rightActions;
  assert.ok(options.includes('move 1'), 'the base-form Moonblast that breaks Disguise must be evaluated');
  assert.ok(options.includes('move 1 mega'),'the Mega Moonblast must also be evaluated');
  assert.equal(r.choices[1]?.[fl],'move 1',
   'when Disguise is broken and lethal physical attacks threaten, avoid a second-turn Calm Mind');
  console.log('[FLOETTE-MIMIKYU-LIVE-OPEN]',JSON.stringify({fl,choices:r.choices,win:r.winner,stop:r.stopReason,first:r.decisionDetails[0]&&{
   left:r.decisionDetails[0].left,right:r.decisionDetails[0].right,
   samples:r.decisionDetails[0].megaTimingAudit?.samples,
   leftActions:r.decisionDetails[0].megaTimingAudit?.leftActions,
   rightActions:r.decisionDetails[0].megaTimingAudit?.rightActions,
   payoff:r.decisionDetails[0].megaTimingAudit?.payoff
  },turns:r.decisionDetails.map(d=>({l:d.left,r:d.right,depth:d.depth,exposedSetupAudit:d.exposedSetupAudit}))}));
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

test('generic continuation rejects unsafe special setup after physical Swords Dance',()=>{
 const {continuationMove}=require('../server.cjs');
 for(const open of ['move 1','move 1 mega']){
  const B=battle(F,M,'1579,3137,6027,8191');
  B.makeChoices(open,'move 3');
  assert.ok(!B.ended);
  assert.equal(continuationMove(B,'p1'),'move 1',
   'opponent +2 physical attack can KO even when the setter still has full HP');
 }
});
test('multiple RNG seeds do not repeat exposed second-turn Calm Mind',()=>{
 const old=process.env.MEGA_TIMING_MAX_SAMPLES;
 process.env.MEGA_TIMING_MAX_SAMPLES='5';
 try{
  const seeds=['1579,3137,6027,8191','111,222,333,444','913,2451,7251,8832'];
  for(const seed of seeds)for(const [a,b,fl,op] of [[F,M,0,1],[M,F,1,0]]){
   const r=simulation(a,b,3,seed);
   const first=r.choices[0],second=r.choices[1];
   console.log('[FLOETTE-MANY-SEED]',JSON.stringify({seed,fl,first,second,
    audit:r.decisionDetails[1]?.exposedSetupAudit,stop:r.stopReason}));
   if(second&&first?.[op]==='move 2'&&first?.[fl]?.startsWith('move 1'))
    assert.notEqual(second[fl],'move 4',
     'do not select unsafe special setup when the opponent opened with Play Rough');
  }
 }finally{
  if(old===undefined)delete process.env.MEGA_TIMING_MAX_SAMPLES;
  else process.env.MEGA_TIMING_MAX_SAMPLES=old;
 }
});

test('uncapped production-style Mega timing still avoids unsafe follow-up setup',()=>{
 const previous=process.env.MEGA_TIMING_MAX_SAMPLES;
 delete process.env.MEGA_TIMING_MAX_SAMPLES;
 try{
  const r=simulation(F,M,3,'1579,3137,6027,8191');
  const first=r.choices[0],second=r.choices[1];
  console.log('[FLOETTE-PRODUCTION-BUDGET]',JSON.stringify({
   first,second,rounds:r.decisionDetails[0]?.megaTimingAudit?.samples,
   applied:r.decisionDetails[1]?.exposedSetupAudit,stop:r.stopReason
  }));
  assert.ok(first,'must finish the opener without timing out');
  if(second&&first[1]==='move 2'&&first[0]?.startsWith('move 1'))
   assert.notEqual(second[0],'move 4',
    'production search budget must not lose the physical-risk correction');
 }finally{
  if(previous!==undefined)process.env.MEGA_TIMING_MAX_SAMPLES=previous;
 }
});

test('diagnostic: varied full-budget seeds reveal why second-turn choices diverge',()=>{
 const prev=process.env.MEGA_TIMING_MAX_SAMPLES;
 delete process.env.MEGA_TIMING_MAX_SAMPLES;
 try{
  for(const seed of ['111,333,555,777','772,3311,1199,31887','12345,22334,33445,44556','54321,2345,9876,4567']){
   const result=simulation(F,M,3,seed),second=result.decisionDetails[1];
   console.log('[FLOETTE-VARIANT]',JSON.stringify({seed,choices:result.choices,
    first:result.decisionDetails[0]?{samples:result.decisionDetails[0].megaTimingAudit?.samples,
      left:result.decisionDetails[0].left,right:result.decisionDetails[0].right}:null,
    second:second?{left:second.left,right:second.right,depth:second.depth,
      audit:second.exposedSetupAudit,sustainRoute:second.sustainRoute,
      exact:!!second.exactSearch?.certified,tactical:second.tacticalProbability?.applied,
      counterfactual:second.counterfactual}:null,
    stop:result.stopReason}));
  }
 }finally{if(prev===undefined)delete process.env.MEGA_TIMING_MAX_SAMPLES;else process.env.MEGA_TIMING_MAX_SAMPLES=prev}
});

test('randomized production openings reject unsafe second-turn special setup',()=>{
 const original=process.env.MEGA_TIMING_MAX_SAMPLES;
 delete process.env.MEGA_TIMING_MAX_SAMPLES;
 let playRough=0,calm=0,disagreements=[];
 try{
  for(let k=0;k<20;k++){
   const seed=[307+k*1249,2399+k*377,1987+k*709,531+k*1973]
    .map(n=>n%65536).join(',');
   const r=simulation(F,M,3,seed);
   const first=r.choices[0],second=r.choices[1];
   if(first?.[0]?.startsWith('move 1')&&first[1]==='move 2'&&second){
    playRough++;
    if(second[0]==='move 4'){
     calm++;
     const B=battle(F,M,seed);
     B.makeChoices(first[0],first[1]);
     const us=B.p1.pokemon[0],them=B.p2.pokemon[0];
     disagreements.push({seed,first,second,
      hp:[us.hp,us.maxhp,them.hp,them.maxhp],
      boosts:[us.boosts,them.boosts],
      attacks:legal(B,'p2').filter(x=>x==='move 1'||x==='move 2'),
      continuation:continuationMove(B,'p1'),
      log:B.log.slice(-16),
      audit:r.decisionDetails[1]?.exposedSetupAudit,
      depth:r.decisionDetails[1]?.depth});
    }
   }
  }
  console.log('[FLOETTE-20-PRODUCTION-SEEDS]',JSON.stringify({playRough,calm,disagreements}));
  assert.equal(calm,0,'attacking a physical 2HKO threat must not regress to Calm Mind');
 }finally{
  if(original===undefined)delete process.env.MEGA_TIMING_MAX_SAMPLES;
  else process.env.MEGA_TIMING_MAX_SAMPLES=original;
 }
});
