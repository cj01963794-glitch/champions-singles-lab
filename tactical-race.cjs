'use strict';
const {gameValue,supportsMove,PASSIVE_ABILITIES,LOW_HP_ABILITIES}=require('./attack-race.cjs');
const STAT_KEYS=['atk','def','spa','spd','spe'];
const encode=boosts=>STAT_KEYS.reduce((code,k,i)=>code+(boosts[k]+6)*13**i,0);
const boostCache=new Map();
function decode(code){
 if(boostCache.has(code))return boostCache.get(code);
 const result={};let n=code;
 for(const key of STAT_KEYS){result[key]=n%13-6;n=Math.floor(n/13)}
 boostCache.set(code,result);return result;
}
const bounded=(n,min,max)=>Math.max(min,Math.min(max,n));
function moveKind(move,foeMoves){
 if(move.id==='encore')return 'encore';
 if(move.category==='Status'){
  const boosts=Object.entries(move.boosts||{});
  if(move.target!=='self'||!boosts.length||move.self||move.heal||move.volatileStatus||
   Object.values(move).some(v=>typeof v==='function')||
   !boosts.every(([k,v])=>STAT_KEYS.includes(k)&&v>0))return null;
  return 'boost';
 }
 // Sparkling Aria's sole extra effect cures burns. All status-inflicting
 // moves and initial major statuses are rejected by this model.
 const shape={...move};
 if(move.id==='sparklingaria'){
  delete shape.onAfterMove;delete shape.secondary;delete shape.secondaries;
 }
 if(move.recoil){
  if(!Array.isArray(move.recoil)||move.recoil.length!==2||move.recoil[0]<=0||
   move.recoil[1]<=0||move.recoil[0]>move.recoil[1])return null;
  delete shape.recoil;
 }
 return supportsMove(shape,foeMoves.filter(m=>m.category!=='Status'))?'attack':null;
}

function createTacticalModel(B,Sim,deadline,horizon,assumeImmediateMega=false){
 // Pre-evolving every combatant cannot represent delayed Mega timing.
 if(!assumeImmediateMega && B.sides.some(s=>s.activeRequest?.active?.[0]?.canMegaEvo))return null;
 if(B.ended||B.field.weather||B.field.terrain||Object.keys(B.field.pseudoWeather).length)return null;
 const trial=Sim.Battle.fromJSON(JSON.stringify(B.toJSON()));
 for(const side of trial.sides){
  if(side.pokemon.length!==1||Object.keys(side.sideConditions).length)return null;
  const p=side.pokemon[0];
  if(p.status||Object.keys(p.volatiles).some(k=>!['encore','mustrecharge'].includes(k))||
   p.boosts.accuracy||p.boosts.evasion)return null;
  const mega=side.activeRequest?.active?.[0]?.canMegaEvo;
  if(mega){
   if(Object.values(trial.dex.species.get(trial.actions.canMegaEvo(p)).abilities||{}).includes('Intimidate'))return null;
   trial.actions.runMegaEvo(p);
  }
 }
 const ps=trial.sides.map(s=>s.pokemon[0]);
 const allMoves=ps.map(p=>p.moveSlots.map(slot=>trial.dex.moves.get(slot.id)));
 const profiles=[];
 for(let side=0;side<2;side++){
  const p=ps[side],item=trial.dex.items.get(p.item);
  if(!PASSIVE_ABILITIES.has(p.ability)||p.item&&!item.megaStone&&
   !['sitrusberry','focussash'].includes(p.item))return null;
  const kinds=allMoves[side].map(m=>moveKind(m,allMoves[1-side]));
  if(kinds.some(k=>!k)||p.moveSlots.some(slot=>slot.pp<horizon*2))return null;
  profiles.push({maxhp:p.maxhp,hp:p.hp,item:p.item,ability:p.ability,baseSpeed:p.storedStats.spe,
   boosts:encode(p.boosts),lowHP:LOW_HP_ABILITIES.has(p.ability),
   recharge:!!p.volatiles.mustrecharge,
   last:p.moveSlots.findIndex(slot=>slot.id===p.lastMove?.id),
   lock:p.moveSlots.findIndex(slot=>slot.id===p.volatiles.encore?.move),
   timer:p.volatiles.encore?.duration||0,
   moves:allMoves[side].map((m,i)=>({id:m.id,kind:kinds[i],priority:m.priority||0,
    boosts:m.boosts,recoil:m.recoil,recharge:!!m.flags.recharge,failEncore:!!m.flags.failencore,
    action:'move '+(i+1)+(B.sides[side].activeRequest?.active?.[0]?.canMegaEvo?' mega':'')}))});
 }
 if(!profiles.some(p=>p.moves.some(m=>m.kind!=='attack'||m.recoil)))return null;
 const snapshot=JSON.stringify(trial.toJSON()),tables=new Map();
 function distribution(state,side,index){
  const low=profiles[side].lowHP&&state[side]*3<=profiles[side].maxhp?1:0;
  const key=[side,index,state[4],state[5],low].join(':');
  if(tables.has(key))return tables.get(key);
  const damages=new Map();let accuracy=1,criticalChance=0;
  const rolls=[];
  for(const critical of [false,true]){
   if(Date.now()>deadline)throw Error('tactical-search-budget');
   const probe=Sim.Battle.fromJSON(snapshot),us=probe.sides[side].pokemon[0],them=probe.sides[1-side].pokemon[0];
   Object.assign(probe.p1.pokemon[0].boosts,decode(state[4]));
   Object.assign(probe.p2.pokemon[0].boosts,decode(state[5]));
   // Encore/recharge only select actions. They must not prevent calibration
   // of the damage for an action that the search has already resolved.
   for(const p of [us,them]){delete p.volatiles.encore;delete p.volatiles.mustrecharge}
   us.hp=low?Math.max(1,Math.floor(us.maxhp/3)):us.maxhp;
   let roll=0,measured=false;
   probe.randomChance=(num,den)=>{
    if(den===100){accuracy=num/den;return true}
    criticalChance=num/den;return num>=den||critical;
   };
   probe.randomizer=value=>Math.floor(Math.floor(value)*(100-roll)/100);
   const original=probe.actions.getDamage;
   probe.actions.getDamage=function(source,target,...args){
    if(measured||source!==us||target!==them)return original.call(this,source,target,...args);
    let first;
    for(roll=0;roll<16;roll++){
     const value=original.call(this,source,target,...args);
     if(!roll)first=value;
     rolls.push({critical,damage:typeof value==='number'?value:0});
    }
    measured=true;return first;
   };
   probe.actions.runMove(profiles[side].moves[index].id,us,1);
   if(!measured)for(let i=0;i<16;i++)rolls.push({critical,damage:0});
  }
  for(const roll of rolls){const p=accuracy*(roll.critical?criticalChance:1-criticalChance)/16;
   damages.set(roll.damage,(damages.get(roll.damage)||0)+p)}
  const outcomes=[{damage:0,p:1-accuracy,hit:false}];
  for(const [damage,p] of damages)outcomes.push({damage,p,hit:damage>0});
  const result=outcomes.filter(o=>o.p>0);tables.set(key,result);return result;
 }
 return {profiles,distribution};
}

function makeTacticalSearch(B,{Sim,deadline=Infinity,horizon=2,maxStates=30000,assumeImmediateMega=false}={}){
 const started=Date.now(),model=createTacticalModel(B,Sim,deadline,horizon,assumeImmediateMega);
 if(!model)return null;
 const {profiles,distribution}=model,cache=new Map(),terminalCache=new Map();let states=0;
 // HPs, used item mask, recharge mask, boost codes, last moves, encore moves,
 // and encore durations. All values influencing the supported mechanics are
 // in the key; chance outcomes may merge only after those values agree.
 const initial=[profiles[0].hp,profiles[1].hp,0,
  (profiles[0].recharge?1:0)|(profiles[1].recharge?2:0),
  profiles[0].boosts,profiles[1].boosts,profiles[0].last,profiles[1].last,
  profiles[0].lock,profiles[1].lock,profiles[0].timer,profiles[1].timer];
 const ending=state=>state[0]===0||state[1]===0;
 function valueOfEnd(state){
  // On simultaneous recoil KOs in this pinned Gen 9 custom game, the source
  // faints last and wins. applyAction records that side in state[12].
  if(state[0]===0&&state[1]===0)return state[12]===0?1:0;
  return state[1]===0?1:0;
 }
 function actions(state,side){
  if(state[3]&(1<<side))return [-1];
  if(state[10+side]>0&&state[8+side]>=0)return [state[8+side]];
  return profiles[side].moves.flatMap((m,i)=>m.kind==='boost'&&
   Object.entries(m.boosts).every(([k])=>decode(state[4+side])[k]>=6)?[]:[i]);
 }
 function healBerry(state,side){
  if(state[side]>0&&state[side]*2<=profiles[side].maxhp&&profiles[side].item==='sitrusberry'&&!(state[2]&(1<<side))){
   state[side]=Math.min(profiles[side].maxhp,state[side]+Math.floor(profiles[side].maxhp/4));state[2]|=1<<side;
  }
 }
 function applyAction(state,side,index,alreadyMoved){
  if(index===-1){const next=[...state];next[3]&=~(1<<side);return [{state:next,p:1}]}
  // A faster Encore may override the slower player's previously queued move.
  if(state[10+side]>0&&state[8+side]>=0)index=state[8+side];
  const move=profiles[side].moves[index],target=1-side,base=[...state];base[6+side]=index;
  if(move.kind==='boost'){
   const boosts={...decode(base[4+side])};
   for(const [k,n] of Object.entries(move.boosts))boosts[k]=bounded(boosts[k]+n,-6,6);
   base[4+side]=encode(boosts);return [{state:base,p:1}];
  }
  if(move.kind==='encore'){
   const last=state[6+target],lastMove=profiles[target].moves[last];
   if(state[10+target]<=0&&lastMove&&!lastMove.failEncore){
    base[8+target]=last;
    // Residual decrement is applied at the end of the turn below.
    base[10+target]=alreadyMoved?4:3;
   }
   return [{state:base,p:1}];
  }
  const merged=new Map();
  for(const outcome of distribution(state,side,index)){
   const next=[...base],before=state[target];let hp=before-outcome.damage;
   if(hp<=0&&before===profiles[target].maxhp&&profiles[target].item==='focussash'&&!(state[2]&(1<<target))){
    hp=1;next[2]|=1<<target;
   }
   next[target]=Math.max(0,hp);
   const dealt=before-next[target];healBerry(next,target);
   if(move.recharge&&outcome.hit)next[3]|=1<<side;
   if(move.recoil&&dealt>0&&profiles[side].ability!=='rockhead'){
    const recoil=Math.max(1,Math.round(dealt*move.recoil[0]/move.recoil[1]));
    next[side]=Math.max(0,next[side]-recoil);healBerry(next,side);
   }
   if(next[0]===0&&next[1]===0)next[12]=side;
   const key=next.join(','),old=merged.get(key);
   if(old)old.p+=outcome.p;else merged.set(key,{state:next,p:outcome.p});
  }
  return [...merged.values()];
 }
 function endTurn(state){
  const next=[...state];
  for(const side of [0,1])if(next[10+side]>0){next[10+side]--;if(!next[10+side])next[8+side]=-1}
  return next;
 }
 function speed(state,side){const n=decode(state[4+side]).spe,base=profiles[side].baseSpeed;
  return n>=0?Math.floor(base*(2+n)/2):Math.floor(base*2/(2-n))}
 function finishBounds(state,side,index){
  if(index<0)return [0,1];
  if(state[10+side]>0&&state[8+side]>=0)index=state[8+side];
  if(profiles[side].moves[index].kind!=='attack')return [0,1];
  const key=[side,index,state[0],state[1],state[2],state[4],state[5]].join(':');
  const saved=terminalCache.get(key);if(saved)return saved;
  let lo=0,hi=0;
  for(const outcome of applyAction(state,side,index,true)){
   if(ending(outcome.state)){const v=valueOfEnd(outcome.state);lo+=outcome.p*v;hi+=outcome.p*v}
   else hi+=outcome.p;
  }
  const result=[lo,hi];terminalCache.set(key,result);return result;
 }
 function evaluatePair(state,l,r,remaining){
  const lp=l<0?-Infinity:profiles[0].moves[l].priority,rp=r<0?-Infinity:profiles[1].moves[r].priority;
  const ls=speed(state,0),rs=speed(state,1);
  const order=lp!==rp?lp>rp?0:1:ls!==rs?ls>rs?0:1:-1;
  let lo=0,hi=0;
  for(const first of order<0?[0,1]:[order]){
   const weight=order<0?0.5:1;
   for(const a of applyAction(state,first,first===0?l:r,false)){
    if(ending(a.state)){const v=valueOfEnd(a.state);lo+=weight*a.p*v;hi+=weight*a.p*v;continue}
    if(remaining===1){
     const value=finishBounds(a.state,1-first,first===0?r:l);
     lo+=weight*a.p*value[0];hi+=weight*a.p*value[1];continue;
    }
    for(const b of applyAction(a.state,1-first,first===0?r:l,true)){
     const value=solve(endTurn(b.state),remaining-1),p=weight*a.p*b.p;
     lo+=p*value[0];hi+=p*value[1];
    }
   }
  }
  return [lo,hi];
 }
 function matrix(state,remaining){
  const L=actions(state,0),R=actions(state,1);
  if(!L.length||!R.length)throw Error('tactical-search-budget');
  return {L,R,cells:L.map(l=>R.map(r=>evaluatePair(state,l,r,remaining)))};
 }
 function solve(state,remaining){
  if(ending(state)){const v=valueOfEnd(state);return [v,v]}
  if(!remaining)return [0,1];
  const key=remaining+':'+state.join(','),old=cache.get(key);if(old)return old;
  if(++states>maxStates||Date.now()>deadline)throw Error('tactical-search-budget');
  const m=matrix(state,remaining),v=[gameValue(m.cells.map(row=>row.map(c=>c[0]))),
   gameValue(m.cells.map(row=>row.map(c=>c[1])))];
  cache.set(key,v);return v;
 }
 let root,completed=0;
 for(let n=1;n<=horizon;n++){
  try{root=matrix(initial,n);completed=n}
  catch(e){if(e.message!=='tactical-search-budget')throw e;break}
 }
 if(!root)return null;
 const lower=root.cells.map(row=>row.map(c=>c[0])),upper=root.cells.map(row=>row.map(c=>c[1]));
 const left=gameValue(lower,true);
 const right=gameValue(upper[0].map((_,j)=>upper.map(row=>1-row[j])),true);
 const dominatedLeft=root.L.flatMap((action,i)=>root.L.some((_,k)=>k!==i&&
  lower[k].every((v,j)=>v>upper[i][j]+1e-9))?[action]:[]);
 const dominatedRight=root.R.flatMap((action,j)=>root.R.some((_,k)=>k!==j&&
  upper.every((row,i)=>row[k]<lower[i][j]-1e-9))?[action]:[]);
 const pct=n=>Math.round(n*1000000)/10000;
 return {method:'bounded-tactical-probability-game',horizon:completed,states,elapsedMs:Date.now()-started,
  applicable:completed>=2,certified:1-right.value-left.value<1e-8,
  leftActions:root.L.map(i=>i<0?'move 1':profiles[0].moves[i].action),
  rightActions:root.R.map(i=>i<0?'move 1':profiles[1].moves[i].action),
  leftPolicy:left.probabilities,rightPolicy:right.probabilities,
  dominatedLeftActions:dominatedLeft.map(i=>i<0?'move 1':profiles[0].moves[i].action),
  dominatedRightActions:dominatedRight.map(i=>i<0?'move 1':profiles[1].moves[i].action),
  payoff:root.cells.map(row=>row.map(([lo,hi])=>({winLowerPct:pct(lo),winUpperPct:pct(hi)}))),
  valueBounds:[pct(left.value),pct(1-right.value)]};
}
function choosePolicy(actions,probabilities,roll){
 let total=0;
 for(let i=0;i<actions.length;i++){total+=probabilities[i];if(roll<total-1e-10)return actions[i]}
 return actions[probabilities.lastIndexOf(Math.max(...probabilities))];
}
module.exports={makeTacticalSearch,createTacticalModel,choosePolicy,moveKind};
