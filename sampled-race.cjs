'use strict';

// Fallback for mechanics outside the bounded exact model. Evaluate every
// simultaneous opening pair, never one convenient fixed opponent action.
// Continuations remain heuristic, so none of these values certify optimality.
function sampledRace(B,planned,turn,deadline,{Sim,legal,seed,followup,resolveMatrix,
 maxSamples=128,minSamples=32}={}){
 const L=legal(B,'p1'),R=legal(B,'p2');
 if(!L.length||!R.length)return null;
 const saved=JSON.stringify(B.toJSON());
 const cells=L.map(()=>R.map(()=>({wins:0,losses:0,draws:0,unresolved:0})));
 let n=0;
 for(;n<maxSamples;n++){
  if(Date.now()>deadline)break;
  const round=[];
  for(let i=0;i<L.length;i++)for(let j=0;j<R.length;j++){
   if(Date.now()>deadline)break;
   const branch=Sim.Battle.fromJSON(saved);
   branch.resetRNG(seed(turn,n,101));
   branch.makeChoices(L[i],R[j]);
   for(let step=1;step<5&&!branch.ended;step++){
    if(Date.now()>deadline)break;
    const left=followup(branch,'p1',turn+step),right=followup(branch,'p2',turn+step);
    if(!left||!right)break;
    branch.makeChoices(left,right);
   }
   if(Date.now()>deadline)break;
   round.push({i,j,outcome:!branch.ended?'unresolved':branch.winner==='Left'?'wins':
    branch.winner==='Right'?'losses':'draws'});
  }
  // All pairs must receive exactly the same number of complete paired rounds.
  if(round.length!==L.length*R.length)break;
  for(const {i,j,outcome} of round){
   const cell=cells[i][j];cell[outcome]++;
  }
 }
 if(!n)return null;
 const values=cells.map(row=>row.map(c=>(c.wins+c.draws/2)/n));
 const selected=resolveMatrix(values,L,R);
 const i=L.indexOf(selected.left),j=R.indexOf(selected.right);
 const enough=n>=minSamples;
 const pct=x=>Math.round(x*1000)/10;
 return {method:'sampled-joint-opening-game',samples:n,ambiguous:true,
  left:enough?selected.left:null,right:enough?selected.right:null,
  sampleBudgetComplete:n===maxSamples,continuation:'heuristic',
  leftActions:L,rightActions:R,
  payoff:cells.map((row,i)=>row.map((c,j)=>({winPct:pct(c.wins/n),lossPct:pct(c.losses/n),
   drawPct:pct(c.draws/n),unresolvedPct:pct(c.unresolved/n),n,
   winLowerPct:pct(c.wins/n),winUpperPct:pct((c.wins+c.unresolved)/n)}))),
  // Kept for older clients; the full payoff matrix is authoritative.
  side:'p1',chosen:enough?selected.left:null,comparedAgainst:enough?selected.right:null,
  candidates:L.map((action,k)=>{const column=values[k].indexOf(Math.min(...values[k]));
   const cell=cells[k][column];return {action,winPct:pct(cell.wins/n),
    lossPct:pct(cell.losses/n),unresolvedPct:pct(cell.unresolved/n),n,
    comparedAgainst:R[column]}}),
  pureSaddle:Math.abs(values[i][j]-Math.min(...values[i]))<1e-10&&
   Math.abs(values[i][j]-Math.max(...values.map(row=>row[j])))<1e-10};
}

module.exports={sampledRace};
