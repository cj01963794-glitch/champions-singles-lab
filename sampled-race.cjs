'use strict';

// Fallback for mechanics outside the bounded exact model. Evaluate every
// simultaneous opening pair, never one convenient fixed opponent action.
// Continuations remain heuristic, so none of these values certify optimality.
function sampledRace(B,planned,turn,deadline,{Sim,legal,seed,followup,resolveMatrix,
 maxSamples=128,minSamples=32,attackDamageTieBreak=false,preferMegaTie=null,preferSustainTie=null,followupTurns=5}={}){
 const L=legal(B,'p1'),R=legal(B,'p2');
 if(!L.length||!R.length)return null;
 const saved=JSON.stringify(B.toJSON());
 const cells=L.map(()=>R.map(()=>({wins:0,losses:0,draws:0,unresolved:0,
  firstDamageLeft:0,firstDamageRight:0})));
 let n=0;
 for(;n<maxSamples;n++){
  if(Date.now()>deadline)break;
  const round=[];
  for(let i=0;i<L.length;i++)for(let j=0;j<R.length;j++){
   if(Date.now()>deadline)break;
   const branch=Sim.Battle.fromJSON(saved);
   branch.resetRNG(seed(turn,n,101));
   const leftTarget=branch.getSide?.('p2')?.pokemon?.[0];
   const rightTarget=branch.getSide?.('p1')?.pokemon?.[0];
   const beforeLeft=leftTarget?.hp,beforeRight=rightTarget?.hp;
   const maxLeft=leftTarget?.maxhp||1,maxRight=rightTarget?.maxhp||1;
   branch.makeChoices(L[i],R[j]);
   const dealtLeft=beforeLeft==null?0:Math.max(0,beforeLeft-(leftTarget?.hp??beforeLeft))/maxLeft;
   const dealtRight=beforeRight==null?0:Math.max(0,beforeRight-(rightTarget?.hp??beforeRight))/maxRight;
   for(let step=1;step<followupTurns&&!branch.ended;step++){
    if(Date.now()>deadline)break;
    const left=followup(branch,'p1',turn+step),right=followup(branch,'p2',turn+step);
    if(!left||!right)break;
    branch.makeChoices(left,right);
   }
   if(Date.now()>deadline)break;
   round.push({i,j,dealtLeft,dealtRight,
    outcome:!branch.ended?'unresolved':branch.winner==='Left'?'wins':
    branch.winner==='Right'?'losses':'draws'});
  }
  // All pairs must receive exactly the same number of complete paired rounds.
  if(round.length!==L.length*R.length)break;
  for(const {i,j,outcome,dealtLeft,dealtRight} of round){
   const cell=cells[i][j];cell[outcome]++;
   cell.firstDamageLeft+=dealtLeft;
   cell.firstDamageRight+=dealtRight;
  }
 }
 if(!n)return null;
 const values=cells.map(row=>row.map(c=>(c.wins+c.draws/2)/n));
 const selected=resolveMatrix(values,L,R);
 const sustainTieBreak=[];
 if(preferSustainTie && n>=8 && followupTurns>=12){
  for(const [side,actions,field] of [['p1',L,'left'],['p2',R,'right']]){
   const value=i=>side==='p1'?Math.min(...values[i]):Math.max(...values.map(row=>row[i]));
   const best=side==='p1'?Math.max(...actions.map((_,i)=>value(i))):
    Math.min(...actions.map((_,i)=>value(i)));
   const candidates=actions.map((action,i)=>({action,value:value(i)}))
    .filter(x=>preferSustainTie(B,side,x.action))
    .filter(x=>side==='p1'?x.value>=best-1/n-1e-9:x.value<=best+1/n+1e-9)
    .filter(x=>(side==='p1'?x.value:1-x.value)>=0.60)
    .sort((a,b)=>side==='p1'?b.value-a.value:a.value-b.value);
   if(candidates.length){
    const c=candidates.find(x=>x.action.endsWith(' mega'))||candidates[0];
    if(c.action!==selected[field]){
     sustainTieBreak.push({side,from:selected[field],to:c.action});
     selected[field]=c.action;
    }
   }
  }
 }
 // Paired finite samples frequently see identical win/loss records for
 // base and Mega of the same move. When type, ability and all stats
 // relevant to this action weakly improve, an exact observed tie should
 // favor the Mega rather than whichever choice index came first.
 // This must NOT upgrade a type-changing or ability-changing Mega,
 // nor overturn a measured win-rate difference.
 const megaTieBreak=[];
 if(preferMegaTie){
  for(const [side,actions,field] of [['p1',L,'left'],['p2',R,'right']]){
   const selectedAction=selected[field];
   const alt=selectedAction+' mega';
   const i=actions.indexOf(selectedAction),j=actions.indexOf(alt);
   if(i<0||j<0||!preferMegaTie(B,side,selectedAction))continue;
   const value=index=>side==='p1'?Math.min(...values[index]):
    Math.max(...values.map(row=>row[index]));
   if(Math.abs(value(i)-value(j))<1e-10){
    selected[field]=alt;
    megaTieBreak.push({side,from:selectedAction,to:alt,reason:'same-payoff-safer-mega-stats'});
   }
  }
 }
 let closeDamageTieBreak=null;
 if(attackDamageTieBreak && n>=minSamples && B.getSide && B.dex?.moves){
  const isAttack=(side,choice)=>{
   const i=Number(String(choice).match(/move (\d+)/)?.[1]||0)-1;
   const slot=B.getSide(side)?.pokemon?.[0]?.moveSlots?.[i];
   const move=B.dex.moves.get(slot?.id);
   return !!move?.exists && move.category!=='Status';
  };
  // A gap of one or two observed outcomes in a finite paired sample is not
  // evidence of a real win-rate advantage. Compare direct damage ONLY between
  // attacking alternatives inside that unresolved near-tie, never vs setup.
  const rowMin=values.map(row=>Math.min(...row)),best=Math.max(...rowMin);
  const leading=L.indexOf(selected.left),j0=R.indexOf(selected.right);
  if(isAttack('p1',selected.left) && j0>=0){
   const candidates=L.map((a,k)=>({action:a,k,worst:rowMin[k],
    firstDamage:cells[k][j0].firstDamageLeft/n}))
    .filter(x=>isAttack('p1',x.action) && x.worst>=best-2/n-1e-10)
    .sort((a,b)=>b.firstDamage-a.firstDamage);
   if(candidates.length>1 && candidates[0].firstDamage>
       cells[leading][j0].firstDamageLeft/n+0.02 &&
       rowMin[leading]-candidates[0].worst<=2/n+1e-10){
    closeDamageTieBreak={side:'p1',from:selected.left,to:candidates[0].action,
     opponentAction:selected.right,sampleWinGapPct:Math.round(1000*
      (rowMin[leading]-candidates[0].worst))/10,
     firstDamageDifferencePct:Math.round(1000*
      (candidates[0].firstDamage-cells[leading][j0].firstDamageLeft/n))/10};
    selected.left=candidates[0].action;
    const newRow=values[L.indexOf(selected.left)];
    selected.right=R[newRow.indexOf(Math.min(...newRow))];
   }
  }
 }
 const i=L.indexOf(selected.left),j=R.indexOf(selected.right);
 const enough=n>=minSamples;
 const pct=x=>Math.round(x*1000)/10;
 return {method:'sampled-joint-opening-game',samples:n,ambiguous:true,
  left:enough?selected.left:null,right:enough?selected.right:null,
  megaTieBreak,sustainTieBreak,closeDamageTieBreak,
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
