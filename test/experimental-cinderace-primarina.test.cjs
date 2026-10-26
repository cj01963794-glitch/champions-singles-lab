'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const core=require('../server.cjs'),exp=require('../engines/experimental.cjs');
const prima={species:'Primarina',name:'기존 H32 C32 누리레느',nature:'Modest',item:'Sitrus Berry',ability:'Torrent',
 moves:['Moonblast','Sparkling Aria','Aqua Jet','Encore'],evs:{hp:32,spa:32,spe:2}};
const cinder={species:'Cinderace',name:'광각렌즈 리베로 에이스번',nature:'Jolly',item:'Wide Lens',ability:'Libero',
 moves:['Gunk Shot','U-turn','Pyro Ball','High Jump Kick'],evs:{hp:2,atk:32,spe:32}};
const baseSeed='1579,3137,6027,8191';
const deps={battle:core.battle,legal:core.legal,strategicLegal:core.strategicLegal,avoidImmuneChoice:core.avoidImmuneChoice,
 estimatedDirectDamage:core.estimatedDirectDamage,Sim:core.Sim};
test('diagnose historical Wide Lens Libero Cinderace and Primarina setup in new engine',()=>{
 const B=core.battle(prima,cinder,baseSeed);
 const E=exp.simulateExperimental(prima,cinder,3,baseSeed,deps);
 console.log('[PRIMA-CINDER-EXPERIMENT]',JSON.stringify({choices:E.choices,winner:E.winner,details:E.decisionDetails.map(x=>x.experimental),types:[B.p1.pokemon[0].getTypes(),B.p2.pokemon[0].getTypes()]}));
 assert.equal(E.model,'experimental');
});
test('statistically characterize missing Gunk Shot and Sparkling Aria crit then Aqua Jet',()=>{
 const M=1200;
 const rng=i=>[173+i*181,719+i*271,1547+i*337,1103+i*151].map(x=>x%65536).join(',');
 const rows=[];
 for(const [label,first] of [['aria','move 2'],['moonblast','move 1'],['aqua','move 3']]){
  const out={label,n:0,miss:0,crit:0,missAndCrit:0,win:0,winOnMiss:0,missCriticalWin:0,surviveAfterMiss:0,
   libPoison:0,sampleMiss:null,sampleMissCrit:null};
  for(let i=0;i<M;i++){
   const B=core.battle(prima,cinder,rng(i)),C=B.p2.pokemon[0],P=B.p1.pokemon[0];
   B.makeChoices(first,'move 1');
   const logs=B.log;
   const miss=logs.some(x=>x.startsWith('|-miss|')&&x.includes('에이스번'));
   const crit=logs.some(x=>x.startsWith('|-crit|')&&x.includes('에이스번'));
   out.miss+=Number(miss);out.crit+=Number(crit);out.missAndCrit+=Number(miss&&crit);
   out.surviveAfterMiss+=Number(miss&&P.hp>0);
   out.libPoison+=Number(C.getTypes().includes('Poison'));
   const initial={P:P.hp,C:C.hp,pMax:P.maxhp,cMax:C.maxhp,status:C.status,types:C.getTypes(),seed:rng(i)};
   if(!B.ended&&core.legal(B,'p1').includes('move 3')&&core.legal(B,'p2').includes('move 1')){
    B.makeChoices('move 3','move 1');
   }
   const win=B.winner==='Left';out.win+=Number(win);out.winOnMiss+=Number(win&&miss);
   out.missCriticalWin+=Number(win&&miss&&crit);
   if(miss&&!out.sampleMiss)out.sampleMiss={...initial,winner:B.winner,end:[P.hp,C.hp],log:B.log.slice(-15)};
   if(miss&&crit&&!out.sampleMissCrit)out.sampleMissCrit={...initial,winner:B.winner,end:[P.hp,C.hp],log:B.log.slice(-17)};
   out.n++;
  }
  rows.push(out);
 }
 console.log('[PRIMA-CINDER-GUNK-MISS-CRIT]',JSON.stringify(rows));
 assert.equal(rows.length,3);
});


test('compare formerly recorded bulk-invested H32 B20 C14 Primarina winning path',()=>{
 const bulky={...prima,name:'H32 B20 C14 누리레느',
  evs:{hp:32,atk:0,def:20,spa:14,spd:0,spe:0}};
 const sampleCount=2400;
 const results=[];
 for(const [label,first] of [['aria','move 2'],['moonblast','move 1'],['aqua','move 3']]){
  let wins=0,misses=0,crit=0,winAriaCritDirect=0,afterFirstVictories=0,needsJetWin=0;
  let sample=null,sampleWin=null;
  for(let i=0;i<sampleCount;i++){
   const seed=[401+131*i,893+233*i,1559+311*i,2207+467*i].map(n=>n%65536).join(',');
   const B=core.battle(bulky,cinder,seed);
   B.makeChoices(first,'move 1');
   const miss=B.log.some(s=>s.startsWith('|-miss|')&&s.includes('에이스번'));
   const critical=B.log.some(s=>s.startsWith('|-crit|')&&s.includes('에이스번'));
   misses+=Number(miss);
   crit+=Number(miss&&critical);
   if(B.winner==='Left'){afterFirstVictories++;if(miss&&critical)winAriaCritDirect++}
   const beforeSecond={hp:[B.p1.pokemon[0].hp,B.p2.pokemon[0].hp],
    foeType:B.p2.pokemon[0].getTypes()};
   if(!B.ended&&core.legal(B,'p1').includes('move 3')&&core.legal(B,'p2').includes('move 1'))B.makeChoices('move 3','move 1');
   const win=B.winner==='Left';
   wins+=Number(win);
   if(win&&miss&&critical)needsJetWin++;
   if(miss&&critical&&!sample)sample={seed,beforeSecond,winner:B.winner,after:[B.p1.pokemon[0].hp,B.p2.pokemon[0].hp]};
   if(win&&miss&&critical&&!sampleWin)sampleWin={seed,beforeSecond,winner:B.winner,log:B.log.slice(-11)};
  }
  results.push({label,n:sampleCount,misses,missCrit:crit,wins,afterFirstVictories,
   winsWithMissCrit:needsJetWin,sample,sampleWin});
 }
 console.log('[PRIMA-CINDER-BULKY-CRIT-ROUTE]',JSON.stringify(results));
 assert.equal(results.length,3);
});
test('trace accuracy/critical RNG hooks on actual Libero Gunk Shot -> Aria',()=>{
 for(const first of ['move 2','move 1','move 4']){
  const B=core.battle(prima,cinder,baseSeed),rolls=[];
  const original=B.randomChance.bind(B);
  B.randomChance=(numerator,denominator)=>{
   const result=original(numerator,denominator);
   rolls.push([numerator,denominator,result]);
   return result;
  };
  B.makeChoices(first,'move 1');
  console.log('[CINDER-RNG-HOOKS]',JSON.stringify({first,rolls,hp:[B.p1.pokemon[0].hp,B.p2.pokemon[0].hp],
   log:B.log.filter(x=>/\\|move\\||\\|-miss\\||\\|-crit\\||\\|-damage\\|/.test(x)).slice(-12)}));
 }
});

test('experimental opponent misses + Aria crit win route outranks zero-win Encore, both orientations',()=>{
 const bulky={...prima,name:'H32 B20 C14 누리레느',
  evs:{hp:32,atk:0,def:20,spa:14,spd:0,spe:0}};
 const sash={...cinder,name:'기합의띠 리베로 에이스번',item:'Focus Sash',
  moves:['Gunk Shot','Pyro Ball','High Jump Kick','Sucker Punch']};
 for(const [name,left,right,side] of [
  ['wide C32',prima,cinder,0],
  ['wide bulky',bulky,cinder,0],
  ['wide bulky reversed',cinder,bulky,1],
  ['sash bulky',bulky,sash,0]
 ]){
  const result=exp.simulateExperimental(left,right,1,baseSeed,deps);
  console.log('[CINDER-RARE-WIN-CHECK]',JSON.stringify({name,choices:result.choices,
   audit:result.decisionDetails[0]?.experimental?.rareWinAudits,
   strategies:[result.decisionDetails[0]?.experimental?.policyLeft,
    result.decisionDetails[0]?.experimental?.policyRight]}));
  assert.equal(result.choices[0]?.[side],'move 2',
   name+': choose the only measured rare-winning Sparkling Aria line');
  assert.ok(result.decisionDetails[0]?.experimental?.rareWinAudits?.some(a=>
   a.side===(side===0?'p1':'p2')&&a.action==='move 2'&&a.lowerBound>0),
   name+': must demonstrate a strictly positive numeric probability');
 }
});
