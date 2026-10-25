'use strict';
const {simulation,battle,legal,estimatedDirectDamage}=require('../server.cjs');
const seed='1579,3137,6027,8191';
const dragonite={
 species:'Dragonite-Mega',name:'조심CS메망나',nature:'Modest',item:'Dragoninite',
 ability:'Multiscale',preMegaAbility:'Multiscale',
 evs:{hp:2,atk:0,def:0,spa:32,spd:0,spe:32},
 moves:['Draco Meteor','Thunderbolt','Flamethrower','Extreme Speed']
};
const mimikyu={
 species:'Mimikyu',name:'초점HA따라큐',nature:'Adamant',item:'Scope Lens',
 ability:'Disguise',evs:{hp:32,atk:32,def:0,spa:0,spd:0,spe:2},
 moves:['Shadow Claw','Play Rough','Swords Dance','Shadow Sneak']
};
async function diagnostic(a,b,label,live){
 try{
  const target=live?await (async()=>{
   const resp=await fetch('https://champions-singles-lab.onrender.com/api/duel',{
    method:'POST',headers:{'content-type':'application/json'},
    body:JSON.stringify({a,b,maxTurns:4,rngSeed:seed}),signal:AbortSignal.timeout(80000)});
   const content=await resp.text();
   if(!resp.ok)throw Error(resp.status+' '+content.slice(0,200));
   return JSON.parse(content);
  })():simulation(a,b,4,seed);
  const audit=target.decisionDetails?.[0]?.megaTimingAudit;
  console.log('[MIMIKYU-DIAG]',label,live?'live':'local',JSON.stringify({
   turns:target.turns,choices:target.choices,winner:target.winner,stop:target.stopReason,
   auditApplied:audit?.applied,samples:audit?.samples,
   first:target.decisionDetails?.[0]?.left,right:target.decisionDetails?.[0]?.right,
   choicesLeft:audit?.leftActions,choicesRight:audit?.rightActions,
   candidates:audit?.candidates,
   trace:(target.log||[]).filter(x=>/\\|move\\||\\|-immune\\||\\|-activate\\||\\|turn\\||\\|-damage\\|/.test(x)).slice(0,26)
  }));
 }catch(err){console.error('[MIMIKYU-DIAG-ERROR]',label,live?'live':'local',err.stack||err)}
}
(async()=>{
 const b=battle(dragonite,mimikyu);
 console.log('[MIMIKYU-ROOT]',JSON.stringify({
  types:[b.p1.pokemon[0].getTypes(),b.p2.pokemon[0].getTypes()],
  actions:legal(b,'p1'),estimated:legal(b,'p1').map(a=>[a,estimatedDirectDamage(b,'p1',a)])
 }));
 for(const [name,a,c] of [['dragonite-left',dragonite,mimikyu],['dragonite-right',mimikyu,dragonite]]){
  await diagnostic(a,c,name,false);
  await diagnostic(a,c,name,true);
 }
})();
