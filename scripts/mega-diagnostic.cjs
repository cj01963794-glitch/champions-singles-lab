'use strict';
const {simulation}=require('../server.cjs');
const seed='1579,3137,6027,8191';
const verifyLive=process.argv.includes('--verify-live');
const sceptile={species:'Sceptile-Mega',nature:'Jolly',item:'Sceptilite',ability:'Lightning Rod',
 preMegaAbility:'Overgrow',evs:{atk:32,spe:32,hp:2},moves:['Swords Dance','Leaf Blade','Earthquake','Rock Slide']};
const primarina={species:'Primarina',nature:'Bold',ability:'Torrent',item:'Sitrus Berry',
 evs:{hp:32,def:32,spe:2},moves:['Moonblast','Aqua Jet','Sparkling Aria','Encore']};
const cases=[
 ['jolly-sceptile-left',sceptile,primarina],
 ['jolly-sceptile-right',primarina,sceptile],
 ['adamant-sceptile-left',{...sceptile,nature:'Adamant'},primarina],
 ['adamant-sceptile-right',primarina,{...sceptile,nature:'Adamant'}],
 ['alternate-prim-move-order',sceptile,{...primarina,moves:['Moonblast','Sparkling Aria','Encore','Aqua Jet']}]
];
const summarize=r=>{
 const d=r.decisionDetails?.[0]||{};
 return {choices:r.choices?.slice(0,3),stopReason:r.stopReason,winner:r.winner,
  depth:d.depth,megaTimingConsidered:d.megaTimingConsidered,
  rolloutApplied:d.megaTimingAudit?.applied,samples:d.megaTimingAudit?.samples,
  left:d.left,right:d.right,
  roots:d.megaTimingAudit?.candidates?.map(c=>[c.action,c.winPct,c.comparedAgainst]),
  auditLeftActions:d.megaTimingAudit?.leftActions,auditRightActions:d.megaTimingAudit?.rightActions};
};
(async()=>{
 for(const [label,a,b] of verifyLive?[]:cases){
  try{
   const local=simulation(a,b,3,seed);
   console.log('[DIAG-LOCAL]',label,JSON.stringify(summarize(local)));
  }catch(e){console.log('[DIAG-LOCAL-ERROR]',label,String(e.stack||e))}
 }
 for(const [label,a,b] of cases.slice(0,verifyLive?2:4)){
  try{
   const ctl=new AbortController();const t=setTimeout(()=>ctl.abort(),55000);
   const res=await fetch('https://champions-singles-lab.onrender.com/api/duel',{
    method:'POST',headers:{'content-type':'application/json','cache-control':'no-cache'},
    body:JSON.stringify({a,b,maxTurns:3,rngSeed:seed}),signal:ctl.signal});
   clearTimeout(t);
   const data=await res.json();
   console.log('[DIAG-LIVE]',label,res.status,JSON.stringify(summarize(data)));
   if(verifyLive){
    const scChoice=label.endsWith('-right')?data.choices?.[0]?.[1]:data.choices?.[0]?.[0];
    const d=data.decisionDetails?.[0];
    if(res.status!==200||scChoice!=='move 2'||d?.megaTimingAudit?.applied!==true){
     process.exitCode=1;
     console.error('[LIVE-VERIFICATION-FAIL]',label,'chosen=',scChoice,
      'applied=',d?.megaTimingAudit?.applied,'samples=',d?.megaTimingAudit?.samples);
    }else console.log('[LIVE-VERIFICATION-PASS]',label,'base-form Leaf Blade',d?.megaTimingAudit?.samples,'paired samples');
   }
  }catch(e){process.exitCode=1;console.log('[DIAG-LIVE-ERROR]',label,String(e.stack||e))}
 }
})();
