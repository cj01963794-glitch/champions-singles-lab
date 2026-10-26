'use strict';
// Conditional rare-win probability audit. No species- or move-name exceptions.
// Enumerate opponent MISS x own CRIT from Showdown's actual randomChance
// parameters and verify a finishing response against ALL legal enemy replies.
// This is a certified *existence/lower-bound* check for a specific opponent
// first action, NOT a complete match win-rate solver.
function index(action){return Number(String(action).match(/move (\d+)/)?.[1]||0)-1}
function ownMove(B,side,action){
 return B.dex.moves.get(B.getSide(side).pokemon[0].moveSlots[index(action)]?.id);
}
function adversarialFinish(trial,side,deps,deadline){
 if(trial.ended)return trial.winner===(side==='p1'?'Left':'Right');
 const opposite=side==='p1'?'p2':'p1';
 const me=deps.strategicLegal(trial,side),them=deps.legal(trial,opposite);
 if(!me.length||!them.length)return false;
 const saved=JSON.stringify(trial.toJSON());
 for(const mine of me){
  if(Date.now()>deadline)return false;
  let allWon=true;
  for(const theirs of them){
   if(Date.now()>deadline)return false;
   const B=deps.Sim.Battle.fromJSON(saved);
   try{
    B.makeChoices(side==='p1'?mine:theirs,side==='p2'?mine:theirs);
   }catch{return false}
   if(!B.ended||B.winner!==(side==='p1'?'Left':'Right')){
    allWon=false;break;
   }
  }
  if(allWon)return true;
 }
 return false;
}
function probeRareWin(B,side,myOptions,opponentAction,deps,deadline){
 const foeSide=side==='p1'?'p2':'p1',opp=ownMove(B,foeSide,opponentAction);
 if(!opp||opp.category==='Status'||!opp.basePower||opp.accuracy===true)return null;
 // Hook effective move accuracy after items, weather and ability changes.
 // This avoids hardcoding Wide Lens/accuracy modifiers and crit chances.
 const snapshot=JSON.stringify(B.toJSON()),out=[];
 for(const first of myOptions){
  if(Date.now()>deadline)break;
  const mine=ownMove(B,side,first);
  if(!mine||mine.category==='Status'||mine.basePower<=0)continue;
  let passing=0,possible=0,missChance=null,critChance=null,accuracy=1;
  for(let roll=0;roll<8;roll++){
   if(Date.now()>deadline)break;
   const trial=deps.Sim.Battle.fromJSON(snapshot);
   trial.resetRNG([(107+roll*359)%65536,(2003+roll*733)%65536,
     (3907+roll*1451)%65536,(6917+roll*2399)%65536]);
   const random=trial.randomChance.bind(trial);
   let intercepted=false,ownCritical=false,enemyMiss=false;
   trial.randomChance=(n,d)=>{
    // This branch is only admitted if the Showdown log subsequently
    // confirms the correct combatant missed. No accuracy guesses.
    if(!intercepted&&d===100&&n>0&&n<100){
     intercepted=true;missChance=1-n/d;
     return false;
    }
    if(intercepted&&d===24&&n>0){
     critChance=n/d;ownCritical=true;return true;
    }
    if(intercepted&&d===100&&n>0&&n<100)accuracy=Math.min(accuracy,n/d);
    return random(n,d);
   };
   try{
    trial.makeChoices(side==='p1'?first:opponentAction,side==='p2'?first:opponentAction);
   }catch{continue}
   const oppPrefix='|-miss|'+foeSide+'a:',ownTarget='|-crit|'+foeSide+'a:';
   enemyMiss=trial.log.some(x=>x.startsWith(oppPrefix));
   const ownCrit=trial.log.some(x=>x.startsWith(ownTarget));
   if(!enemyMiss||!ownCrit||!ownCritical||missChance===null||critChance===null)continue;
   possible++;
   if(adversarialFinish(trial,side,deps,deadline))passing++;
  }
  if(possible>0&&passing>0){
   // P(opponent misses) * P(own move crits) * P(own move connects).
   // Conditional damage/random secondary variations tested by Showdown.
   // Unmodeled events are explicitly not claimed as an exact win rate.
   out.push({action:first,conditionalWins:passing,branches:possible,
    lowerBound:missChance*critChance*accuracy*(passing/possible),
    scenario:'opponent-miss-own-critical-then-verified-finish'});
  }
 }
 return out.length?out.sort((a,b)=>b.lowerBound-a.lowerBound):null;
}
module.exports={probeRareWin};
