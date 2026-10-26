'use strict';
// Generic contingent plan grammar. Plans describe goals and reactions, not
// species-specific rules or fixed action scripts. The search engine evaluates
// their true Showdown outcomes against independently generated counter-plans.
const EPS=1e-9;
const moveIndex=a=>Number(String(a).match(/move (\d+)/)?.[1]||0)-1;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const sid=(side)=>side==='p1'?'p2':'p1';
const isMega=a=>String(a).endsWith(' mega');
function info(B,side,action){
 const p=B.getSide(side)?.pokemon?.[0];
 return B.dex.moves.get(p?.moveSlots?.[moveIndex(action)]?.id);
}
function actions(B,deps,side){
 return (deps.legal(B,side)||[]).filter(Boolean);
}
function fingerprint(p){
 return [p.hp,p.maxhp,p.status,p.item,p.ability,Object.values(p.boosts).join(',')].join('|');
}
function shape(B,side,deps){
 const p=B.getSide(side).pokemon[0],foe=B.getSide(sid(side)).pokemon[0];
 const opts=actions(B,deps,side);
 const rows=opts.map(a=>({action:a,m:info(B,side,a)}));
 return {p,foe,rows,attacks:rows.filter(x=>x.m.category!=='Status'&&
  (x.m.basePower>0||x.m.damage||x.m.damageCallback)),
  boosts:rows.filter(x=>{const b=x.m.boosts||x.m.self?.boosts||{};
   return x.m.category==='Status'&&x.m.target==='self'&&
    Object.values(b).some(v=>v>0)}),
  heals:rows.filter(x=>x.m.heal||x.m.id==='painsplit'||
    x.m.drain&&x.m.category!=='Status'),
  disruptions:rows.filter(x=>x.m.category==='Status'&&
   x.m.target!=='self'&&(x.m.status||x.m.volatileStatus||
    x.m.id==='encore'||x.m.id==='taunt'||x.m.boosts)),
  all:opts};
}
function atkSignal(B,deps,side,action){
 const m=info(B,side,action);
 if(!m.exists||m.category==='Status')return -Infinity;
 if(deps.provablyImmuneAttack?.(B,side,action))return -Infinity;
 let damage=Number(deps.estimatedDirectDamage?.(B,side,action)||0);
 if(m.damage&&typeof m.damage==='number')damage=m.damage;
 const foe=B.getSide(sid(side)).pokemon[0],self=B.getSide(side).pokemon[0];
 const hit=(typeof m.accuracy==='number'?clamp(m.accuracy/100,0,1):1);
 let score=Math.max(0,damage)*hit;
 // Breakpoints only influence the order we try tactics, never the reward.
 const priority=m.priority||0,fast=(priority>0||
  priority===0&&self.getStat('spe')>=foe.getStat('spe'));
 if(damage>=foe.hp&&fast)score+=foe.maxhp*1.2*hit;
 else if(damage>=foe.hp&&priority>=0)score+=foe.maxhp*0.4*hit;
 if(m.recoil)score*=0.88;
 if(m.self?.boosts?.spa<0||m.self?.boosts?.atk<0)score*=0.9;
 return score;
}
function chooseMove(B,deps,side,preferred,megaMode){
 const S=shape(B,side,deps),opts=S.all;
 if(!opts.length)return null;
 const megaAvailable=opts.some(isMega);
 const wantMega=megaAvailable&&(megaMode==='immediate'||megaMode==='after-first');
 // Respect a live temporary move lock/disable; the move set changes after
 // Taunt, Encore, Choice item locking, PP depletion etc.
 let candidates=opts;
 if(megaAvailable&&megaMode==='delay')candidates=opts.filter(a=>!isMega(a));
 else if(wantMega)candidates=opts.filter(isMega);
 if(!candidates.length)candidates=opts;
 if(preferred){
  const found=candidates.find(a=>moveIndex(a)===preferred.slot);
  if(found)return found;
 }
 const scored=candidates.map(a=>({a,score:atkSignal(B,deps,side,a)}))
  .sort((x,y)=>y.score-x.score);
 return scored[0]?.score>-Infinity?scored[0].a:candidates[0];
}
function healthRisk(B,deps,side){
 const p=B.getSide(side).pokemon[0],foeSide=sid(side);
 const attack=actions(B,deps,foeSide).map(a=>atkSignal(B,deps,foeSide,a))
  .filter(Number.isFinite);
 const peak=attack.length?Math.max(0,...attack):0;
 return {incoming:peak,now:p.hp,maximum:p.maxhp};
}
function meaningfulBoost(B,side,action){
 const p=B.getSide(side).pokemon[0],m=info(B,side,action);
 const boosts=m.boosts||m.self?.boosts||{};
 return Object.entries(boosts).some(([stat,n])=>n>0&&(p.boosts[stat]||0)<6);
}
function validDisruption(B,side,action){
 const p=B.getSide(side).pokemon[0],foe=B.getSide(sid(side)).pokemon[0],m=info(B,side,action);
 if(p.volatiles.taunt)return false;
 if(m.status&&foe.status)return false;
 if(m.id==='encore'&&!foe.lastMove?.id&&!foe.lastMoveUsed&&
  p.getStat('spe')>foe.getStat('spe'))return false;
 if(m.id==='taunt'&&foe.volatiles.taunt)return false;
 return true;
}
function planLabel(x){
 let s=x.kind;
 if(x.slot!=null)s+=':'+x.slot;
 if(x.stage!=null)s+='@'+x.stage;
 if(x.hpRule!=null)s+=':heal-'+x.hpRule;
 return s+':'+x.mega;
}
function buildPlans(B,deps,side){
 const S=shape(B,side,deps);
 const bySlot=xs=>[...new Set(xs.map(x=>moveIndex(x.action)))];
 const atk=bySlot(S.attacks),boost=bySlot(S.boosts),heal=bySlot(S.heals),
  disrupt=bySlot(S.disruptions);
 const seen=new Set(),plans=[];
 function add(kind,slot,mega,stage,hpRule,firstSlot){
  const p={kind,slot,mega,stage,hpRule,firstSlot};
  p.name=planLabel(p)+(firstSlot==null?'':':first-'+firstSlot);
  if(!seen.has(p.name)){seen.add(p.name);plans.push(p)}
 }
 const modes=S.all.some(isMega)?['immediate','delay']:['none'];
 // Every actually legal move has a candidate plan beginning with it.
 for(const a of S.all)add('forced-opening',moveIndex(a),isMega(a)?'immediate':'delay',null,null,moveIndex(a));
 // Adaptive damage-race choices can switch to priority finishers.
 for(const mode of modes)add('attack',null,mode);
 for(const slot of atk)add('attack',slot,modes[0]);
 // General state-building plans: different thresholds are hypotheses to test,
 // rather than assuming a boost must always be used or always be skipped.
 for(const slot of boost)for(const goal of [1,2,3,4,6]){
  for(const mode of modes)add('setup',slot,mode,goal,null);
  if(heal.length)for(const h of [0.45,0.7]){
   add('setup-heal',slot,modes[0],goal,h);
   if(modes.length>1)add('setup-heal',slot,'delay',goal,h);
  }
 }
 for(const slot of disrupt){
  for(const mode of modes)add('disrupt',slot,mode);
  if(heal.length)add('disrupt-heal',slot,modes[0],null,0.6);
 }
 if(heal.length){
  for(const h of [0.35,0.55,0.75])for(const mode of modes)add('sustain',null,mode,null,h);
 }
 // Balance plan diversity rather than allowing any one tactic to monopolize
 // budget. Forced-opening candidates cover all legal first actions; remaining
 // slots are allocated round-robin across distinct contingent plan families.
 const maxPlans=26;
 if(plans.length>maxPlans){
  const forced=plans.filter(p=>p.kind==='forced-opening');
  const categories=new Map();
  for(const p of plans.filter(p=>p.kind!=='forced-opening')){
   if(!categories.has(p.kind))categories.set(p.kind,[]);
   categories.get(p.kind).push(p);
  }
  const remaining=maxPlans-forced.length,selected=[];
  while(selected.length<remaining&&[...categories.values()].some(g=>g.length)){
   for(const group of categories.values()){
    if(!group.length||selected.length>=remaining)continue;
    // Spread boost targets and HP thresholds rather than keeping only
    // the shortest-range variants.
    const index=Math.floor(group.length/2);
    selected.push(group.splice(index,1)[0]);
   }
  }
  return [...forced,...selected];
 }
 return plans;
}
function actionForPlan(B,deps,side,plan,turn){
 const S=shape(B,side,deps),p=S.p;
 if(!S.all.length)return null;
 const wasMega=S.all.some(isMega)===false;
 let mega=plan.mega;
 if(mega==='delay'&&turn>0)mega='after-first';
 const candidates=mega==='delay'&&S.all.some(isMega)?S.all.filter(a=>!isMega(a)):
  mega!=='none'&&S.all.some(isMega)?S.all.filter(isMega):S.all;
 const working=candidates.length?candidates:S.all;
 const bySlot=slot=>working.find(a=>moveIndex(a)===slot);
 if(turn===0&&plan.firstSlot!=null){
  const start=bySlot(plan.firstSlot);
  if(start)return start;
 }
 const bestAttacks=working.filter(a=>{
  const m=info(B,side,a);return m.category!=='Status'&&
   (m.basePower>0||m.damage||m.damageCallback)
 }).map(a=>({a,value:atkSignal(B,deps,side,a)}))
 .sort((x,y)=>y.value-x.value);
 const attacks=bestAttacks.filter(x=>Number.isFinite(x.value));
 const defaultAttack=attacks[0]?.a||working[0];
 const bestFinish=attacks.filter(x=>x.value>=0).find(x=>{
  const foe=S.foe,m=info(B,side,x.a);
  const d=Number(deps.estimatedDirectDamage?.(B,side,x.a)||0);
  if(d<=0||foe.item==='focussash'&&foe.hp===foe.maxhp||
     foe.ability==='sturdy'&&foe.hp===foe.maxhp)return false;
  return d>=foe.hp&&(m.priority>0||S.p.getStat('spe')>=foe.getStat('spe'));
 });
 // Winning immediately is stronger than completing a planned boost.
 if(bestFinish)return bestFinish.a;
 const heal=working.filter(a=>S.heals.some(x=>moveIndex(x.action)===moveIndex(a)) &&
  info(B,side,a).category==='Status'&&info(B,side,a).heal);
 const risk=healthRisk(B,deps,side);
 const hpThreshold=plan.hpRule??0.5;
 const healNeeded=heal.length&&S.p.hp<S.p.maxhp &&
  (risk.now<=risk.maximum*hpThreshold ||risk.incoming>=risk.now*0.70);
 const healChoice=heal[0];
 if(healNeeded&&(plan.kind.includes('heal')||plan.kind==='sustain'))return healChoice;
 const boost=bySlot(plan.slot);
 if((plan.kind==='setup'||plan.kind==='setup-heal')&&boost&&meaningfulBoost(B,side,boost)){
  const boostMove=info(B,side,boost),entries=Object.entries(boostMove.boosts||boostMove.self?.boosts||{})
   .filter(([stat,n])=>n>0);
  const level=Math.min(...entries.map(([stat])=>S.p.boosts[stat]||0));
  if(level<(plan.stage||1)){
   if(plan.kind==='setup-heal'&&healChoice&&S.p.hp<S.p.maxhp&&
      risk.incoming>=S.p.hp*0.85)return healChoice;
   return boost;
  }
 }
 const disrupt=bySlot(plan.slot);
 if(plan.kind.startsWith('disrupt')&&disrupt&&validDisruption(B,side,disrupt)){
  if(plan.kind==='disrupt'||!healNeeded)return disrupt;
 }
 if(plan.kind==='sustain'&&healNeeded)return healChoice;
 if(plan.kind==='attack'&&plan.slot!=null){
  const preferred=bySlot(plan.slot);
  if(preferred&&atkSignal(B,deps,side,preferred)>-Infinity){
   // A priority finisher or newly favorable coverage move can supersede
   // the fixed main attack after a Focus Sash or type change.
   if(attacks[0]?.value>(atkSignal(B,deps,side,preferred)*1.65+10))return attacks[0].a;
   return preferred;
  }
 }
 return defaultAttack;
}
module.exports={buildPlans,actionForPlan,shape,healthRisk,atkSignal,validDisruption,meaningfulBoost};
