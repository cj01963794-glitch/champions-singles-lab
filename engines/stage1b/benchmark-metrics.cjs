'use strict';
// Wilson 95% score interval: battle-engine benchmark.py methodology,
// independently reimplemented in JS. Incomplete games remain CENSORED.
function wilsonInterval(wins,n,z=1.96){
  if(!Number.isInteger(n)||n<0||!Number.isInteger(wins)||wins<0||wins>n)
    throw Error('Invalid win count');
  if(n===0)return [0,1];
  const p=wins/n,z2=z*z,denom=1+z2/n;
  const center=(p+z2/(2*n))/denom;
  const margin=z/denom*Math.sqrt((p*(1-p)+z2/(4*n))/n);
  return [Math.max(0,center-margin),Math.min(1,center+margin)];
}
function tallyGames(rows,player){
  const out={player,games:0,wins:0,losses:0,draws:0,unresolved:0};
  for(const row of rows){
    if(!row.agents.includes(player))continue;
    out.games++;
    if(row.winner===player)out.wins++;
    else if(row.winner==='draw')out.draws++;
    else if(row.winner==='unresolved')out.unresolved++;
    else if(row.agents.includes(row.winner))out.losses++;
    else throw Error('Unknown game winner: '+row.winner);
  }
  const resolved=out.wins+out.losses+out.draws;
  return {...out,resolved,winRateResolved:resolved?out.wins/resolved:null,
    wilson95Resolved:wilsonInterval(out.wins,resolved),
    // Unresolved are NOT draws or losses. Report sharp counting bounds too.
    possibleWinRateRange:out.games?[out.wins/out.games,(out.wins+out.unresolved)/out.games]:[0,1]};
}
module.exports={wilsonInterval,tallyGames};
