'use strict';

// A deliberately bounded exact solver. Damage distributions come from the
// pinned Showdown engine; only the small, checked state space below is modeled.
// Unsupported effects return null instead of silently losing a battle mechanic.
const PASSIVE_ABILITIES=new Set(['aerilate','pixilate','refrigerate','galvanize',
 'torrent','blaze','overgrow','swarm','intimidate','clearbody','hypercutter',
 'innerfocus','keeneye','runaway','steadfast','pressure','swiftswim','chlorophyll',
 'battlearmor','shellarmor','adaptability','hugepower','purepower','ironfist',
 'toughclaws','sniper','technician','tintedlens','filter','solidrock','thickfat',
 'levitate','scrappy','soundproof','bulletproof','punkrock','rockhead']);
const LOW_HP_ABILITIES=new Set(['torrent','blaze','overgrow','swarm']);

function linearSolve(rows,values){
 const a=rows.map((row,i)=>[...row,values[i]]),n=rows.length;
 for(let col=0;col<n;col++){
  let pivot=col;
  for(let i=col+1;i<n;i++)if(Math.abs(a[i][col])>Math.abs(a[pivot][col]))pivot=i;
  if(Math.abs(a[pivot][col])<1e-10)return null;
  [a[col],a[pivot]]=[a[pivot],a[col]];
  const v=a[col][col];for(let j=col;j<=n;j++)a[col][j]/=v;
  for(let i=0;i<n;i++)if(i!==col){const f=a[i][col];for(let j=col;j<=n;j++)a[i][j]-=f*a[col][j]}
 }
 return a.map(row=>row[n]);
}
function combinations(n,k,visit,start=0,chosen=[]){
 if(!k){visit(chosen);return}
 for(let i=start;i<=n-k;i++)combinations(n,k-1,visit,i+1,[...chosen,i]);
}
// Solve a small simultaneous zero-sum game, including mixed strategies.
// Pure maximin/minimax choices alone need not form an equilibrium.
function gameValue(matrix,wantStrategy=false){
 const m=matrix.length,n=matrix[0].length;
 const lower=Math.max(...matrix.map(row=>Math.min(...row)));
 const upper=Math.min(...matrix[0].map((_,j)=>Math.max(...matrix.map(row=>row[j]))));
 if(upper-lower<1e-10){
  const index=matrix.findIndex(row=>Math.min(...row)>=lower-1e-10);
  return wantStrategy?{value:(lower+upper)/2,probabilities:matrix.map((_,i)=>i===index?1:0)}:(lower+upper)/2;
 }
 let best=-Infinity,bestSolution;
 const constraints=[...Array(n)].map((_,j)=>[...matrix.map(row=>row[j]),-1]);
 for(let i=0;i<m;i++)constraints.push([...Array(m)].map((_,k)=>i===k?1:0).concat(0));
 combinations(n+m,m,indices=>{
  const solution=linearSolve([[...Array(m).fill(1),0],...indices.map(i=>constraints[i])],
   [1,...Array(m).fill(0)]);
  if(!solution||solution.slice(0,m).some(p=>p< -1e-8))return;
  if(constraints.some(row=>row.reduce((sum,c,i)=>sum+c*solution[i],0)< -1e-8))return;
  if(solution[m]>best){best=solution[m];bestSolution=solution.slice(0,m)}
 });
 if(!Number.isFinite(best))throw Error('Unable to solve probability payoff matrix');
 const value=Math.max(0,Math.min(1,best));
 return wantStrategy?{value,probabilities:bestSolution.map(p=>Math.max(0,p))}:value;
}

function harmlessSecondary(secondary,foeMoves){
 if(!secondary)return true;
 if(Object.keys(secondary).some(k=>!['chance','boosts'].includes(k)))return false;
 return Object.entries(secondary.boosts||{}).every(([stat,amount])=>
  amount<0 && ((stat==='spa'&&foeMoves.every(m=>m.category==='Physical'))||
   (stat==='atk'&&foeMoves.every(m=>m.category==='Special'&&!m.overrideOffensiveStat))));
}
function supportsMove(move,foeMoves){
 if(!move.exists||move.category==='Status'||move.basePower<=0||move.target!=='normal'&&
   move.target!=='allAdjacent'&&move.target!=='allAdjacentFoes')return false;
 if(Object.keys(move).some(k=>typeof move[k]==='function'))return false;
 const safeKeys=new Set(['name','id','fullname','effectType','exists','num','gen','isNonstandard',
  'noCopy','affectsFainted','sourceEffect','type','target','basePower','accuracy','critRatio',
  'baseMoveType','secondary','secondaries','hasSheerForceBoost','priority','category',
  'ignoreNegativeOffensive','ignorePositiveDefensive','ignoreOffensive','ignoreDefensive',
  'ignoreImmunity','pp','noPPBoosts','isZ','isMax','flags','nonGhostTarget','ignoreAbility',
  'spreadHit','forceSTAB','maxMove','zMove','self','contestType','desc','shortDesc']);
 if(Object.keys(move).some(k=>move[k]&&!safeKeys.has(k)))return false;
 for(const key of ['multihit','recoil','drain','damage','damageCallback','ohko','selfdestruct',
  'selfSwitch','forceSwitch','status','volatileStatus','boosts','heal','overrideOffensiveStat',
  'overrideDefensiveStat','forceCrit','willCrit','ignoreDefensive','ignoreOffensive'])
  if(move[key])return false;
 if(move.flags?.charge||move.flags?.futuremove||move.flags?.ohko)return false;
 if(move.self && (Object.keys(move.self).length!==1||move.self.volatileStatus!=='mustrecharge'))return false;
 return (move.secondaries||[]).every(s=>harmlessSecondary(s,foeMoves));
}

function buildModel(B,Sim,deadline,horizon){
 if(B.ended||B.field.weather||B.field.terrain||Object.keys(B.field.pseudoWeather).length)return null;
 const trial=Sim.Battle.fromJSON(JSON.stringify(B.toJSON()));
 for(const side of trial.sides){
  if(side.pokemon.length!==1||Object.keys(side.sideConditions).length)return null;
  const p=side.pokemon[0];
  if(p.status||Object.keys(p.volatiles).length||p.boosts.accuracy||p.boosts.evasion)return null;
  const mega=side.activeRequest?.active?.[0]?.canMegaEvo;
  // Entry-triggered Mega abilities can depend on both Mega evolutions' order.
  // This model only accepts passive transformations; entry effects already
  // resolved by the real battle (such as Salamence's pre-Mega Intimidate) stay.
  if(mega){
   const abilities=Object.values(trial.dex.species.get(trial.actions.canMegaEvo(p)).abilities||{});
   if(abilities.includes('Intimidate'))return null;
   trial.actions.runMegaEvo(p);
  }
 }
 const ps=trial.sides.map(s=>s.pokemon[0]);
 const moves=ps.map(p=>p.moveSlots.map(slot=>trial.dex.moves.get(slot.id)));
 const profiles=[];
 for(let side=0;side<2;side++){
  const p=ps[side],item=trial.dex.items.get(p.item);
  if(!PASSIVE_ABILITIES.has(p.ability))return null;
  if(p.item&&!item.megaStone&&!['sitrusberry','focussash'].includes(p.item))return null;
  if(moves[side].some(m=>!supportsMove(m,moves[1-side])))return null;
  if(p.moveSlots.some(slot=>slot.pp<horizon*2||slot.disabled))return null;
  profiles.push({maxhp:p.maxhp,hp:p.hp,item:p.item,speed:p.getStat('spe'),
   lowHP:LOW_HP_ABILITIES.has(p.ability),moves:[]});
 }
 const snapshot=JSON.stringify(trial.toJSON());
 for(let side=0;side<2;side++)for(let index=0;index<moves[side].length;index++){
  const move=moves[side][index],tables=[];
  for(let low=0;low<(profiles[side].lowHP?2:1);low++){
   const damages=new Map();let accuracy=1,critChance=0;
   const rolls=[];
   for(const crit of [false,true]){
    if(Date.now()>deadline)return null;
    const probe=Sim.Battle.fromJSON(snapshot);
    const us=probe.sides[side].pokemon[0],them=probe.sides[1-side].pokemon[0];
    if(low)us.hp=Math.max(1,Math.floor(us.maxhp/3));
    probe.randomChance=(num,den)=>{
     if(den===100){accuracy=num/den;return true}
     critChance=num/den;return num>=den||crit;
    };
    let roll=0,measured=false;
    probe.randomizer=damage=>Math.floor(Math.floor(damage)*(100-roll)/100);
    const original=probe.actions.getDamage;
    probe.actions.getDamage=function(source,target,...args){
     if(measured||source!==us||target!==them)return original.call(this,source,target,...args);
     // The guard admits only passive damage effects. Evaluate all damage
     // factors in the same real active-move context before any HP/item change,
     // avoiding sixteen expensive full-battle deserializations per branch.
     let first;
     for(roll=0;roll<16;roll++){
      const result=original.call(this,source,target,...args);
      if(roll===0)first=result;
      rolls.push({crit,damage:typeof result==='number'?result:0});
     }
     measured=true;return first;
    };
    probe.actions.runMove(move.id,us,1);
    if(!measured)for(let i=0;i<16;i++)rolls.push({crit,damage:0});
   }
   for(const entry of rolls){
    const weight=(entry.crit?critChance:1-critChance)*accuracy/16;
    damages.set(entry.damage,(damages.get(entry.damage)||0)+weight);
   }
   // A miss never causes recharge. A successful zero-damage move also cannot
   // start a recharge turn (e.g. a type immunity).
   const outcomes=[{damage:0,p:1-accuracy,recharge:false}];
   for(const [damage,p] of damages)outcomes.push({damage,p,recharge:!!move.flags.recharge&&damage>0});
   tables.push(outcomes.filter(o=>o.p>0));
  }
  profiles[side].moves.push({action:'move '+(index+1)+(B.sides[side].activeRequest?.active?.[0]?.canMegaEvo?' mega':''),
   priority:move.priority||0,tables});
 }
 return profiles;
}

function exactAttackRace(B,{Sim,deadline=Infinity,horizon=3,maxStates=50000}={}){
 const started=Date.now(),profiles=buildModel(B,Sim,deadline,horizon);
 if(!profiles)return null;
 const cache=new Map();let states=0;
 // State: left HP, right HP, consumed-item mask, recharge mask.
 const initial=[profiles[0].hp,profiles[1].hp,0,0];
 const actions=(state,side)=>state[3]&(1<<side)?[-1]:profiles[side].moves.map((_,i)=>i);
 function apply(state,side,moveIndex){
  if(moveIndex===-1){const next=[...state];next[3]&=~(1<<side);return [{state:next,p:1}]}
  const move=profiles[side].moves[moveIndex],target=1-side,profile=profiles[target];
  const table=move.tables.length>1&&state[side]*3<=profiles[side].maxhp?move.tables[1]:move.tables[0];
  const merged=new Map();
  for(const outcome of table){
   const next=[...state];let hp=state[target]-outcome.damage;
   if(hp<=0&&state[target]===profile.maxhp&&profile.item==='focussash'&&!(state[2]&(1<<target))){
    hp=1;next[2]|=1<<target;
   }
   next[target]=Math.max(0,hp);
   if(hp>0&&hp*2<=profile.maxhp&&profile.item==='sitrusberry'&&!(state[2]&(1<<target))){
    next[target]=Math.min(profile.maxhp,hp+Math.floor(profile.maxhp/4));next[2]|=1<<target;
   }
   if(outcome.recharge)next[3]|=1<<side;
   const key=next.join(','),old=merged.get(key);
   if(old)old.p+=outcome.p;else merged.set(key,{state:next,p:outcome.p});
  }
  return [...merged.values()];
 }
 function pair(state,l,r,remaining){
  const lp=l===-1?-Infinity:profiles[0].moves[l].priority;
  const rp=r===-1?-Infinity:profiles[1].moves[r].priority;
  const order=lp!==rp?lp>rp?0:1:profiles[0].speed!==profiles[1].speed?
   profiles[0].speed>profiles[1].speed?0:1:-1;
  let lower=0,upper=0;
  for(const first of order===-1?[0,1]:[order]){
   const weight=order===-1?0.5:1;
   for(const a of apply(state,first,first===0?l:r)){
    if(a.state[0]===0||a.state[1]===0){const value=a.state[0]>0?1:0;lower+=weight*a.p*value;upper+=weight*a.p*value;continue}
    for(const b of apply(a.state,1-first,first===0?r:l)){
     const value=solve(b.state,remaining-1),p=weight*a.p*b.p;
     lower+=p*value[0];upper+=p*value[1];
    }
   }
  }
  return [lower,upper];
 }
 function matrix(state,remaining){
  const L=actions(state,0),R=actions(state,1);
  return {L,R,cells:L.map(l=>R.map(r=>pair(state,l,r,remaining)))};
 }
 function solve(state,remaining){
  if(state[1]===0)return [1,1];if(state[0]===0)return [0,0];
  if(remaining===0)return [0,1];
  const key=remaining+':'+state.join(','),cached=cache.get(key);if(cached)return cached;
  if(++states>maxStates||Date.now()>deadline)throw Error('exact-search-budget');
  const m=matrix(state,remaining);
  const value=[gameValue(m.cells.map(row=>row.map(c=>c[0]))),gameValue(m.cells.map(row=>row.map(c=>c[1])))];
  cache.set(key,value);return value;
 }
 let root,completedHorizon=0;
 for(let depth=1;depth<=horizon;depth++){
  try{root=matrix(initial,depth);completedHorizon=depth}
  catch(e){if(e.message!=='exact-search-budget')throw e;break}
 }
 if(!root)return null;
 const lower=root.cells.map(row=>row.map(c=>c[0])),upper=root.cells.map(row=>row.map(c=>c[1]));
 // Certify a pure equilibrium only when both deviations are worse even after
 // giving all unresolved branches to the deviating player. No HP tiebreaks.
 let saddle=null;
 for(let i=0;i<root.L.length;i++)for(let j=0;j<root.R.length;j++){
  if(root.L.every((_,k)=>k===i||upper[k][j]<=lower[i][j]+1e-10)&&
   root.R.every((_,k)=>k===j||lower[i][k]>=upper[i][j]-1e-10))saddle={i,j};
 }
 const pct=n=>Math.round(n*1000000)/10000;
 return {method:'exact-bounded-attack-game',horizon:completedHorizon,states,elapsedMs:Date.now()-started,
  certified:!!saddle,left:saddle?profiles[0].moves[root.L[saddle.i]].action:null,
  right:saddle?profiles[1].moves[root.R[saddle.j]].action:null,
  leftActions:profiles[0].moves.map(m=>m.action),rightActions:profiles[1].moves.map(m=>m.action),
  payoff:root.cells.map(row=>row.map(([lo,hi])=>({winLowerPct:pct(lo),winUpperPct:pct(hi)}))),
  valueBounds:[pct(gameValue(lower)),pct(gameValue(upper))]};
}

module.exports={exactAttackRace,gameValue,supportsMove,buildModel,PASSIVE_ABILITIES,LOW_HP_ABILITIES};
