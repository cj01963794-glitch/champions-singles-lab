'use strict';
const {test}=require('node:test');
const {battle,legal}=require('../server.cjs');
const F={species:'Floette-Mega',nature:'Timid',item:'Floettite',ability:'Fairy Aura',preMegaAbility:'Flower Veil',moves:['Moonblast','Synthesis','Draining Kiss','Calm Mind'],evs:{hp:22,def:11,spa:1,spe:32}};
const M={species:'Mimikyu',nature:'Adamant',item:'Scope Lens',ability:'Disguise',moves:['Shadow Claw','Play Rough','Swords Dance','Shadow Sneak'],evs:{hp:32,atk:32,spe:2}};
test('paired actual showdown outcomes for setup vs attacks',()=>{
 const plans=[['mega-attack','move 1 mega','move 1'],['mega-setup','move 1 mega','move 4'],['base-mega-attack','move 1','move 1 mega'],['base-mega-setup','move 1','move 4 mega'],['base-base-attack','move 1','move 1']];
 const n=600;
 for(const other of ['move 2','move 1','move 3']){
  const rows=plans.map(([name])=>({name,wins:0,losses:0,ties:0,turn2loss:0}));
  for(let i=0;i<n;i++){
   const seed=[101+173*i,277+241*i,503+347*i,719+401*i].map(v=>v%65536).join(',');
   for(let j=0;j<plans.length;j++){
    const [,a,b]=plans[j],B=battle(F,M,seed);
    B.makeChoices(a,other);
    if(!B.ended)B.makeChoices(b,'move 2');
    if(B.ended&&B.winner==='Right')rows[j].turn2loss++;
    for(let t=2;t<6&&!B.ended;t++){
     const next=legal(B,'p1').includes('move 1 mega')?'move 1 mega':'move 1';
     B.makeChoices(next,'move 2');
    }
    rows[j][B.winner==='Left'?'wins':B.winner==='Right'?'losses':'ties']++;
   }
  }
  console.log('[FLOETTE-PLAN-RATES]',JSON.stringify({foeFirst:other,n,rows}));
 }
});