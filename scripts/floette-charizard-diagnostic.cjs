'use strict';
const {battle,simulation,legal,estimatedDirectDamage,continuationMove}=require('../server.cjs');
const A={name:'HS명상메플라',species:'Floette-Mega',nature:'Timid',item:'Floettite',
 ability:'Fairy Aura',preMegaAbility:'Flower Veil',
 moves:['Moonblast','Synthesis','Draining Kiss','Calm Mind'],
 evs:{hp:22,atk:0,def:11,spa:1,spd:0,spe:32}};
const B={name:'HB와자몽',species:'Charizard-Mega-Y',nature:'Bold',item:'Charizardite Y',
 ability:'Drought',preMegaAbility:'Blaze',
 moves:['Flamethrower','Solar Beam','Dragon Pulse','Roost'],
 evs:{hp:32,atk:0,def:32,spa:2,spd:0,spe:0}};
const seed='1579,3137,6027,8191';
const who=(B,side)=>B.getSide(side).pokemon[0];
function state(B){
 return {turn:B.turn,weather:B.field.weather,
 p1:{form:who(B,'p1').species.name,hp:who(B,'p1').hp,boosts:who(B,'p1').boosts,ability:who(B,'p1').ability,item:who(B,'p1').item},
 p2:{form:who(B,'p2').species.name,hp:who(B,'p2').hp,boosts:who(B,'p2').boosts,ability:who(B,'p2').ability,item:who(B,'p2').item}};
}
function choices(B,p1,p2){B.makeChoices(p1,p2);}
function floette(B,side,first='calm'){
 const p=who(B,side);
 if(first==='moon')return 'move 1'+(p.canMegaEvo?' mega':'');
 if(p.hp/p.maxhp<0.66 && p.moveSlots[1].pp>0)return 'move 2'+(p.canMegaEvo?' mega':'');
 if(p.boosts.spa<6 && p.boosts.spd<6 && p.moveSlots[3].pp>0)return 'move 4'+(p.canMegaEvo?' mega':'');
 return 'move 1'+(p.canMegaEvo?' mega':'');
}
function zard(B,side,mode='roost'){
 const p=who(B,side);
 const mega=p.canMegaEvo?' mega':'';
 if(mode==='flame')return 'move 1'+mega;
 if(mode==='solar')return 'move 2'+mega;
 if(p.hp/p.maxhp<0.58 && p.moveSlots[3].pp>0)return 'move 4'+mega;
 return 'move 1'+mega;
}
function scripted(left=A,right=B,first='calm',mode='roost',n=28){
 const B=battle(left,right,seed);const history=[state(B)];
 for(let i=0;i<n&&!B.ended;i++){
  const l=left.species.includes('Floette')?floette(B,'p1',first):zard(B,'p1',mode);
  const r=right.species.includes('Floette')?floette(B,'p2',first):zard(B,'p2',mode);
  choices(B,l,r);
  history.push({choices:[l,r],...state(B)});
 }
 return {winner:B.winner,ended:B.ended,history:history.slice(0,22),logTail:B.log.slice(-14)};
}
for(const [name,a,b] of [['floette-left',A,B],['floette-right',B,A]]){
 const init=battle(a,b,seed);
 console.log('[SUSTAIN-ROOT]',name,JSON.stringify({opening:state(init),
  actions:{left:legal(init,'p1').map(x=>[x,estimatedDirectDamage(init,'p1',x)]),
   right:legal(init,'p2').map(x=>[x,estimatedDirectDamage(init,'p2',x)])}}));
 const calc=simulation(a,b,14,seed);
 console.log('[SUSTAIN-SIM]',name,JSON.stringify({first:calc.choices?.[0],next:calc.choices?.slice(1,10),stop:calc.stopReason,
  winner:calc.winner,details:calc.decisionDetails?.[0],
  log:calc.log.filter(x=>/^\|(move|cant|-fail|-damage|-boost|-heal|-weather)\|/.test(x)).slice(0,25)}).slice(0,18000));
 for(const mode of ['flame','solar','roost']){
 const res=scripted(a,b,'calm',mode,28);
 console.log('[SUSTAIN-SCRIPT]',name,mode,JSON.stringify(res).slice(0,16500));
 }
}
