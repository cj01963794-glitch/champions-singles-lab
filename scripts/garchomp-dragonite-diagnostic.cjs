'use strict';
const {battle,legal,simulation,estimatedDirectDamage,Sim}=require('../server.cjs');
const seed='1579,3137,6027,8191';
const d={species:'Dragonite-Mega',name:'조심CS메망나',nature:'Modest',item:'Dragoninite',
 ability:'Multiscale',preMegaAbility:'Multiscale',
 moves:['Draco Meteor','Thunderbolt','Flamethrower','Extreme Speed'],
 evs:{hp:2,atk:0,def:0,spa:32,spd:0,spe:32}};
const g={species:'Garchomp',name:'기띠고집한카',nature:'Adamant',item:'Focus Sash',ability:'Rough Skin',
 moves:['Earthquake','Scale Shot','Fire Fang','Swords Dance'],
 evs:{hp:2,atk:32,def:0,spa:0,spd:0,spe:32}};
const cases=[['dragonite-left',d,g],['dragonite-right',g,d]];
function snapshot(p){return {hp:p.hp,maxhp:p.maxhp,types:p.getTypes(),
 boost:p.boosts.spa,stats:p.storedStats,ability:p.ability,item:p.item}}
function root(a,b){
 const B=battle(a,b,seed);
 return {p1:snapshot(B.p1.pokemon[0]),p2:snapshot(B.p2.pokemon[0]),
 L:legal(B,'p1').map(x=>[x,estimatedDirectDamage(B,'p1',x)]),
 R:legal(B,'p2').map(x=>[x,estimatedDirectDamage(B,'p2',x)])};
}
function summarize(r,side){
 const au=r.decisionDetails?.[0]?.megaTimingAudit;
 const labels=side==='p1'?au?.leftActions:au?.rightActions;
 const matrix=au?.payoff;
 let actions;
 if(labels&&matrix)actions=labels.map((a,i)=>({
  a,worst:side==='p1'?Math.min(...matrix[i].map(x=>x.winPct)):
  Math.max(...matrix.map(row=>row[i].winPct)),
  against:side==='p1'?au.rightActions?.map((x,j)=>[x,matrix[i][j].winPct]):
  au.leftActions?.map((x,j)=>[x,matrix[j][i].winPct])
 }));
 return {first:r.choices?.[0],next:r.choices?.slice(1,3),winner:r.winner,stop:r.stopReason,
 audit:{applied:au?.applied,samples:au?.samples,selected:[au?.left,au?.right],
  actions},turn1:r.decisionDetails?.[0]};
}
async function live(a,b){
 const response=await fetch('https://champions-singles-lab.onrender.com/api/duel',{
  method:'POST',headers:{'content-type':'application/json','cache-control':'no-cache'},
  body:JSON.stringify({a,b,rngSeed:seed,maxTurns:4}),signal:AbortSignal.timeout(70000)});
 const text=await response.text();if(!response.ok)throw Error(response.status+' '+text.slice(0,180));
 return JSON.parse(text);
}
function scriptedOpener(dside,dAction,gAction,follow=2){
 const B=dside==='p1'?battle(d,g,seed):battle(g,d,seed);
 for(let t=0;t<follow&&!B.ended;t++){
  const left=dside==='p1'?(t===0?dAction:'move 1'):(t===0?gAction:'move 2');
  const right=dside==='p2'?(t===0?dAction:'move 1'):(t===0?gAction:'move 2');
  B.makeChoices(left,right);
 }
 return {d:snapshot(B.getSide(dside).pokemon[0]),g:snapshot(B.getSide(dside==='p1'?'p2':'p1').pokemon[0]),
 log:B.log.filter(x=>x.startsWith('|move|')||x.startsWith('|-damage|')||x.startsWith('|-immune|')||x.startsWith('|-boost|')||x.startsWith('|-unboost|')).slice(-16)};
}
(async()=>{
 for(const [label,a,b]of cases){
  const dside=label.endsWith('left')?'p1':'p2';
  console.log('[GARCHOMP-ROOT]',label,JSON.stringify(root(a,b)));
  const B=battle(a,b,seed);
  if(dside==='p1')for(const action of ['move 1','move 1 mega','move 3','move 3 mega']){
   console.log('[GARCHOMP-SCRIPT]',action,JSON.stringify(scriptedOpener(dside,action,'move 2',2)));
  }
  console.log('[GARCHOMP-LOCAL]',label,JSON.stringify(summarize(simulation(a,b,4,seed),dside)).slice(0,20000));
  for(let n=0;n<2;n++){
   try{console.log('[GARCHOMP-LIVE]',label,JSON.stringify(summarize(await live(a,b),dside)).slice(0,20000));break}
   catch(e){console.log('[GARCHOMP-LIVE-ERROR]',label,n,String(e));}
  }
 }
})();
