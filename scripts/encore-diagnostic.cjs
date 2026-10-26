'use strict';
const {battle,legal,simulation,Sim}=require('../server.cjs');
const seed='1579,3137,6027,8191';
const verifyLive=process.argv.includes('--verify-live');
const e={name:'기띠에써르',species:'Indeedee',nature:'Modest',item:'Focus Sash',ability:'Psychic Surge',
 moves:['Expanding Force','Mystical Fire','Dazzling Gleam','Encore'],
 evs:{hp:2,atk:0,def:0,spa:32,spd:0,spe:32}};
const m={name:'초점HA따라큐',species:'Mimikyu',nature:'Adamant',item:'Scope Lens',ability:'Disguise',
 moves:['Shadow Claw','Play Rough','Swords Dance','Shadow Sneak'],
 evs:{hp:32,atk:32,def:0,spa:0,spd:0,spe:2}};
async function checkLive(){
 for(const [label,a,b,i] of [['indeedee-left',e,m,0],['indeedee-right',m,e,1]]){
  for(const rngSeed of [seed,'1117,3319,8893,20011']){
   let success=false;
   for(let attempt=0;attempt<3;attempt++){
    try{
     const response=await fetch('https://champions-singles-lab.onrender.com/api/duel',{
      method:'POST',headers:{'content-type':'application/json','cache-control':'no-cache'},
      body:JSON.stringify({a,b,maxTurns:3,rngSeed}),
      signal:AbortSignal.timeout(80000)});
     const text=await response.text();
     if(!response.ok)throw Error('HTTP '+response.status+' '+text.slice(0,120));
     const result=JSON.parse(text);
     const first=result.choices?.[0]?.[i];
     if(!first||first==='move 4')
      throw Error('Unproductive opening Encore on live site: '+
       JSON.stringify({label,first,choices:result.choices,reason:result.stopReason}));
     console.log('[ENCORE-LIVE-VERIFIED]',label,rngSeed,'first='+first,
      'planner='+result.decisionDetails?.[0]?.depth);
     success=true;break;
    }catch(err){
     console.error('[ENCORE-LIVE-RETRY]',label,attempt+1,String(err.message||err));
     if(attempt===2)throw err;
    }
   }
   if(!success)throw Error('Failed '+label);
  }
 }
}
if(verifyLive)checkLive().catch(e=>{console.error('[ENCORE-LIVE-FAILED]',e.stack||e);process.exitCode=1});
else for(const [name,a,b,i] of [['indeedee-left',e,m,0],['indeedee-right',m,e,1]]){
 const root=battle(a,b,seed),ii=i?'p2':'p1',oo=i?'p1':'p2';
 const us=root.getSide(ii).pokemon[0],foe=root.getSide(oo).pokemon[0];
 console.log('[ENCORE-ROOT]',name,JSON.stringify({us:{speed:us.getStat('spe'),last:us.lastMove?.id,ability:us.ability},
 foe:{speed:foe.getStat('spe'),last:foe.lastMove?.id,moves:foe.moveSlots.map(x=>x.id)},
 psychicTerrain:root.field.terrain,left:legal(root,'p1'),right:legal(root,'p2')}));
 for(let f=1;f<=4;f++){
  const b2=battle(a,b,seed);b2.makeChoices(...(i?['move '+f,'move 4']:['move 4','move '+f]));
  console.log('[ENCORE-PAIR]',name,f,JSON.stringify({
   log:b2.log.filter(x=>/^\|(move|cant|-fail|-activate|-start|-damage|-end|-fieldstart|-fieldend)\|/.test(x)).slice(-20),
   targetLast:b2.getSide(oo).pokemon[0].lastMove?.id,targetEncore:b2.getSide(oo).pokemon[0].volatiles.encore?.move,
   activeEncore:b2.getSide(oo).pokemon[0].volatiles.encore?.duration
  }));
 }
 const res=simulation(a,b,4,seed);
 console.log('[ENCORE-LOCAL]',name,JSON.stringify({
  choices:res.choices,winner:res.winner,stop:res.stopReason,
  decision:res.decisionDetails?.[0],log:res.log.filter(x=>/^\|(move|cant|-fail|-activate|-start|-damage)\|/.test(x)).slice(0,25)
 }).slice(0,22000));
}
