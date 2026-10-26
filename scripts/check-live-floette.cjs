'use strict';
const assert=require('node:assert/strict');
const F={
 name:'HS명상메플라',species:'Floette-Mega',nature:'Timid',item:'Floettite',
 ability:'Fairy Aura',preMegaAbility:'Flower Veil',
 moves:['Moonblast','Synthesis','Draining Kiss','Calm Mind'],
 evs:{hp:22,atk:0,def:11,spa:1,spd:0,spe:32}
};
const C={
 name:'HB와자몽',species:'Charizard-Mega-Y',nature:'Bold',item:'Charizardite Y',
 ability:'Drought',preMegaAbility:'Blaze',
 moves:['Flamethrower','Solar Beam','Dragon Pulse','Roost'],
 evs:{hp:32,atk:0,def:32,spa:2,spd:0,spe:0}
};
async function duel(a,b){
 let reason;
 for(let attempt=0;attempt<3;attempt++){
  try{
   const r=await fetch('https://champions-singles-lab.onrender.com/api/duel',{
    method:'POST',
    headers:{'content-type':'application/json','cache-control':'no-cache'},
    body:JSON.stringify({a,b,maxTurns:13,rngSeed:'1579,3137,6027,8191'}),
    signal:AbortSignal.timeout(85000)});
   const content=await r.text();
   if(r.status!==200)throw Error('HTTP '+r.status+' '+content.slice(0,120));
   return JSON.parse(content);
  }catch(e){
   reason=e;console.log('[FLOETTE-RETRY]',attempt+1,String(e.message||e));
  }
 }
 throw reason;
}
(async()=>{
 for(const [label,a,b,side] of [['floette-left',F,C,0],['floette-right',C,F,1]]){
  const r=await duel(a,b);
  const f=r.choices.map(x=>x[side]),z=r.choices.map(x=>x[1-side]);
  const audit=r.decisionDetails?.[0]?.megaTimingAudit;
  console.log('[FLOETTE-LIVE]',JSON.stringify({label,first:f[0],otherFirst:z[0],
   winner:r.winner,stop:r.stopReason,turns:r.turns,allFloette:f,
   samples:audit?.samples,openingDepth:r.decisionDetails?.[0]?.depth,
   sustainTieBreak:audit?.sustainTieBreak,plan:r.decisionDetails?.[0]?.sustainRoute,
   firstSix:r.decisionDetails?.slice(0,6).map(x=>({t:x.turn,left:x.left,right:x.right,sustain:x.sustainRoute}))}));
  assert.equal(f[0],'move 4 mega',label+' should start Mega Calm Mind');
  assert.ok(f.slice(1).includes('move 4'),label+' should boost more than once');
  assert.ok(f.slice(1).includes('move 2'),label+' should use Synthesis');
  assert.equal(r.winner,side===0?'Left':'Right',
   label+' should win the demonstrated sustain endgame, not stall indefinitely');
  console.log('[FLOETTE-LIVE-VERIFIED]',label,'Mega Calm Mind + Synthesis wins');
 }
})().catch(e=>{console.error('[FLOETTE-LIVE-FAILED]',e.stack||e);process.exitCode=1});
