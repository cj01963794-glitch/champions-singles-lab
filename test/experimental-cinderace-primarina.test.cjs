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
