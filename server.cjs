'use strict';
const http=require('node:http');
const sampleLibrary=require('./sample-library.cjs');
const localized=require('./korean-forms.cjs');
const {randomBytes}=require('node:crypto');
const {exactAttackRace}=require('./attack-race.cjs');
const {sampledRace}=require('./sampled-race.cjs');
const {makeTacticalSearch,choosePolicy}=require('./tactical-race.cjs');
const Sim=require(process.env.SHOWDOWN_PACKAGE_PATH || 'pokemon-showdown');
const FORMAT='gen9championscustomgame';
const dex=Sim.Dex.forFormat(FORMAT);
if(dex.currentMod!=='champions')throw Error('Champions mod missing');
const stats=['hp','atk','def','spa','spd','spe'];
const samples=[
 {species:'Garchomp',name:'한카리아스 기띠',nature:'Jolly',item:'Focus Sash',ability:'Rough Skin',moves:['Earthquake','Dragon Claw','Swords Dance','Stone Edge'],evs:{hp:2,atk:32,spe:32}},
 {species:'Metagross',name:'메타그로스 냉동펀치',nature:'Jolly',item:'Metagrossite',ability:'Clear Body',moves:['Ice Punch','Bullet Punch','Meteor Mash','Earthquake'],evs:{hp:2,atk:32,spe:32}},
];
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const id=s=>String(s||'').toLowerCase().replace(/[^a-z0-9]/g,'');
function validate(input){
 if(!input||typeof input!=='object')throw Error('Missing Pokémon');
 const spc=dex.species.get(input.species);
 if(!spc.exists)throw Error('Unknown Pokémon '+input.species);
 const moves=(input.moves||[]).filter(Boolean).map(m=>{const x=dex.moves.get(m);if(!x.exists)throw Error('Unknown move '+m);return x.name}).slice(0,4);
 if(!moves.length)throw Error('No moves');
 const evs={};for(const k of stats)evs[k]=Number(input.evs?.[k]??input.sp?.[k]??0);
 if(Object.values(evs).some(x=>!Number.isInteger(x)||x<0||x>32)||Object.values(evs).reduce((a,b)=>a+b,0)>66)throw Error('Invalid SP');
 const mega=!!spc.isMega;
 const neededItem=mega?(spc.requiredItem||spc.requiredItems?.[0]||''):'';
 const item=input.item||neededItem||'';
 if(item&&!dex.items.get(item).exists)throw Error('Unknown item '+item);
 // Some Mega formes evolve from a *specific* base forme rather than the
 // normal species. e.g. Floettite maps Floette-Eternal -> Floette-Mega,
 // while dex.species.get('Floette-Mega').baseSpecies is only "Floette".
 // Resolve the battle starting species from the Mega Stone's actual mapping.
 const stone=dex.items.get(item);
 const megaSource=mega?Object.entries(stone.megaStone||{}).find(([,outcome])=>
   dex.species.get(outcome).id===spc.id)?.[0]:null;
 const species=mega?(megaSource||spc.baseSpecies):spc.name;
 const base=dex.species.get(species);
 if(mega && stone.megaStone && !megaSource)
  throw Error(spc.name+' cannot Mega evolve with '+item);
 if(mega && neededItem && dex.items.get(item).id!==dex.items.get(neededItem).id)
  throw Error(spc.name+' needs '+neededItem+' to activate its Mega ability');
 const allowedPre=Object.values(base.abilities||{});
 const allowedPost=Object.values(spc.abilities||{});
 let preAbility=input.preMegaAbility||'';
 if(mega){
  const selected=input.ability||'';
  if(selected&&!allowedPost.includes(selected)&&!allowedPre.includes(selected))
   throw Error('Unknown Mega ability '+selected+' for '+spc.name);
  if(!preAbility&&allowedPre.includes(selected))preAbility=selected; // compatibility with older saved sets
  if(!preAbility)preAbility=base.abilities['0'];
  if(!allowedPre.includes(preAbility))throw Error('Invalid pre-Mega ability '+preAbility);
 }else{
  preAbility=input.ability||base.abilities['0'];
  if(!allowedPre.includes(preAbility))throw Error('Invalid ability '+preAbility);
 }
 const nature=dex.natures.get(input.nature||'Serious');
 if(!nature.exists)throw Error('Unknown nature');
 return {name:input.name||species,species,nature:nature.name,ability:preAbility,item,moves,evs,level:50};
}
function battle(a,b,seed='1579,3137,6027,8191'){
 const B=new Sim.Battle({formatid:FORMAT,seed});
 B.setPlayer('p1',{name:'Left',team:[validate(a)]});B.setPlayer('p2',{name:'Right',team:[validate(b)]});
 for(const k of ['p1','p2']){const s=B.getSide(k);if(s.activeRequest?.teamPreview)B.choose(k,'team 1')}
 return B;
}
function legal(B,k){
 const r=B.getSide(k)?.activeRequest?.active?.[0];
 if(!r)return [];
 const mega=!!r.canMegaEvo,p=B.getSide(k).pokemon[0];
 // Mega evolution is a separate optional action for every usable move.
 const available=(r.moves||[]).flatMap((m,i)=>!m.disabled&&m.pp!==0?
  ['move '+(i+1),...(mega?['move '+(i+1)+' mega']:[])]:[]);
 // A full +6 stat cannot be boosted again. Do not waste turns on moves
 // whose only effect is already at its cap (iron defense, swords dance etc).
 const meaningful=available.filter(a=>{
  const ix=Number(a.match(/move (\d+)/)?.[1]||0)-1;
  const m=B.dex.moves.get(p.moveSlots[ix]?.id);
  if(m.category!=='Status'||m.target!=='self')return true;
  const boosts=m.boosts||m.self?.boosts;
  if(!boosts)return true;
  const entries=Object.entries(boosts);
  return !entries.length||entries.some(([stat,amount])=>amount>0 ? p.boosts[stat]<6 : p.boosts[stat]>-6);
 });
 return meaningful.length?meaningful:available;
}
function hasPendingMega(B){
 return ['p1','p2'].some(side=>!!B.getSide(side)?.activeRequest?.active?.[0]?.canMegaEvo);
}
function score(B){const a=B.getSide('p1').pokemon[0],b=B.getSide('p2').pokemon[0];
 // When both lines win or lose, survival matters: distinguish a loss after
 // taking the foe down to 10% from a loss while leaving it at full HP.
 const hpMargin=150*(a.hp/a.maxhp-b.hp/b.maxhp);
 if(B.ended)return B.winner==='Left'?10000+hpMargin:B.winner==='Right'?-10000+hpMargin:0;
 const v=p=>p.hp/p.maxhp*150+11*(p.boosts.atk+p.boosts.spa+p.boosts.spe)+6*(p.boosts.def+p.boosts.spd);
 return v(a)-v(b);
}

const policySeed=(turn,sample)=>{
 const i=sample+1,t=turn+1;
 return [11017+3701*i+131*t,23011+4219*i+337*t,33013+2749*i+271*t,41017+5563*i+193*t].map(x=>x%65536).join(',');
};
function newRngSeed(){
 const bytes=randomBytes(8);
 return [0,2,4,6].map(i=>bytes.readUInt16BE(i)).join(',');
}
function checkedRngSeed(s){
 if(s==null||s==='')return newRngSeed();
 if(typeof s!=='string'||!/^\d{1,5}(,\d{1,5}){3}$/.test(s)||s.split(',').some(x=>Number(x)>65535))
  throw Error('Invalid RNG seed');
 return s;
}

function resolveMatrix(matrix,L,R,tieMatrix){
 let bestL=L[0],bestR=R[0],bestLeft=-Infinity,bestRight=Infinity;
 let leftTie=-Infinity,rightTie=Infinity;
 const eps=0.000001;
 for(let i=0;i<L.length;i++){
  const worst=Math.min(...matrix[i]);
  const tie=tieMatrix?Math.min(...tieMatrix[i]):0;
  if(worst>bestLeft+eps||(Math.abs(worst-bestLeft)<=eps&&tie>leftTie+eps)){
   bestLeft=worst;leftTie=tie;bestL=L[i]
  }
 }
 for(let j=0;j<R.length;j++){
  const worst=Math.max(...matrix.map(row=>row[j]));
  const tie=tieMatrix?Math.max(...tieMatrix.map(row=>row[j])):0;
  if(worst<bestRight-eps||(Math.abs(worst-bestRight)<=eps&&tie<rightTie-eps)){
   bestRight=worst;rightTie=tie;bestR=R[j]
  }
 }
 return {left:bestL,right:bestR,leftValue:bestLeft,rightValue:bestRight};
}
// Pre- and post-Mega abilities can change which attacks are usable, not
// merely their power. This is ONLY a candidate-ranking heuristic; the actual
// outcomes always come from Showdown's move and ability mechanics.
function attackMatchup(B,attacker,defender,move,action=''){
 let types=attacker.getTypes(),ability=id(attacker.ability);
 if(String(action).endsWith(' mega')){
  const evolution=B.actions.canMegaEvo(attacker);
  if(evolution){
   const form=B.dex.species.get(evolution);
   if(form.exists){types=form.types;ability=id(form.abilities['0']||ability)}
  }
 }
 // Defensive type immunities also come from abilities and items.
 // The prior power-only heuristic erroneously preferred Ground moves into
 // Levitate, manufacturing 100%-win rollouts for defensive opponents.
 const defAbility=id(defender.ability);
 const defItem=id(defender.item);
 const abilityBypass=['moldbreaker','teravolt','turboblaze'].includes(ability);
 const gravity=!!B.field?.pseudoWeather?.gravity;
 const grounded=gravity||defItem==='ironball'||
  !!defender.volatiles?.smackdown||!!defender.volatiles?.ingrain;
 const abilityActive=!abilityBypass&&!defender.volatiles?.gastroacid;
 if(move.category!=='Status' && move.id!=='thousandarrows'){
  const blockedByAbility=abilityActive&&(
   (move.type==='Ground'&&defAbility==='levitate'&&!grounded)||
   (move.type==='Fire'&&defAbility==='flashfire')||
   (move.type==='Water'&&['waterabsorb','stormdrain','dryskin'].includes(defAbility))||
   (move.type==='Electric'&&['voltabsorb','lightningrod','motordrive'].includes(defAbility))||
   (move.type==='Grass'&&defAbility==='sapsipper'));
  const blockedByItem=move.type==='Ground'&&defItem==='airballoon'&&!gravity;
  if(blockedByAbility||blockedByItem)return {effectiveness:0,stab:1};
 }
 let effectiveness=1;
 for(const type of defender.getTypes()){
  // Scrappy / Mind's Eye allow Normal and Fighting hits on Ghost targets
  // only while the attacker actually has that ability.
  const ignoreGhost=type==='Ghost' && (move.type==='Normal'||move.type==='Fighting') &&
   (ability==='scrappy'||ability==='mindseye');
  if(ignoreGhost)continue;
  if(B.dex.getImmunity(move.type,type)===false)return {effectiveness:0,stab:1};
  const e=B.dex.getEffectiveness(move.type,type);
  effectiveness*=e>0?2**e:e<0?2**e:1;
 }
 return {effectiveness,stab:types.includes(move.type)?1.5:1};
}

// Values at the end of the entire searched line, not only the first turn.
// Follow-up moves use actual HP, stat boosts and consumed items from Showdown.
// Only the second ply is beam-pruned for CPU cost; the root still considers
// every legal move, including every setup option. This pruning ranks coverage
// and move roles but never scores the final result without Showdown simulation.
// A Dragon move against a fixed Fairy (or a Normal move against a Ghost)
// contributes no damage, not even an opportunity to break Disguise. When
// sampled victories all tie at zero, minimax previously picked the first
// listed attack. This protects all players/turns, not individual species.
// Conservative exceptions preserve alternate type-changing move mechanics.
const typeChangingAbilities=new Set([
 'aerilate','pixilate','refrigerate','galvanize','normalize','liquidvoice'
]);
const specialTypeMoves=new Set([
 'judgment','multiattack','technoblast','weatherball','terrainpulse',
 'revelationdance','terablast','naturalgift','hiddenpower','hiddenpowerfire',
 'flyingpress','thousandarrows','photongeyser'
]);
function provablyImmuneAttack(B,side,action){
 const enemySide=side==='p1'?'p2':'p1';
 const enemy=B.getSide(enemySide),us=B.getSide(side);
 const defender=enemy?.pokemon?.[0],attacker=us?.pokemon?.[0];
 if(!attacker||!defender||!action)return false;
 // A potential opposing Mega is not automatically an immunity escape.
 // Discard an attack only if BOTH its current typing and its possible
 // Mega typing are immune. Otherwise preserve the optional evolution branch.
 const megaAvailable=!!enemy.activeRequest?.active?.[0]?.canMegaEvo;
 const foeMega=megaAvailable?B.dex.species.get(B.actions.canMegaEvo(defender)):null;
 if(megaAvailable&&!foeMega?.exists)return false;
 if(defender.item&&['ringtarget','ironball'].includes(defender.item))return false;
 if(B.field?.pseudoWeather?.gravity||
  Object.keys(defender.volatiles||{}).some(x=>
   ['smackdown','ingrain','foresight','miracleeye'].includes(x)))return false;
 const slot=Number(String(action).match(/move (\d+)/)?.[1]||0)-1;
 const m=B.dex.moves.get(attacker.moveSlots[slot]?.id);
 // A move's onTryHit hook can have a side effect (for example breaking
 // Reflect/Light Screen) without changing immunity. Do not infer an
 // immunity bypass merely from the existence of that hook.
 // True immunity-ignoring and custom-effectiveness moves remain exempt.
 const bypass=!!m.ignoreImmunity && (m.ignoreImmunity===true||
  (typeof m.ignoreImmunity==='object'&&m.ignoreImmunity[m.type]));
 if(!m.exists||m.category==='Status'||m.basePower<=0||
   specialTypeMoves.has(m.id)||bypass||m.onEffectiveness)return false;
 let ability=attacker.ability;
 if(String(action).endsWith(' mega')){
  const evolution=B.actions.canMegaEvo(attacker);
  if(evolution){
   const form=B.dex.species.get(evolution);
   if(form.exists)ability=form.abilities['0']||ability;
  }
 }
 // Aerilate/Pixilate/Refrigerate/Galvanize only retype Normal moves;
 // Liquid Voice only retypes sound moves. Ordinary Ground attacks still
 // respect Levitate even if Mega Salamence has Aerilate.
 const modifiedType=ability==='normalize'||
  (['aerilate','pixilate','refrigerate','galvanize'].includes(id(ability))&&m.type==='Normal')||
  (id(ability)==='liquidvoice'&&m.flags?.sound);
 if(modifiedType)return false;
 if(attackMatchup(B,attacker,defender,m,action).effectiveness!==0)return false;
 // Recompute with the real species' Mega types, including cases where a
 // base-form immunity disappears or appears on optional evolution.
 return !megaAvailable||
  attackMatchup(B,attacker,{getTypes:()=>foeMega.types,
   ability:foeMega.abilities?.['0']||defender.ability,
   item:defender.item,volatiles:defender.volatiles},m,action).effectiveness===0;
}
// Encore locks a move the target has ALREADY used. When the target has
// no previous move and Encore's user must act first, its only apparent
// opening value comes from target actions with genuinely higher priority.
// Exclude priority attacks that are blocked by Psychic Terrain: opponents
// can choose a normal move instead, so speculative Encore would waste a turn.
// Do not forbid Encore after prior moves, against faster Pokémon, or against
// actual priority setup such as Protect.
function wastedOpeningEncore(B,side,action){
 const us=B.getSide(side)?.pokemon?.[0];
 const enemySide=side==='p1'?'p2':'p1';
 const target=B.getSide(enemySide)?.pokemon?.[0];
 if(!us||!target||!action||actionInfo(B,side,action).id!=='encore')return false;
 if(target.lastMove?.id||target.lastMoveUsed||target.volatiles?.encore)return false;
 if(B.field?.pseudoWeather?.trickroom)return false;
 if(us.getStat('spe')<=target.getStat('spe'))return false;
 // A Quick Claw / priority-changing ability can reverse apparent speed.
 const special=new Set(['quickclaw','custapberry','quickdraw','prankster',
  'galewings','triage','stall','myceliummight']);
 if(special.has(id(us.item))||special.has(id(target.item))||
  special.has(id(us.ability))||special.has(id(target.ability)))return false;
 const encore=B.dex.moves.get('encore'),priority=encore.priority||0;
 const active=B.getSide(enemySide)?.activeRequest?.active?.[0];
 for(const choice of active?.moves||[]){
  if(choice.disabled||choice.pp===0)continue;
  const move=B.dex.moves.get(choice.id);
  if(!move.exists||move.priority<=priority)continue;
  // Psychic Terrain prevents a grounded target from being hit by positive
  // priority attacks. The same failed move *can* be encored but is not a
  // rational opening for the opponent in a one-on-one with other options.
  if(B.field.terrain==='psychicterrain'&&move.category!=='Status'&&
   ['normal','adjacentFoe','any'].includes(move.target)&&
   typeof us.isGrounded==='function'&&us.isGrounded())continue;
  return false;
 }
 return true;
}
// Remove only a narrowly proven inferior direct-damage choice. This is not
// a generic type-chart policy: both possible opponent Mega typings, accuracy,
// physical/special category, priority, statuses and move side effects matter.
// When these preconditions fail, keep both moves in the full battle search.
function plainlyDominatedAttack(B,side,action,options){
 const user=B.getSide(side)?.pokemon?.[0];
 const otherSide=side==='p1'?'p2':'p1';
 const foe=B.getSide(otherSide)?.pokemon?.[0];
 if(!user||!foe||user.status||foe.status||B.field.weather||B.field.terrain)return false;
 const unsafeAbilities=new Set(['protean','libero','normalize','aerilate','pixilate',
  'refrigerate','galvanize','liquidvoice','wonderguard','waterabsorb',
  'stormdrain','dryskin','flashfire','sapsipper','levitate','teravolt',
  'turboblaze','moldbreaker','adaptability','technician']);
 if(unsafeAbilities.has(id(user.ability))||unsafeAbilities.has(id(foe.ability)))return false;
 const ix=Number(String(action).match(/move (\d+)/)?.[1]||0)-1;
 const move=B.dex.moves.get(user.moveSlots[ix]?.id);
 const eligible=m=>m.exists&&m.basePower>0&&m.category!=='Status'&&
  typeof m.accuracy==='number'&&!m.multihit&&!m.recoil&&!m.drain&&
  !m.selfdestruct&&!m.self&&
  !m.onBasePower&&!m.onModifyMove&&!m.onEffectiveness&&!m.onTryHit&&
  !m.flags?.charge&&!m.flags?.recharge;
 const foeDebuffOnly=m=>{
  const effects=[...(m.secondary?[m.secondary]:[]),...(m.secondaries||[])];
  return effects.every(e=>e.boosts&&Object.values(e.boosts).every(v=>v<0)&&
   !e.status&&!e.volatileStatus&&!e.self&&!e.onHit);
 };
 // Sparkling Aria's secondary only clears burns on the target.
 // If the opponent is healthy and has no Substitute option, that effect
 // cannot compensate for an inferior attack in this opening.
 const secondary=!!move.secondary||!!move.secondaries?.length;
 const ariaInert=move.id==='sparklingaria'&&!foe.status&&
  !foe.volatiles?.substitute&&
  !foe.moveSlots.some(s=>B.dex.moves.get(s.id).id==='substitute');
 if(!eligible(move)||(secondary&&!ariaInert)||
  move.id==='freeze-dry'||move.id==='thousandarrows')return false;
 const types=[foe.getTypes()];
 const evolution=B.actions.canMegaEvo(foe);
 if(evolution){const next=B.dex.species.get(evolution);if(next.exists)types.push(next.types)}
 let attackTypes=user.getTypes();
 if(String(action).endsWith(' mega')){
  const ownMega=B.actions.canMegaEvo(user);
  if(ownMega){const next=B.dex.species.get(ownMega);if(next.exists)attackTypes=next.types}
 }
 const strength=(m,defenderTypes)=>{
  let effectiveness=1;
  for(const type of defenderTypes){
   if(B.dex.getImmunity(m.type,type)===false)return 0;
   effectiveness*=2**B.dex.getEffectiveness(m.type,type);
  }
  return m.basePower*(attackTypes.includes(m.type)?1.5:1)*effectiveness*
   m.accuracy/100;
 };
 return options.some(alt=>{
  if(alt===action||String(alt).endsWith(' mega')!==String(action).endsWith(' mega'))return false;
  const ai=Number(String(alt).match(/move (\d+)/)?.[1]||0)-1;
  const better=B.dex.moves.get(user.moveSlots[ai]?.id);
  if(!eligible(better)||!foeDebuffOnly(better)||
    better.category!==move.category||better.priority!==move.priority||
    better.accuracy<move.accuracy)return false;
  // Require at least 50% greater direct threat against every legal typing.
  // Weak evidence must not erase utility moves or strategic timing choices.
  return types.every(t=>strength(better,t)>=1.5*strength(move,t)+0.00001);
 });
}
// Do not feed a deterministic failed status move into the minimax matrix.
// A player with any meaningful alternative must not repeatedly use burn,
// poison, sleep, or paralysis against a target that already has a status.
function wastedMajorStatus(B,side,action){
 const foe=B.getSide(side==='p1'?'p2':'p1')?.pokemon?.[0];
 if(!foe)return false;
 const move=B.dex.moves.get(actionInfo(B,side,action).id);
 if(move.category!=='Status'||move.target==='self'||!move.status)return false;
 return !!foe.status;
}
function strategicLegal(B,side){
 const all=legal(B,side),filtered=all.filter(a=>!provablyImmuneAttack(B,side,a)&&
  !wastedOpeningEncore(B,side,a)&&!wastedMajorStatus(B,side,a)&&
  !plainlyDominatedAttack(B,side,a,all));
 // Keep raw legal options available if there are no attacks able to hit.
 return filtered.some(a=>moveIsAttack(B,side,a))?filtered:all;
}
function avoidImmuneChoice(B,side,choice){
 if(!provablyImmuneAttack(B,side,choice)&&
  !wastedOpeningEncore(B,side,choice)&&
  !wastedMajorStatus(B,side,choice)&&
  !plainlyDominatedAttack(B,side,choice,legal(B,side)))return choice;
 const candidateMoves=strategicLegal(B,side);
 const hits=candidateMoves.filter(a=>moveIsAttack(B,side,a) &&
  !provablyImmuneAttack(B,side,a));
 if(hits.length)return usefulAttack(B,side,hits);
 return candidateMoves[0]||choice;
}
// Upgrade a tied same-move decision to Mega only when it cannot change
// typing or ability and the stats relevant to this attack do not decline.
// The rule does not interfere with beneficial delayed Megas (Sceptile),
// Scrappy-vs-Ghost timing (Kangaskhan), or non-tied outcome estimates.
function dominatesBaseOnMega(B,side,action){
 if(!action||String(action).endsWith(' mega')||
  B.field?.pseudoWeather?.trickroom)return false;
 const p=B.getSide(side)?.pokemon?.[0];
 if(!p)return false;
 const evolution=B.actions.canMegaEvo(p);
 if(!evolution)return false;
 const form=B.dex.species.get(evolution),base=p.species;
 if(!form.exists||
  p.getTypes().join(',')!==form.types.join(',')||
  p.getTypes().join(',')!==base.types.join(','))return false;
 const pre=id(p.ability),post=id(form.abilities?.['0']);
 // Flower Veil protects Grass-type allies. In a one-on-one with a non-Grass
 // user, it has no self-protective effect; Fairy Aura is a positive upgrade.
 // Standard same-ability Megas are also eligible. Weather/type-changing
 // Megas are deliberately excluded, since they may help the opponent.
 const abilitySafe=pre===post||
  (pre==='flowerveil'&&!p.getTypes().includes('Grass')&&post==='fairyaura');
 if(!abilitySafe)return false;
 return ['hp','atk','def','spa','spd','spe'].every(k=>
  Number(form.baseStats?.[k])>=Number(base.baseStats?.[k]));
}
function followChoiceBeam(B,side,actions,limit=2){
 if(actions.length<=limit)return actions;
 const active=B.getSide(side).pokemon[0];
 const foe=B.getSide(side==='p1'?'p2':'p1').pokemon[0];
 const scored=actions.map(action=>{
  const idx=Number(action.match(/move (\d+)/)?.[1]||0)-1;
  const id=active.moveSlots[idx]?.id;
  const m=B.dex.moves.get(id);
  if(!m.exists)return {action,attack:false,rank:-99};
  if(m.category==='Status'){
   const priorityStatus=new Set(['encore','taunt','protect','substitute','recover','roost',
    'swordsdance','dragondance','calmmind','nastyplot','irondefense','shellsmash',
    'bulkup','quiverdance','willowisp','toxic','leechseed']);
   return {action,attack:false,rank:priorityStatus.has(m.id)?90:20};
  }
  const {effectiveness,stab}=attackMatchup(B,active,foe,m,action);
  const rank=(m.basePower||0)*stab*effectiveness*(typeof m.accuracy==='number'?m.accuracy/100:1)+
    (m.priority>0?20:0);
  return {action,attack:true,rank};
 });
 const attacks=scored.filter(x=>x.attack).sort((a,b)=>b.rank-a.rank);
 const tactical=scored.filter(x=>!x.attack).sort((a,b)=>b.rank-a.rank);
 // Preserve both base-form and Mega versions of the next turn's useful
 // attacks and setup moves; otherwise an equal rough score erases Mega.
 if(actions.some(a=>a.endsWith(' mega'))){
  const keep=[];
  for(const mega of [false,true]){
   const variant=scored.filter(x=>x.action.endsWith(' mega')===mega);
   const hits=variant.filter(x=>x.attack).sort((a,b)=>b.rank-a.rank);
   const setup=variant.filter(x=>!x.attack).sort((a,b)=>b.rank-a.rank);
   if(hits.length)keep.push(hits[0]);
   if(setup.length)keep.push(setup[0]);
  }
  return keep.slice(0,limit).map(x=>x.action);
 }
 const keep=[];
 if(attacks.length)keep.push(attacks[0]);
 if(tactical.length&&keep.length<limit)keep.push(tactical[0]);
 for(const x of [...attacks.slice(1),...tactical.slice(1)])
  if(keep.length<limit&&!keep.includes(x))keep.push(x);
 return keep.slice(0,limit).map(x=>x.action);
}

// A full 8x8, 15-turn game tree does not fit a small Render instance.
// At full HP, opening healing is wasted. Evaluate the useful attack and
// setup branches with both base/Mega timing options, while keeping all
// second-turn choices available to the adaptive battle continuation.
function focusedSustainOpening(B,side){
 const all=strategicLegal(B,side);
 const p=B.getSide(side).pokemon[0];
 const moves=new Map();
 for(const action of all){
  const key=actionInfo(B,side,action).id;
  if(!moves.has(key))moves.set(key,[]);
  moves.get(key).push(action);
 }
 const variants=key=>moves.get(key)||[];
 const entries=[...moves.keys()].map(key=>({
  key,category:B.dex.moves.get(key).category,
  boost:isRecoverySetup(B,side,variants(key)[0]),
  heal:HEALING_MOVES.has(key),
  damage:Math.max(...variants(key).map(x=>estimatedDirectDamage(B,side,x)))
 }));
 let selected=[];
 const boosting=entries.some(x=>x.boost);
 if(boosting){
  const setup=entries.find(x=>x.boost);
  if(setup)selected.push(setup.key);
 }
 const attacks=entries.filter(x=>x.category!=='Status')
  .sort((a,b)=>b.damage-a.damage);
 selected.push(...attacks.slice(0,boosting?1:2).map(x=>x.key));
 // A long defensive matchup cannot be evaluated if burn, poison or other
 // debilitating status is removed from the root action set. In particular
 // burn halves subsequent physical damage; a short damage-only ranking
 // incorrectly discards the only way a wall survives a setup sweeper.
 const enemy=B.getSide(side==='p1'?'p2':'p1').pokemon[0];
 const physicalThreat=enemy.moveSlots.some(slot=>{
  const m=B.dex.moves.get(slot.id);
  return m.category==='Physical'&&m.basePower>=40;
 });
 if(!enemy.status&&physicalThreat){
  const statusOptions=entries.filter(x=>{
   const m=B.dex.moves.get(x.key);
   if(m.category!=='Status'||!['brn','psn','tox','par'].includes(m.status))return false;
   if(m.status==='brn'&&enemy.getTypes().includes('Fire'))return false;
   return true;
  });
  if(statusOptions.length){
   statusOptions.sort((a,b)=>{
    const value=x=>x.key==='willowisp'?2:x.key==='thunderwave'?1:0;
    return value(b)-value(a);
   });
   selected.push(statusOptions[0].key);
  }
 }
 // Once injured, recovering may be competitive even as an opening option.
 if(p.hp/p.maxhp<0.88){
  const recovery=entries.find(x=>x.heal);
  if(recovery)selected.push(recovery.key);
 }
 if(!selected.length)return all;
 // Three representative actions fit multiple completed 15-turn samples on
 // small cloud instances: Mega offense, Mega setup, and one delayed-Mega
 // comparator. Keep secondary attacks to test differing resistances.
 const chosen=[];
 for(const key of selected){
  const v=variants(key),mega=v.find(x=>x.endsWith(' mega'));
  chosen.push(mega||v[0]);
 }
 // Keep delayed-Mega options for *each* selected attack as well as setup.
 // A previous shortcut retained only the first move's base version; with a
 // boost-first build that removed base-form damage altogether. In particular
 // this can conceal the ability to break Disguise without enabling a global
 // aura that also empowers the opponent.
 for(const key of selected){
  const base=variants(key).find(x=>!x.endsWith(' mega'));
  if(base)chosen.push(base);
 }
 return chosen.length?[...new Set(chosen)]:all;
}
function evalOneTurn(position,turn,samples=2,deadline=Infinity,beamLimit=0){
 if(position.ended)return {value:score(position)};
 const L0=strategicLegal(position,'p1'),R0=strategicLegal(position,'p2');
 const L=beamLimit?followChoiceBeam(position,'p1',L0,
  L0.some(a=>a.endsWith(' mega'))?Math.max(4,beamLimit):beamLimit):L0;
 const R=beamLimit?followChoiceBeam(position,'p2',R0,
  R0.some(a=>a.endsWith(' mega'))?Math.max(4,beamLimit):beamLimit):R0;
 if(!L.length||!R.length)return {value:score(position)};
 const saved=JSON.stringify(position.toJSON());
 const matrix=Array.from({length:L.length},()=>Array(R.length).fill(0));
 for(let k=0;k<samples;k++){
  if(Date.now()>deadline)return null;
  const seed=policySeed(turn,k+13);
  for(let i=0;i<L.length;i++)for(let j=0;j<R.length;j++){
   const branch=Sim.Battle.fromJSON(saved);
   branch.resetRNG(seed);
   branch.makeChoices(L[i],R[j]);
   matrix[i][j]+=score(branch)/samples;
  }
 }
 const selected=resolveMatrix(matrix,L,R);
 return {value:selected.leftValue,left:selected.left,right:selected.right,matrix};
}
// Re-check a special-only setup in immediate physical danger with actual
// Showdown outcomes, not a short horizon's HP/stat-stage utility. This
// deliberately samples both plausible physical threats and an attacking
// continuation; it does not certify an exhaustive optimal game strategy.
function exposedPhysicalSetupAudit(B,side,selected,turn,deadline){
 if(!selected||Date.now()>=deadline)return null;
 const self=B.getSide(side).pokemon[0],enemySide=side==='p1'?'p2':'p1';
 const enemy=B.getSide(enemySide).pokemon[0];
 const move=B.dex.moves.get(actionInfo(B,side,selected).id);
 const boosts=move.boosts||move.self?.boosts||{};
 if(move.category!=='Status'||move.target!=='self'||
  !(boosts.spa>0||boosts.spd>0)||boosts.def>0||boosts.atk>0)return null;
 const attacks=strategicLegal(B,side).filter(a=>moveIsAttack(B,side,a));
 if(!attacks.length)return null;
 const attack=usefulAttack(B,side,attacks);
 const threats=strategicLegal(B,enemySide).filter(a=>{
  const m=B.dex.moves.get(actionInfo(B,enemySide,a).id);
  return m.category==='Physical'&&m.basePower>0&&
   !provablyImmuneAttack(B,enemySide,a);
 }).sort((a,b)=>estimatedDirectDamage(B,enemySide,b)-
  estimatedDirectDamage(B,enemySide,a)).slice(0,2);
 if(!threats.length)return null;
 // A special boost can only repay its lost attack on a later turn.
 // In a physical 2HKO race, the opponent can end the battle before that
 // investment pays off; compare the attacking line even at full HP.
 const physicallyExposed=legal(B,enemySide).filter(a=>moveIsAttack(B,enemySide,a))
  .every(a=>B.dex.moves.get(actionInfo(B,enemySide,a).id).category==='Physical');
 const twoTurnDamageEvidence=[];
 const saved=JSON.stringify(B.toJSON());
 const counts={setup:[],attack:[]};
 const N=48;
 for(const threat of threats){
  let tested=0,koOnHit=0,setupWins=0,attackWins=0;
  let threatTwoHit=0,attackTwoHit=0;
  for(let k=0;k<N;k++){
   if(Date.now()>deadline)return null;
   const seed=verificationSeed(turn,k,114);
   for(const [action,key] of [[selected,'setup'],[attack,'attack']]){
    const branch=Sim.Battle.fromJSON(saved);
    branch.resetRNG(seed);
    branch.makeChoices(side==='p1'?action:threat,side==='p1'?threat:action);
    const victim=branch.getSide(side).pokemon[0];
    if(key==='setup'){
     tested++;
     if(victim.hp===0)koOnHit++;
     if(victim.hp<=self.hp*0.53)threatTwoHit++;
    }else{
     const victimOnOtherSide=branch.getSide(enemySide).pokemon[0];
     if(victimOnOtherSide.hp<=enemy.hp*0.5)attackTwoHit++;
    }
    for(let step=0;step<3&&!branch.ended;step++){
     const us=usefulAttack(branch,side,legal(branch,side).filter(x=>moveIsAttack(branch,side,x)))||
      legal(branch,side)[0];
     const foe=legal(branch,enemySide).includes(threat)?threat:
      usefulAttack(branch,enemySide,legal(branch,enemySide).filter(x=>moveIsAttack(branch,enemySide,x)))||
      legal(branch,enemySide)[0];
     if(!us||!foe)break;
     branch.makeChoices(side==='p1'?us:foe,side==='p1'?foe:us);
    }
    const victor=branch.winner;
    if(victor===(side==='p1'?'Left':'Right')){
     if(key==='setup')setupWins++;else attackWins++;
    }
   }
  }
  // Weak physical attacks should not veto an observed lethal threat.
  // Compare outcomes only for actions with substantial immediate KO risk.
  // Do not use current HP percentage as a proxy for future KO danger.
  // A high-HP target can still be 2HKO'd, or lose a critical-hit race.
  // Keep a low-risk threat only when attacking wins clearly more often.
  // Use actual Showdown HP changes, including weather, auras, type
  // modifiers and critical damage. The former rough-damage heuristic
  // missed Fairy Aura and rejected this legitimate two-hit race.
  const shortPhysicalRace=physicallyExposed &&
   B.dex.moves.get(actionInfo(B,side,attack).id).category==='Special' &&
   threatTwoHit>=N*0.60 && attackTwoHit>=N*0.60;
  twoTurnDamageEvidence.push({threat,threatTwoHit,attackTwoHit,shortPhysicalRace});
  if(!shortPhysicalRace && koOnHit<tested*0.12 && attackWins-setupWins<4)continue;
  counts.setup.push(setupWins/N);
  counts.attack.push(attackWins/N);
 }
 if(!counts.setup.length)return null;
 const worstSetup=Math.min(...counts.setup),worstAttack=Math.min(...counts.attack);
 const shortPhysicalRace=twoTurnDamageEvidence.some(x=>x.shortPhysicalRace);
 return {side,from:selected,to:attack,physicalThreats:threats,
  pairedSamples:N,setupWinEstimates:counts.setup,attackWinEstimates:counts.attack,
  twoTurnDamageEvidence,shortPhysicalRace,
  applied:worstAttack>=worstSetup+1/N-1e-10 ||
   (shortPhysicalRace && worstAttack>=worstSetup-3/N-1e-10)};
}
// Cheap, mandatory fallback when time-bounded stochastic verification runs
// out. It uses Showdown's actual one-turn damage, not rough type-based power.
function immediatePhysicalRaceGuard(B,side,chosen,turn){
 if(!chosen)return null;
 const p=B.getSide(side).pokemon[0],opp=side==='p1'?'p2':'p1';
 const foe=B.getSide(opp).pokemon[0];
 const move=B.dex.moves.get(actionInfo(B,side,chosen).id);
 const boosts=move.boosts||move.self?.boosts||{};
 if(move.category!=='Status'||move.target!=='self'||
  !(boosts.spa>0||boosts.spd>0)||
  boosts.def>0||boosts.atk>0||boosts.spe>0||
  p.status||foe.status)return null;
 if(foe.moveSlots.some(s=>HEALING_MOVES.has(s.id)))return null;
 const sameMega=chosen.endsWith(' mega');
 const attacks=strategicLegal(B,side).filter(a=>
  a.endsWith(' mega')===sameMega&&moveIsAttack(B,side,a));
 const attack=usefulAttack(B,side,attacks);
 if(!attack)return null;
 const attackMove=B.dex.moves.get(actionInfo(B,side,attack).id);
 if(attackMove.category!=='Special'||attackMove.recoil||
  attackMove.multihit||attackMove.selfdestruct||
  (typeof attackMove.accuracy==='number'&&attackMove.accuracy<100))return null;
 const threats=strategicLegal(B,opp).filter(a=>{
  const m=B.dex.moves.get(actionInfo(B,opp,a).id);
  return m.category==='Physical'&&m.basePower>0;
 });
 if(!threats.length)return null;
 const state=JSON.stringify(B.toJSON()),evidence=[];
 for(const threat of threats){
  let attackHits=0,physicalHits=0;
  for(let k=0;k<4;k++){
   const seed=verificationSeed(turn,k,170);
   const direct=Sim.Battle.fromJSON(state);
   direct.resetRNG(seed);
   direct.makeChoices(side==='p1'?attack:threat,side==='p1'?threat:attack);
   const dealt=foe.hp-direct.getSide(opp).pokemon[0].hp;
   if(dealt>=foe.hp*0.52)attackHits++;
   const defended=Sim.Battle.fromJSON(state);
   defended.resetRNG(seed);
   defended.makeChoices(side==='p1'?chosen:threat,side==='p1'?threat:chosen);
   const received=p.hp-defended.getSide(side).pokemon[0].hp;
   if(received>=p.hp*0.50)physicalHits++;
  }
  evidence.push({threat,attackHits,physicalHits});
 }
 const proven=evidence.some(x=>x.attackHits>=3&&x.physicalHits>=2);
 return {from:chosen,to:attack,evidence,applied:proven};
}
function hasTacticalMove(B){
 const tactical=new Set(['swordsdance','dragondance','nastyplot','calmmind','bulkup','irondefense','agility','shellsmash',
  'coil','quiverdance','curse','cosmicpower','amnesia','stockpile','recover','roost','slackoff','softboiled',
  'shoreup','synthesis','moonlight','morningsun','wish','substitute','encore','taunt','protect',
  'rest','strengthsap','leechseed','toxic','willowisp']);
 return ['p1','p2'].some(side=>{
  const p=B.getSide(side).pokemon[0];
  return p.moveSlots.some(m=>tactical.has(m.id)) || (p.item&&B.dex.items.get(p.item).isBerry);
 });
}
function evalTwoTurn(position,turn,deadline){
 const L=strategicLegal(position,'p1'),R=strategicLegal(position,'p2');
 if(!L.length||!R.length)return null;
 const saved=JSON.stringify(position.toJSON());
 const matrix=Array.from({length:L.length},()=>Array(R.length).fill(0));
 const immediate=Array.from({length:L.length},()=>Array(R.length).fill(0));
 const samples=2;
 for(let k=0;k<samples;k++){
  const seed=policySeed(turn,k+29);
  for(let i=0;i<L.length;i++)for(let j=0;j<R.length;j++){
   if(Date.now()>deadline)return null;
   const branch=Sim.Battle.fromJSON(saved);
   branch.resetRNG(seed);
   branch.makeChoices(L[i],R[j]);
   // Secondary criterion for exactly tied long-term outcomes: if every line
   // eventually loses, prefer moves that damage the foe or improve position.
   immediate[i][j]+=score(branch)/samples;
   const future=branch.ended?score(branch):evalOneTurn(branch,turn+1,1,deadline,2)?.value;
   if(future===undefined||future===null)return null;
   matrix[i][j]+=future/samples;
  }
 }
 const selected=resolveMatrix(matrix,L,R,immediate);
 return {...selected,depth:2,matrix,immediate,L,R};
}

// Only recheck close, damaging first-turn candidates. Use paired RNG seeds,
// actual Showdown battle outcomes and optimal short-horizon follow-up actions.
// This avoids treating 1 lucky freeze in two samples as a 50% freeze chance.
function verificationSeed(turn,sample,phase=0){
 const hash=require('node:crypto').createHash('sha256')
  .update('verification-v1:'+turn+':'+sample+':'+phase).digest();
 return [0,2,4,6].map(i=>hash.readUInt16BE(i)).join(',');
}
function moveIsAttack(B,side,choice){
 const k=Number(choice.match(/move (\d+)/)?.[1]||0)-1;
 const pokemon=B.getSide(side).pokemon[0];
 const move=B.dex.moves.get(pokemon.moveSlots[k]?.id);
 return !!move.exists && move.category!=='Status';
}
function closeAttackCandidates(B,planned,side){
 const primary=side==='p2'?'right':'left';
 const acts=side==='p2'?planned.R:planned.L;
 if(!acts||acts.length<2)return [];
 const scores=acts.map((choice,index)=>{
  const col=side==='p2'?Math.max(...planned.matrix.map(row=>row[index])):
    Math.min(...planned.matrix[index]);
  return {choice,index,score:col};
 });
 scores.sort((a,b)=>side==='p2'?a.score-b.score:b.score-a.score);
 const best=scores[0];
 // Recheck only plausible close comparisons. Large decisive gaps do not
 // justify a potentially expensive extra phase.
 if(!best||!moveIsAttack(B,side,best.choice))return [];
 const candidates=scores.filter(x=>Math.abs(x.score-best.score)<=200
   &&moveIsAttack(B,side,x.choice)).slice(0,2);
 return candidates.length>=2?candidates:[];
}
function verifyChanceOutcomes(B,planned,turn,deadline){
 const right=closeAttackCandidates(B,planned,'p2');
 const left=closeAttackCandidates(B,planned,'p1');
 const side=right.length>=2?'p2':left.length>=2?'p1':null;
 if(!side)return null;
 const candidates=side==='p2'?right:left;
 const other=side==='p2'?planned.left:planned.right;
 const saved=JSON.stringify(B.toJSON());
 const stats=candidates.map(x=>({action:x.choice,wins:0,losses:0,draws:0,unfinished:0,
   hpTotal:0,firstDamage:0,samples:0,scoreTotal:0}));
 const maxSamples=24,minimum=14;
 for(let n=0;n<maxSamples;n++){
  if(Date.now()>deadline)break;
  const seed1=verificationSeed(turn,n,1);
  const seed2=verificationSeed(turn,n,2);
  for(let c=0;c<candidates.length;c++){
   if(Date.now()>deadline)break;
   const branch=Sim.Battle.fromJSON(saved);
   branch.resetRNG(seed1);
   const a=side==='p1'?candidates[c].choice:other;
   const b=side==='p2'?candidates[c].choice:other;
   branch.makeChoices(a,b);
   const target=B.getSide(side==='p1'?'p2':'p1').pokemon[0];
   const targetAfter=branch.getSide(side==='p1'?'p2':'p1').pokemon[0];
   stats[c].firstDamage+=(target.hp-targetAfter.hp)/target.maxhp;
   if(!branch.ended){
    // Use a bounded best-response evaluation, rather than a hard-coded
    // attack (e.g. Earthquake), to preserve setup/priority move interactions.
    const reply=evalOneTurn(branch,turn+1,1,deadline,2);
    if(!reply)break;
    branch.resetRNG(seed2);
    branch.makeChoices(reply.left,reply.right);
   }
   const w=branch.winner;
   const st=stats[c];
   st.samples++;
   if(branch.ended){
    if(w==='Left')st.wins++;
    else if(w==='Right')st.losses++;
    else st.draws++;
   }else st.unfinished++;
   const aP=branch.getSide('p1').pokemon[0],bP=branch.getSide('p2').pokemon[0];
   const diff=aP.hp/aP.maxhp-bP.hp/bP.maxhp;
   st.hpTotal+=diff;
   st.scoreTotal+=(w==='Left'?1:w==='Right'?-1:0)+diff*0.002;
  }
 }
 // Incomplete sampling caused by a deadline should never silently turn
 // into a decision based on one lucky freeze.
 if(stats.some(x=>x.samples<minimum)||new Set(stats.map(x=>x.samples)).size!==1)return null;
 const scoreOf=x=>x.scoreTotal/x.samples;
 stats.sort((a,b)=>side==='p2'?scoreOf(a)-scoreOf(b):scoreOf(b)-scoreOf(a));
 const leader=stats[0],runner=stats[1];
 // If the win-rate gap is too close to confidently distinguish on the
 // available budget, retain a conservative tie-break toward immediate damage
 // (no arbitrary bonus for freeze or status effects).
 if(Math.abs(scoreOf(leader)-scoreOf(runner))<0.04){
  const bestDamage=[...stats].sort((a,b)=>b.firstDamage/a.samples-a.firstDamage/b.samples);
  const margin=bestDamage[0].firstDamage/bestDamage[0].samples-
    bestDamage[1].firstDamage/bestDamage[1].samples;
  const chosen=margin>=0.04?bestDamage[0].action:null;
  return {side,chosen,samples:leader.samples,
   candidates:stats.map(x=>({action:x.action,winPct:Math.round(100*(side==='p2'?x.losses:x.wins)/x.samples),
    lostPct:Math.round(100*(side==='p2'?x.wins:x.losses)/x.samples),
    avgFirstDamagePct:Math.round(100*x.firstDamage/x.samples),n:x.samples})),ambiguous:true
  };
 }
 return {side,chosen:leader.action,samples:leader.samples,ambiguous:false,
  candidates:stats.map(x=>({action:x.action,winPct:Math.round(100*(side==='p2'?x.losses:x.wins)/x.samples),
   lostPct:Math.round(100*(side==='p2'?x.wins:x.losses)/x.samples),avgFirstDamagePct:Math.round(100*x.firstDamage/x.samples),n:x.samples}))};
}


// Multi-turn defensive survival search: no species or move-set prescriptions.
// Explore several likely opposing actions, then play up to 7 real Showdown turns,
// allowing defensive setup, recovery and chip damage to matter beyond 2-ply.
// This branch is budgeted, and only used for relevant defensive endgames.
const DEFENSE_BOOST_MOVES=new Set(['irondefense','acidarmor','cotton guard'.replace(/ /g,''),'harden','barrier','withdraw','cosmicpower','bulk up'.replace(/ /g,''),'coil','stockpile','calmmind','amnesia','quiverdance']);
const ATTACK_BOOST_MOVES=new Set(['swordsdance','dragondance','bulkup','coil','honeclaws','nastyplot','calmmind','shellsmash','quiverdance','bellydrum','growth','workup']);
const HEALING_MOVES=new Set(['roost','recover','slackoff','softboiled','shoreup','synthesis','moonlight','morningsun','milkdrink','rest','strengthsap']);
function actionInfo(B,side,action){
 const p=B.getSide(side).pokemon[0];
 const ix=Number(String(action||'').match(/move (\d+)/)?.[1]||0)-1;
 return {id:p.moveSlots[ix]?.id||'',action};
}
function strategyMove(B,side,actions,kind){
 return actions.find(a=>{
  const id=actionInfo(B,side,a).id;
  return kind==='def'?DEFENSE_BOOST_MOVES.has(id):
   kind==='atk'?ATTACK_BOOST_MOVES.has(id):HEALING_MOVES.has(id);
 });
}
function hasRealAttack(B,side){
 const p=B.getSide(side).pokemon[0];
 return p.moveSlots.some(s=>{
  const m=B.dex.moves.get(s.id);
  return m.category!=='Status' && m.basePower>0;
 });
}
function physicalPressure(B,attacker,defender){
 const p=B.getSide(attacker).pokemon[0],q=B.getSide(defender).pokemon[0];
 return p.moveSlots.some(s=>{
  const m=B.dex.moves.get(s.id);
  return m.category==='Physical' && m.basePower>=40 &&
   attackMatchup(B,p,q,m).effectiveness>0;
 });
}
// Setup + recovery endgames may need many turns before any KO happens.
// A five-turn rollout would score all such candidates as "unresolved",
// thereby discarding a real route with gradual boosts and healing.
function needsSustainHorizon(B){
 return ['p1','p2'].some(side=>{
  const own=legal(B,side),p=B.getSide(side)?.pokemon?.[0];
  if(!p||!hasRealAttack(B,side))return false;
  const hasHealing=!!strategyMove(B,side,own,'heal');
  const hasBoostWithHeal=hasHealing&&own.some(action=>{
   const m=B.dex.moves.get(actionInfo(B,side,action).id);
   const boosts=m.boosts||m.self?.boosts||{};
   return m.category==='Status'&&m.target==='self'&&
    ['atk','spa','def','spd'].some(stat=>(boosts[stat]||0)>0);
  });
  // Status + sustainable recovery is also a long-horizon strategy, even
  // without Calm Mind / Iron Defense. Pain Split changes BOTH HP totals;
  // passive Leftovers or conventional healing also sustains a wall.
  const hasStatus=own.some(action=>{
   const m=B.dex.moves.get(actionInfo(B,side,action).id);
   return m.category==='Status'&&['brn','psn','tox','par'].includes(m.status);
  });
  const sustains=hasHealing||
   own.some(action=>actionInfo(B,side,action).id==='painsplit')||
   ['leftovers','blacksludge'].includes(id(p.item));
  const foe=side==='p1'?'p2':'p1';
  return hasBoostWithHeal||(hasStatus&&sustains&&physicalPressure(B,foe,side));
 });
}
function isRecoverySetup(B,side,action){
 const actions=legal(B,side);
 if(!strategyMove(B,side,actions,'heal')||!hasRealAttack(B,side))return false;
 const m=B.dex.moves.get(actionInfo(B,side,action).id);
 const boosts=m.boosts||m.self?.boosts||{};
 return m.category==='Status'&&m.target==='self'&&
  ['atk','spa','def','spd'].some(k=>(boosts[k]||0)>0);
}
function defensePlanSide(B){
 for(const side of ['p1','p2']){
  const enemy=side==='p1'?'p2':'p1';
  const actions=legal(B,side);
  if(strategyMove(B,side,actions,'def')&&strategyMove(B,side,actions,'heal') &&
    strategyMove(B,enemy,legal(B,enemy),'atk')&&physicalPressure(B,enemy,side)&&
    hasRealAttack(B,side))return side;
 }
 return null;
}
function approximateCombatStat(p,stat){
 const base=p.storedStats[stat]||1,boost=p.boosts[stat]||0;
 return boost>=0?Math.floor(base*(2+boost)/2):
  Math.floor(base*2/(2-boost));
}
function usefulAttack(B,side,actions){
 const pokemon=B.getSide(side).pokemon[0],enemy=B.getSide(side==='p1'?'p2':'p1').pokemon[0];
 const attacks=actions.filter(a=>B.dex.moves.get(actionInfo(B,side,a).id).category!=='Status');
 let candidate=attacks[0],best=-Infinity;
 for(const a of attacks){
  const m=B.dex.moves.get(actionInfo(B,side,a).id);
  if(!m.exists)continue;
  const {effectiveness:eff,stab}=attackMatchup(B,pokemon,enemy,m,a);
  const offense=approximateCombatStat(pokemon,m.category==='Physical'?'atk':'spa');
  const defense=approximateCombatStat(enemy,m.category==='Physical'?'def':'spd');
  const critBonus=(m.critRatio||1)>1?1.12:1;
  const rank=(m.basePower||0)*eff*stab*
   Math.max(0.01,offense/Math.max(1,defense))*critBonus*(typeof m.accuracy==='number'?m.accuracy/100:1);
  if(rank>best){best=rank;candidate=a}
 }
 return candidate||actions[0];
}
// Rough damage is only a lookahead-action heuristic. Every real rollout
// still uses Pokémon Showdown for damage, type, items and ability effects.
function estimatedDirectDamage(B,side,action){
 if(!action)return 0;
 const attacker=B.getSide(side).pokemon[0],defender=B.getSide(side==='p1'?'p2':'p1').pokemon[0];
 const move=B.dex.moves.get(actionInfo(B,side,action).id);
 if(!move.exists||move.category==='Status'||move.basePower<=0)return 0;
 const {effectiveness,stab}=attackMatchup(B,attacker,defender,move,action);
 if(!effectiveness)return 0;
 const attack=approximateCombatStat(attacker,move.category==='Physical'?'atk':'spa');
 const defense=approximateCombatStat(defender,move.category==='Physical'?'def':'spd');
 const level=attacker.level||50;
 const base=Math.floor(Math.floor((Math.floor(2*level/5+2)*move.basePower*attack/Math.max(1,defense))/50)+2);
 // Type/ability checks above are only the beginning: burn halves ordinary
 // physical attacks at every boost stage. Without that modifier, the
 // continuation policy fires too early and cannot compare Dragon Dance's
 // actual value after Will-O-Wisp lands.
 const burnPenalty=attacker.status==='brn'&&move.category==='Physical'&&
  !['guts'].includes(id(attacker.ability))&&move.id!=='facade'?0.5:1;
 return Math.max(0,Math.floor(base*stab*effectiveness*0.925*burnPenalty));
}
function continuationMove(B,side){
 const actions=legal(B,side);
 if(!actions.length)return null;
 const p=B.getSide(side).pokemon[0];
 const foe=B.getSide(side==='p1'?'p2':'p1').pokemon[0];
 const heal=strategyMove(B,side,actions,'heal');
 const def=strategyMove(B,side,actions,'def');
 const atk=strategyMove(B,side,actions,'atk');
 const hp=p.hp/Math.max(1,p.maxhp);
 const physical=physicalPressure(B,side==='p1'?'p2':'p1',side);
 // Terminal progress outranks indiscriminate repeat boosting. In the old
 // sampled continuation, Leaf Blade -> Swords Dance and Swords Dance ->
 // Swords Dance incorrectly erased legitimate 2HKO/setup->KO lines.
 // A Focus Sash survival (or any near-KO) is often decided by priority:
 // a slower attacker can finish with a priority move before a faster foe
 // lands its second hit. A large projected hit is NOT a better finisher if
 // the enemy moves first and knocks us out. Prefer *only* priority attacks
 // whose conservative damage exceeds the target's remaining actual HP;
 // never use this rule against a faster priority tier or immunity.
 const foeFast=typeof p.getStat==='function' && typeof foe.getStat==='function' &&
  foe.getStat('spe')>=p.getStat('spe');
 if(foeFast){
  const guaranteedPriority=actions.filter(action=>{
   const move=B.dex.moves.get(actionInfo(B,side,action).id);
   if(!move.exists||move.category==='Status'||move.priority<=0 ||
    provablyImmuneAttack(B,side,action))return false;
   // The approximation is deliberately discounted, and the enemy is
   // already low: this cannot confuse breaking Sash with a real KO.
   return estimatedDirectDamage(B,side,action)>0 &&
    estimatedDirectDamage(B,side,action)*0.75>=foe.hp;
  }).sort((a,b)=>{
   const am=B.dex.moves.get(actionInfo(B,side,a).id),bm=B.dex.moves.get(actionInfo(B,side,b).id);
   return (bm.priority||0)-(am.priority||0)||
    (typeof bm.accuracy==='number'?bm.accuracy:100)-
    (typeof am.accuracy==='number'?am.accuracy:100);
  });
  if(guaranteedPriority.length)return guaranteedPriority[0];
 }
 const directAttack=usefulAttack(B,side,actions);
 const projected=estimatedDirectDamage(B,side,directAttack);
 if(directAttack && projected>0 && projected>=0.78*foe.hp)return directAttack;
 // Inside rollouts, don't burn a turn on a special-defense-only boost
 // when a physical attacker can imminently KO. Physical boost moves keep
 // their normal setup choices, while Showdown still resolves real outcomes.
 if(directAttack && atk){
  const ownBoost=B.dex.moves.get(actionInfo(B,side,atk).id).boosts||{};
  if((ownBoost.spa>0||ownBoost.spd>0)&&!(ownBoost.def>0||ownBoost.atk>0||ownBoost.spe>0)){
   const oppSide=side==='p1'?'p2':'p1';
   const lethalPhysical=legal(B,oppSide).some(move=>{
    const m=B.dex.moves.get(actionInfo(B,oppSide,move).id);
    return m.category==='Physical'&&m.basePower>0&&
     estimatedDirectDamage(B,oppSide,move)*1.30>=p.hp;
   });
   if(lethalPhysical)return directAttack;
  }
 }
 // Pain Split is a HP exchange, not a standard self-heal. A direct
 // damage ranking cannot capture its value when the user is substantially
 // weaker in remaining absolute HP than the target. It can also weaken an
 // opponent repeatedly using ordinary recovery.
 const split=actions.find(a=>actionInfo(B,side,a).id==='painsplit');
 if(split && p.hp>0 && foe.hp>p.hp+Math.max(18,p.maxhp*0.18) &&
   hp<0.76 && projected<0.78*foe.hp)return split;
 // Burn, unlike a one-turn damage hit, reduces the entire future physical
 // attack sequence. Apply the general mechanic only against an unstatused
 // physical threat, not against Fire types or ability/item counters.
 const burn=actions.find(a=>B.dex.moves.get(actionInfo(B,side,a).id).status==='brn');
 const burnBadAbilities=new Set(['guts','quickfeet','flareboost','magicbounce','waterveil','waterbubble','shedskin','naturalcure']);
 const physicalMoves=foe.moveSlots.some(s=>{
  const m=B.dex.moves.get(s.id);
  return m.category==='Physical'&&m.basePower>=40;
 });
 if(burn && !foe.status && physicalMoves && hp>=0.27 &&
   !foe.getTypes().includes('Fire') &&
   !burnBadAbilities.has(foe.ability) &&
   !['lumberry','rawstberry'].includes(foe.item) &&
   !foe.volatiles?.substitute)return burn;
 // Heal when actually threatened. Do not spend every full-HP turn using
 // Roost while an opponent is strengthening.
 if(heal && hp<0.57 && (!def || p.boosts.def>=foe.boosts.atk || hp<0.34))return heal;
 if(def&&physical&&p.boosts.def<6 &&
    p.boosts.def<=Math.max(foe.boosts.atk,0)+1 && hp>=0.34)return def;
 if(atk){
  const move=actionInfo(B,side,atk).id;
  const attackingBoost=p.boosts.atk + p.boosts.spa;
  const enemyDef=foe.boosts.def+foe.boosts.spd;
  if(attackingBoost<4 && hp>=0.42)return atk;
  if(attackingBoost<6 && enemyDef>=attackingBoost && hp>=0.65)return atk;
 }
 if(heal && hp<0.63)return heal;
 return usefulAttack(B,side,actions);
}
function strategicFutureScore(B,side){
 const us=B.getSide(side).pokemon[0],them=B.getSide(side==='p1'?'p2':'p1').pokemon[0];
 const sign=side==='p1'?1:-1;
 if(B.ended)return B.winner===(side==='p1'?'Left':'Right')?10000:
  B.winner ? -10000:0;
 const hpDelta=us.hp/us.maxhp-them.hp/them.maxhp;
 const attackShift=(us.boosts.atk-them.boosts.def);
 const defenseShift=(us.boosts.def-them.boosts.atk);
 // Horizon utility only for unfinished battles, not claimed win chance.
 // Survival, effective (relative) physical bulk and progress towards attacking
 // are useful when the complete long-term win probability is not observable.
 return 300*hpDelta+35*defenseShift+24*attackShift+
  18*(us.boosts.spa-them.boosts.spd)-18*(them.boosts.spa-us.boosts.spd);
}

// Prefer investing in recoverable long-term bulk while the defender is healthy,
// the physical opponent can continue boosting and Roost would sacrifice tempo.
// This is a general stage/HP/survival test, not a species-specific move override.
// Unlike a short worst-case minimax, it explicitly accepts some critical-hit
// risk if setting up is the only way to build a sustainable defensive route.
function defenseRouteOpportunity(B,side,turn){
 const own=legal(B,side),opp=side==='p1'?'p2':'p1',other=legal(B,opp);
 const defender=B.getSide(side).pokemon[0],attacker=B.getSide(opp).pokemon[0];
 const setup=strategyMove(B,side,own,'def'),recovery=strategyMove(B,side,own,'heal');
 if(!setup||!recovery||defender.boosts.def>=6 || defender.hp/defender.maxhp<0.78 ||
   !strategyMove(B,opp,other,'atk')||!physicalPressure(B,opp,side)||
   defender.boosts.def>attacker.boosts.atk+1)return null;
 const attack=usefulAttack(B,opp,other);
 if(!attack || actionInfo(B,opp,attack).id===actionInfo(B,opp,strategyMove(B,opp,other,'atk')).id)
  return null;
 const snapshot=JSON.stringify(B.toJSON());
 let survived=0, tried=0;
 for(let k=0;k<5;k++){
  const trial=Sim.Battle.fromJSON(snapshot);
  trial.resetRNG(verificationSeed(turn,k,41));
  trial.makeChoices(side==='p1'?setup:attack,side==='p2'?setup:attack);
  const p=trial.getSide(side).pokemon[0];
  survived+=p.hp>0?1:0;
  tried++;
 }
 if(survived<2)return null;
 return {side,chosen:setup,reason:'defensive-setup-before-healing',
  survivedImmediateSamples:survived,testedImmediateSamples:tried,
  defenseStage:defender.boosts.def,enemyAttackStage:attacker.boosts.atk};
}

function defensivePlanSearch(B,side,planned,turn,deadline){
 const all=legal(B,side),foeSide=side==='p1'?'p2':'p1';
 const def=strategyMove(B,side,all,'def'),heal=strategyMove(B,side,all,'heal');
 if(!def||!heal)return null;
 const own=[...new Set([def,heal,usefulAttack(B,side,all)])].filter(Boolean);
 const opposite=legal(B,foeSide),opChoice=side==='p1'?planned.right:planned.left;
 const boost=strategyMove(B,foeSide,opposite,'atk');
 const hit=usefulAttack(B,foeSide,opposite);
 const opponent=[...new Set([opChoice,boost,hit])].filter(Boolean);
 const weights=opponent.map(a=>a===opChoice?0.52:a===boost?0.32:0.16);
 const total=weights.reduce((a,b)=>a+b,0);
 const saved=JSON.stringify(B.toJSON());
 const stats=own.map(action=>({action,value:0,finished:0,wins:0,losses:0,count:0}));
 const maxSamples=6,minSamples=4;
 for(let sample=0;sample<maxSamples;sample++){
  if(Date.now()>deadline)break;
  const seed=verificationSeed(turn,sample,19);
  for(let oi=0;oi<opponent.length;oi++){
   if(Date.now()>deadline)break;
   for(let ci=0;ci<own.length;ci++){
    if(Date.now()>deadline)break;
    const battleBranch=Sim.Battle.fromJSON(saved);
    battleBranch.resetRNG(seed);
    battleBranch.makeChoices(side==='p1'?own[ci]:opponent[oi],
      side==='p2'?own[ci]:opponent[oi]);
    for(let step=0;step<13&&!battleBranch.ended;step++){
     if(Date.now()>deadline)break;
     const l=continuationMove(battleBranch,'p1');
     const r=continuationMove(battleBranch,'p2');
     if(!l||!r)break;
     battleBranch.makeChoices(l,r);
    }
    const value=strategicFutureScore(battleBranch,side);
    const wt=weights[oi]/total;
    const st=stats[ci];st.value+=wt*value;st.count+=wt;
    if(battleBranch.ended){
     st.finished+=wt;
     if(value>0)st.wins+=wt;else if(value<0)st.losses+=wt;
    }
   }
  }
 }
 if(stats.some(x=>x.count<minSamples-0.01))return null;
 const rank=stats.map(x=>({action:x.action,value:x.value/x.count,
  observedWinRate:x.wins/x.count,observedLossRate:x.losses/x.count,
  testedSamples:Math.round(x.count)})).sort((a,b)=>b.value-a.value);
 return {side,chosen:rank[0].action,depth:14,candidates:rank,
  sampledOpponentActions:opponent};
}


// Probabilistic attack-race audit for high-variance opening moves. The regular
// minimax planner remains responsible for setup, heal and defensive endgames.
// Score *finished battles*, not an immediate HP differential or two lucky rolls.
// Paired, independent seeded rollouts reduce variance; incomplete simulations
// never count as a win. This is an estimate, not exhaustive exact enumeration.
function probabilisticRaceSide(B){
 for(const side of ['p1','p2']){
  const actions=legal(B,side),opposite=side==='p1'?'p2':'p1';
  const attacks=actions.filter(a=>moveIsAttack(B,side,a));
  if(attacks.length<2||!legal(B,opposite).some(a=>moveIsAttack(B,opposite,a)))continue;
  const foe=B.getSide(opposite).pokemon[0];
  const highVariance=attacks.some(a=>{
   const m=B.dex.moves.get(actionInfo(B,side,a).id);
   return !!(m.flags?.recharge||m.flags?.charge||m.self?.volatileStatus==='mustrecharge'||
    (typeof m.accuracy==='number'&&m.accuracy<100)||m.critRatio>1);
  });
  if(highVariance)return {side,attacks};
 }
 return null;
}
// Cheap, state-dependent tactical policy used *only inside* probability
// rollouts. Unlike single-seed minimax it never treats a priority move's
// tiny non-KO chip as protection against a faster finishing attack.
// Fast upper bound to skip expensive priority-KO probes when a target
// obviously survives. This is a screen only: Showdown still decides combat.
function upperAttackBound(B,side,action){
 const us=B.getSide(side).pokemon[0],them=B.getSide(side==='p1'?'p2':'p1').pokemon[0];
 const m=B.dex.moves.get(actionInfo(B,side,action).id);
 if(!m.exists||!m.basePower)return 0;
 const phys=m.category==='Physical';
 const attack=approximateCombatStat(us,phys?'atk':'spa');
 const defense=approximateCombatStat(them,phys?'def':'spd');
 const base=(Math.floor(22*m.basePower*attack/Math.max(1,defense)/50)+2);
 const {effectiveness,stab}=attackMatchup(B,us,them,m,action);
 const mult=stab*effectiveness;
 if(!effectiveness)return 0;
 // 1.5 critical multiplier plus a generous allowance for items/abilities.
 return Math.ceil(base*mult*2.1);
}

function raceFollowupChoice(B,side,turn){
 const all=legal(B,side),hits=all.filter(a=>moveIsAttack(B,side,a));
 if(!hits.length)return all[0]||null;
 const baseline=usefulAttack(B,side,hits);
 const priorities=hits.filter(a=>{
  const m=B.dex.moves.get(actionInfo(B,side,a).id);
  const base=B.dex.moves.get(actionInfo(B,side,baseline).id);
  return m.priority>base.priority;
 });
 if(!priorities.length)return baseline;
 const enemySide=side==='p1'?'p2':'p1';
 for(const priority of priorities){
  const target=B.getSide(side==='p1'?'p2':'p1').pokemon[0];
  if(target.hp>upperAttackBound(B,side,priority))continue;
  let willKO=0;
  const snapshot=JSON.stringify(B.toJSON());
  for(let n=0;n<1;n++){
   const probe=Sim.Battle.fromJSON(snapshot);
   probe.resetRNG(verificationSeed(turn,n,88));
   const other=usefulAttack(probe,enemySide,
    legal(probe,enemySide).filter(a=>moveIsAttack(probe,enemySide,a)))||
    legal(probe,enemySide)[0];
   if(!other)continue;
   probe.makeChoices(side==='p1'?priority:other,side==='p2'?priority:other);
   if(probe.getSide(enemySide).pokemon[0].hp===0)willKO++;
  }
  if(willKO>0)return priority;
 }
 return baseline;
}


function probabilisticAttackSearch(B,planned,turn,deadline){
 if(!probabilisticRaceSide(B))return null;
 return sampledRace(B,planned,turn,deadline,{Sim,legal:strategicLegal,seed:verificationSeed,resolveMatrix,
  followup:(branch,side,t)=>legal(branch,side).some(a=>!moveIsAttack(branch,side,a))?continuationMove(branch,side):
   raceFollowupChoice(branch,side,t)});
}

function simulation(a,b,depth=120,rngSeed){
 depth=Number.isInteger(depth)?Math.min(250,Math.max(1,depth)):120;
 const actualSeed=checkedRngSeed(rngSeed);
 const B=battle(a,b,actualSeed),choices=[];
 const started=Date.now(),globalDeadline=started+30000;
 let stopReason='',planned=0,fallbacks=0,extendedSearchCount=0;
 const decisionDetails=[];
 const sustainedSides=new Set();
 for(let t=0;t<depth&&!B.ended;t++){
  if(Date.now()>globalDeadline){stopReason='compute_timeout';break}
  const L=legal(B,'p1'),R=legal(B,'p2');
  if(!L.length||!R.length){stopReason='no_available_actions';break}
  const megaPending=hasPendingMega(B);
  let choice=null,depthUsed=1,verification=null,longPlan=null,attackAudit=null,exactSearch=null,tacticalProbability=null,megaTimingAudit=null,attackAttempted=false;
  // Once a long-horizon Monte Carlo route has demonstrated a material win
  // chance from boosting + recovery, use its tested adaptive continuation
  // policy. A 1-2 turn HP-only search otherwise discards the very strategy
  // whose full sampled battle won. The opposing side still gets a fresh
  // independent one-turn best response on every subsequent turn.
  // Status-based walls remain strategic AFTER successfully applying burn
  // or another lasting status. The original route registration only retained
  // setup + healing plans with >=60% wins versus every possible opening;
  // that failed when the opponent had an opening Taunt but chose Knock Off.
  // Once status is actually present, condition on the observed state rather
  // than on the counterfactual Taunt line from turn one.
  if(t>0)for(const side of ['p1','p2']){
   const opp=side==='p1'?'p2':'p1';
   const own=B.getSide(side).pokemon[0],enemy=B.getSide(opp).pokemon[0];
   const canSustain=own.moveSlots.some(slot=>slot.id==='painsplit'||
    HEALING_MOVES.has(slot.id))||['leftovers','blacksludge'].includes(id(own.item));
   const hasStatusOption=own.moveSlots.some(slot=>
    ['brn','psn','tox','par'].includes(B.dex.moves.get(slot.id).status));
   if(canSustain&&hasStatusOption&&
    ['brn','psn','tox','par'].includes(enemy.status)&&
    physicalPressure(B,opp,side))sustainedSides.add(side);
  }
  if(t>0 && sustainedSides.size){
   // Re-plan BOTH players' turns with the same long-horizon policy that
   // evaluated the opening. Previously the defender used its long-horizon
   // continuation while the opponent reverted to a 1-ply HP/boost score:
   // full-HP Roost spam looked good, but never led to a winning attack.
   // All legal followups remain adaptive to remaining PP, status and HP.
   const longReplies=sampledRace(B,null,t,
    Math.min(Date.now()+1600,globalDeadline-950),{
    Sim,legal:strategicLegal,seed:verificationSeed,resolveMatrix,
    followup:continuationMove,maxSamples:12,minSamples:4,followupTurns:12
   });
   if(longReplies?.left&&longReplies?.right){
    choice={left:longReplies.left,right:longReplies.right};
    // Rolling-horizon searches may keep promising to apply a disable or
    // invest in offense "next turn", without EVER doing so. The next turn
    // then recomputes the same tie and picks the first attack/Heal again.
    // Prefer the adaptive continuation used INSIDE the successful rollout
    // if its completed worst-case win rate is statistically indistinguishable
    // from the newly selected action (<=5 percentage points). This is not
    // a per-species script and cannot override a clear win-rate difference.
    for(const [side,field,actions] of [
     ['p1','left',longReplies.leftActions],
     ['p2','right',longReplies.rightActions]]){
     const baseline=continuationMove(B,side);
     const proposed=choice[field],i=actions.indexOf(baseline),j=actions.indexOf(proposed);
     if(!baseline||i<0||j<0||baseline===proposed)continue;
     const worst=index=>side==='p1'?
      Math.min(...longReplies.payoff[index].map(x=>x.winPct)):
      Math.min(...longReplies.payoff.map(row=>row[index].lossPct));
     if(worst(i)>=worst(j)-5.0001)choice[field]=baseline;
    }
    depthUsed=12;
   }else{
    const l=continuationMove(B,'p1'),r=continuationMove(B,'p2');
    if(l&&r){choice={left:l,right:r};depthUsed=12}
   }
  }
  // A certified opening uses all outcome probabilities, not sampled seeds.
  // Unknown suffixes are [0,1] bounds, so only a provable pure equilibrium is
  // allowed to override the existing planner. Other mechanics use the fallback.
  if(!choice && !megaPending && t<4 && Date.now()<globalDeadline-9000){
   exactSearch=exactAttackRace(B,{Sim,horizon:3,
    deadline:Math.min(Date.now()+(t===0?5000:2000),globalDeadline-8000)});
   if(exactSearch?.certified){
    choice={left:exactSearch.left,right:exactSearch.right};depthUsed=3;
   }
  }
  if(!choice && !megaPending && t<4 && Date.now()<globalDeadline-4500){
   tacticalProbability=makeTacticalSearch(B,{Sim,horizon:2,
    deadline:Math.min(Date.now()+(t===0?18000:4000),globalDeadline-3000)});
   if(tacticalProbability?.applicable){
    const policyRoll=side=>require('node:crypto').createHash('sha256')
     .update('separate-policy-stream:'+actualSeed+':'+t+':'+side).digest().readUInt32BE(0)/4294967296;
    choice={left:choosePolicy(tacticalProbability.leftActions,tacticalProbability.leftPolicy,policyRoll('p1')),
     right:choosePolicy(tacticalProbability.rightActions,tacticalProbability.rightPolicy,policyRoll('p2'))};
    tacticalProbability.applied=true;depthUsed=tacticalProbability.horizon;
   }else if(tacticalProbability && t===0){
    stopReason='probability_search_incomplete';
    decisionDetails.push({turn:1,depth:0,left:null,right:null,tacticalProbability});break;
   }
  }
  // High-variance direct attack races need stochastic terminal outcomes BEFORE
  // the legacy two-sample 2-turn planner can bias the choice. Keep long-term
  // defense/setup scenarios on the tactical planner below.
  const openingRace=t===0 && !megaPending && !defensePlanSide(B)?probabilisticRaceSide(B):null;
  if(!choice && openingRace && Date.now()<globalDeadline-9500){
   const shallow=evalOneTurn(B,t,4,globalDeadline-9500);
   if(shallow){
    const provisional={left:shallow.left,right:shallow.right};
    // Two-move attack races get a larger budget. For full four-move
    // sets, return to the proven basic planner sooner, preserving enough
    // wall time to actually finish the battle after choosing an opener.
    const rolloutBudget=openingRace.attacks.length<=2?9000:4100;
    attackAttempted=true;
    attackAudit=probabilisticAttackSearch(B,provisional,t,
     Math.min(Date.now()+rolloutBudget,globalDeadline-8000));
    if(attackAudit?.chosen){
     choice={left:attackAudit.left,right:attackAudit.right};depthUsed=3;
     attackAudit.applied=true;
    }else{fallbacks++;if(attackAudit)attackAudit.applied=false}
   }
  }

  // A short HP-only horizon can select tiny priority chip instead of a
  // probable knockout. Estimate actual finished Showdown battle outcomes
  // across every (move, optional Mega) simultaneous opening pair first.
  if(!choice && megaPending && t===0 && Date.now()<globalDeadline-11500){
   // Render free instances can complete only ~5-14 paired rounds in 10s.
   // Never discard those observed joint battle outcomes and then silently
   // promote a lucky 1-turn HP/flinch roll to an "optimal" decision.
   // Four paired rounds are a PROVISIONAL decision, not a win-rate proof.
   const configuredCap=Number(process.env.MEGA_TIMING_MAX_SAMPLES);
   const maxMegaSamples=Number.isFinite(configuredCap)&&configuredCap>=4?
    Math.max(4,Math.min(48,Math.floor(configuredCap))):48;
   const sustain=needsSustainHorizon(B);
   megaTimingAudit=sampledRace(B,null,t,
    Math.min(Date.now()+10000,globalDeadline-9000),
    {Sim,legal:sustain?focusedSustainOpening:strategicLegal,seed:verificationSeed,
     maxSamples:sustain?Math.min(24,maxMegaSamples):maxMegaSamples,
     minSamples:sustain?2:4,followupTurns:sustain?15:5,resolveMatrix,
     attackDamageTieBreak:true,preferMegaTie:dominatesBaseOnMega,
     preferSustainTie:isRecoverySetup,
     followup:(branch,side)=>continuationMove(branch,side)});
   if(megaTimingAudit){megaTimingAudit.sustainHorizon=sustain?15:5;
    megaTimingAudit.openingCandidateMethod=sustain?'focused-recovery-setup-vs-attack':'complete';}
   if(megaTimingAudit)megaTimingAudit.lowSampleWarning=megaTimingAudit.samples<24;
   const decisive=megaTimingAudit?.payoff?.some(row=>row.some(cell=>cell.winPct+cell.lossPct>0));
   if(megaTimingAudit?.chosen && decisive){
    choice={left:megaTimingAudit.left,right:megaTimingAudit.right};
    depthUsed=megaTimingAudit.sustainHorizon||5;megaTimingAudit.applied=true;
    // Only retain a setup/recovery route with >=60% completed wins even
    // against its worst observed opposing opener. Never commit to a route
    // from unresolved horizons, or from a selected direct attack.
    if(sustain && megaTimingAudit.samples>=2){
     const matrix=megaTimingAudit.payoff;
     for(const [side,field,actions] of [
      ['p1','left',megaTimingAudit.leftActions],
      ['p2','right',megaTimingAudit.rightActions]]){
      const selected=choice[field],at=actions.indexOf(selected);
      if(at<0||!strategyMove(B,side,strategicLegal(B,side),'heal'))continue;
      const m=B.dex.moves.get(actionInfo(B,side,selected).id);
      const boosts=m.boosts||m.self?.boosts||{};
      if(m.category!=='Status'||m.target!=='self'||
       !['atk','spa','def','spd'].some(k=>(boosts[k]||0)>0))continue;
      const worst=side==='p1'?Math.min(...matrix[at].map(v=>v.winPct)):
       Math.min(...matrix.map(row=>row[at].lossPct));
      if(worst>=60)sustainedSides.add(side);
     }
    }
   }else if(megaTimingAudit)megaTimingAudit.applied=false;
   // A selected long-horizon attack can depend on applying a disabling
   // status later. Previously only boosting + conventional recovery retained
   // the tested continuation, so the actual next turns abandoned burn and
   // Pain Split and repeatedly used an attack. Preserve the *same* adaptive
   // policy for defensive status + sustain routes with measured wins.
   if(megaTimingAudit?.applied && sustain && megaTimingAudit.samples>=2){
    for(const [side,field,actions] of [
     ['p1','left',megaTimingAudit.leftActions],
     ['p2','right',megaTimingAudit.rightActions]]){
     const user=B.getSide(side).pokemon[0],enemySide=side==='p1'?'p2':'p1';
     const usefulStatus=user.moveSlots.some(slot=>{
      const m=B.dex.moves.get(slot.id);
      return m.category==='Status'&&['brn','psn','tox','par'].includes(m.status);
     });
     const sustainOptions=user.moveSlots.some(slot=>slot.id==='painsplit'||
      HEALING_MOVES.has(slot.id))||['leftovers','blacksludge'].includes(user.item);
     if(!usefulStatus||!sustainOptions||!physicalPressure(B,enemySide,side))continue;
     const chosen=choice[field],actionIndex=actions.indexOf(chosen);
     if(actionIndex<0)continue;
     const worstWin=side==='p1'?
      Math.min(...megaTimingAudit.payoff[actionIndex].map(cell=>cell.winPct)):
      Math.min(...megaTimingAudit.payoff.map(row=>row[actionIndex].lossPct));
     if(worstWin>=60)sustainedSides.add(side);
    }
   }
  }
  // Planning runs when set-up, healing, disabling or a consumable Berry may
  // change the outcome across turns. Budgeted to preserve Render responsiveness.
  if(!choice && t<6 && (hasTacticalMove(B)||megaPending) && Date.now()-started<10000){
   const deadline=Math.min(Date.now()+6500,globalDeadline-2200);
   const deep=evalTwoTurn(B,t,deadline);
   if(deep){
    choice=deep;depthUsed=2;planned++;
    if(t<2 && !megaPending && !probabilisticRaceSide(B) && Date.now()<globalDeadline-3500){
     verification=verifyChanceOutcomes(B,deep,t,Math.min(Date.now()+6500,globalDeadline-900));
     if(verification?.chosen){
      if(verification.side==='p1')choice.left=verification.chosen;
      if(verification.side==='p2')choice.right=verification.chosen;
     }
    }
   }
   else fallbacks++;
  }
  if(!choice){
   const shallow=evalOneTurn(B,t,t<3?8:t<20?4:2,globalDeadline-500);
   if(!shallow){stopReason='compute_timeout';break}
   choice={left:shallow.left,right:shallow.right};
  }
  let counterfactual;
  if(t<6 && depthUsed===2 && choice.matrix && choice.L?.includes(choice.left) && choice.R?.includes(choice.right)){
   const i=choice.L.indexOf(choice.left),j=choice.R.indexOf(choice.right);
   const row=choice.matrix[i],alternatives=choice.R.map((action,index)=>({action,index,value:row[index]}))
     .sort((a,b)=>a.value-b.value);
   const reactive=alternatives[0];
   if(reactive.action!==choice.right){
    const threatIndex=choice.matrix.reduce((best,r,k)=>r[j]>choice.matrix[best][j]?k:best,0);
    const reactiveIndex=reactive.index;
    const threatIfReactIndex=choice.matrix.reduce((best,r,k)=>r[reactiveIndex]>choice.matrix[best][reactiveIndex]?k:best,0);
    counterfactual={
     side:'p2',bestAgainstChosen:reactive.action,
     relativeScoreGain:Math.round(choice.matrix[i][j]-reactive.value),
     opponentThreatIfReactive:choice.L[threatIfReactIndex],
     currentWorstThreat:choice.L[threatIndex]
    };
   }
   // Same conditional view for p1, which maximizes evaluation.
   const col=choice.matrix.map(row=>row[j]);
   const bestIndex=col.indexOf(Math.max(...col));
   if(!counterfactual && choice.L[bestIndex]!==choice.left)
    counterfactual={side:'p1',bestAgainstChosen:choice.L[bestIndex],
     relativeScoreGain:Math.round(col[bestIndex]-col[i])};
  }
  // Search farther in setup-vs-sustain matchups: scarce victory paths can
  // require several defense boosts, recovery and chip, not 2-turn HP gains.
  const defenseSide=!megaPending && t<6 && Date.now()<globalDeadline-2200?defensePlanSide(B):null;
  if(defenseSide){
   longPlan=defenseRouteOpportunity(B,defenseSide,t);
   if(!longPlan && extendedSearchCount<1 && Date.now()<globalDeadline-3800){
    extendedSearchCount++;
    longPlan=defensivePlanSearch(B,defenseSide,choice,t,
      Math.min(Date.now()+4100,globalDeadline-900));
   }
   if(longPlan?.chosen){
    if(defenseSide==='p1')choice.left=longPlan.chosen;
    else choice.right=longPlan.chosen;
   }
  }
  // Probabilistic checks override only well-separated attack choices,
  // leaving the existing tactical planner and defensive setup untouched.
  if(t===0 && !megaPending && !exactSearch?.certified && !tacticalProbability?.applied && !attackAttempted && !longPlan && Date.now()<globalDeadline-3800){
   const auditDeadline=Math.min(Date.now()+7500,globalDeadline-900);
   attackAudit=probabilisticAttackSearch(B,choice,t,auditDeadline);
   if(attackAudit?.chosen){
    attackAudit.applied=true;
    if(attackAudit.side==='p1'){
     choice.left=attackAudit.chosen;
     if(attackAudit.comparedAgainst)choice.right=attackAudit.comparedAgainst;
    }else{
     choice.right=attackAudit.chosen;
     if(attackAudit.comparedAgainst)choice.left=attackAudit.comparedAgainst;
    }
   }
  }
  // A special-defense-only boost cannot blunt a lethal physical hit.
  // Before executing a high-risk setup, compare real finish probabilities
  // against the opponent's strongest physical attacks.
  let exposedSetupAudit=null;
  if(t<4 && Date.now()<globalDeadline-2200){
   for(const [side,field] of [['p1','left'],['p2','right']]){
    const audit=exposedPhysicalSetupAudit(B,side,choice[field],t,
      Math.min(Date.now()+1800,globalDeadline-950));
    if(audit){
     if(audit.applied)choice[field]=audit.to;
     (exposedSetupAudit??=[]).push(audit);
    }
   }
  }
  // Run this compact mechanical guard even when Monte Carlo has exhausted
  // its deadline, to avoid choosing setup from untested HP-only heuristics.
  const fastRaceGuard=[];
  if(t<5)for(const [side,field] of [['p1','left'],['p2','right']]){
   const check=immediatePhysicalRaceGuard(B,side,choice[field],t);
   if(check){
    if(check.applied)choice[field]=check.to;
    fastRaceGuard.push({side,...check});
   }
  }
  // Certified/sampled planners may still return tied all-loss actions.
  // Never execute a known type-immune attack when a real hit is possible.
  const oldLeft=choice.left,oldRight=choice.right;
  choice.left=avoidImmuneChoice(B,'p1',choice.left);
  choice.right=avoidImmuneChoice(B,'p2',choice.right);
  const immunityCorrection=[
   ...(oldLeft!==choice.left?[{side:'p1',from:oldLeft,to:choice.left}]:[]),
   ...(oldRight!==choice.right?[{side:'p2',from:oldRight,to:choice.right}]:[])
  ];
  B.makeChoices(choice.left,choice.right);
  choices.push([choice.left,choice.right]);
  if(t<6)decisionDetails.push({turn:t+1,depth:depthUsed,left:choice.left,right:choice.right,
   ...(sustainedSides.size?{sustainRoute:[...sustainedSides]}:{}),megaTimingConsidered:megaPending,
   ...(fastRaceGuard.length?{fastRaceGuard}:{}),
   ...(exposedSetupAudit?{exposedSetupAudit}:{}),
   ...(immunityCorrection.length?{immunityCorrection}:{}),...(exactSearch?{exactSearch}:{}),...(tacticalProbability?{tacticalProbability}:{}),...(megaTimingAudit?{megaTimingAudit}:{}),...(counterfactual?{counterfactual}:{}),...(verification?{verification}:{}),...(longPlan?{longPlan}:{}),...(attackAudit?{attackAudit}:{})});
 }
 if(!B.ended&&!stopReason)stopReason=choices.length>=depth?'turn_limit':'other';
 return {
  winner:B.ended?(B.winner||'draw'):'unresolved',
  stopReason:B.ended?'battle_ended':stopReason,
  policy:'bounded-probability-game-with-tactical-fallback',
  tacticalTurns:planned,searchFallbacks:fallbacks,decisionDetails,
  rngSeed:actualSeed,log:B.log,
  choices,turns:choices.length,maxTurns:depth
 };
}

function page(){return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>챔피언즈 싱글 대면 실험실</title><style>body{font-family:system-ui;background:#0c1220;color:#e8eef9;max-width:840px;margin:auto;padding:20px}h1{font-size:25px}section{background:#182238;border:1px solid #34425d;border-radius:16px;padding:18px;margin:16px 0}input,select,button,textarea{box-sizing:border-box;width:100%;background:#10192b;color:#e8eef9;border:1px solid #40516d;border-radius:8px;padding:10px;margin:5px 0}button{background:#426cf2;border:0;font-weight:bold;cursor:pointer}label{font-size:13px;color:#b6c4dc}.grid{display:grid;grid-template-columns:1fr 1fr;gap:15px}@media(max-width:650px){.grid{grid-template-columns:1fr}}.muted{color:#b6c4dc;font-size:13px}pre{white-space:pre-wrap;overflow:auto}</style></head><body><h1>챔피언즈 1대1 대면 분석기</h1><p class="muted">쇼다운 챔피언즈 싱글 배틀 엔진 · 실험용 자동 행동 정책 (승률/랭킹 정확도 미검증)</p><div class="grid"><section><h2>A 샘플</h2><textarea id="a" rows="13"></textarea></section><section><h2>B 샘플</h2><textarea id="b" rows="13"></textarea></section></div><section><button id="run">1대1 자동 대면 계산</button><pre id="result"></pre><details><summary>지원 데이터 검색</summary><input id="q" placeholder="English Pokémon / Move / Item"><pre id="matches"></pre></details></section><script>
const examples=${JSON.stringify(samples)};
document.getElementById('a').value=JSON.stringify(examples[0],null,2);document.getElementById('b').value=JSON.stringify(examples[1],null,2);
document.getElementById('run').onclick=async()=>{const out=document.getElementById('result');out.textContent='계산 중...';try{const r=await fetch('/api/duel',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({a:JSON.parse(document.getElementById('a').value),b:JSON.parse(document.getElementById('b').value)})});const v=await r.json();out.textContent=r.ok?JSON.stringify(v,null,2):'오류: '+v.error}catch(e){out.textContent='오류: '+e.message}};
let catalog;
document.getElementById('q').oninput=async e=>{if(!catalog)catalog=await(await fetch('/api/catalog')).json();const q=e.target.value.toLowerCase();document.getElementById('matches').textContent=q.length<2?'':JSON.stringify(Object.fromEntries(Object.entries(catalog).map(([k,v])=>[k,v.filter(x=>x.toLowerCase().includes(q)).slice(0,12)])),null,2)};
</script></body></html>`}

const koData=dex.loadTextData('ko');
// The source's Korean text may localize "baseSpecies" or "forme" without
// localizing "name", especially for gendered and regional forms.
const verifiedKoreanBaseExceptions=localized.baseOverrides;
const nativeBaseName=(english)=>{
 const species=dex.species.get(english);
 const ancestor=dex.species.get(species.baseSpecies||english);
 for(const obj of [species,ancestor]){
  const data=koData.Pokedex?.[obj.id]||{};
  if(data.name&&/[가-힣]/.test(data.name))return data.name;
  if(data.baseSpecies&&/[가-힣]/.test(data.baseSpecies))return data.baseSpecies;
 }
 return verifiedKoreanBaseExceptions[ancestor.id]||null;
};
const megaSuffix=(forme)=>{
 const m=/^Mega(?:-([XYZ]))?$/i.exec(forme||'');
 return m?(m[1]||''):'';
};
const koName=(type,obj)=>{
 const data=koData[type]?.[obj.id]||{};
 const official=data.name;
 if(official&&/[가-힣]/.test(official))return official;
 if(type==='Pokedex'&&obj.isMega){
  // Some Korean mega-form labels exist only in the "forme" field, and
  // include important distinctions such as male/female, color, and posture.
  if(data.forme&&/[가-힣]/.test(data.forme)&&data.forme.startsWith('메가'))return data.forme;
  const base=nativeBaseName(obj.baseSpecies);
  if(base){
   if(/^Mega(?:-[XYZ])?$/i.test(obj.forme||'')){
    return '메가'+base+megaSuffix(obj.forme);
   }
   // Unlocalized irregular Mega-form labels are kept distinguishable.
   const variant=(obj.forme||'').replace(/-?Mega$/i,'').replace(/^Mega-?/i,'');
   return '메가'+base+(variant?' ('+variant+')':'');
  }
 }
 if(type==='Items'&&obj.megaStone&&typeof obj.megaStone==='object'){
  const pairs=Object.entries(obj.megaStone);
  if(pairs.length){
   const bases=[...new Set(pairs.map(([en])=>nativeBaseName(en)))];
   const targets=pairs.map(([,target])=>dex.species.get(target));
   if(bases.length===1&&bases[0]&&targets.every(t=>t.exists&&t.isMega)){
    const suffixes=[...new Set(targets.map(t=>megaSuffix(t.forme)))];
    const suffix=suffixes.length===1?suffixes[0]:'';
    return bases[0]+'나이트'+suffix;
   }
  }
 }
 if(type==='Pokedex'){
  const base=nativeBaseName(obj.baseSpecies);
  const generated=localized.fallbackFormName(obj,data,base);
  if(generated)return generated;
 }
 const substitutions={Items:localized.itemOverrides,Moves:localized.moveOverrides,
  Abilities:localized.abilityOverrides};
 if(substitutions[type]?.[obj.id])return substitutions[type][obj.id];
 return official||obj.name;
};
const abilityList=(s)=>[...new Set(Object.values(s.abilities||{}))].filter(Boolean).map(en=>{
 const x=dex.abilities.get(en);return {id:x.id,en:x.name,ko:koName('Abilities',x)};
});
// The Showdown custom-game dex also contains CAP fan Pokémon and CAP-only
// mechanics. Keep the Champions sample picker limited to official content.
const unofficialCatalogIds={
 Moves:new Set(['nihillight','paleowave','shadowstrike','polarflare']),
 Items:new Set(['crucibellite','vilevial']),
 Abilities:new Set(['auraguard','mountaineer','rebound','persistent','noability'])
};
const catalog={
 species:dex.species.all().filter(x=>x.exists&&x.num>0).map(x=>({
   id:x.id,en:x.name,ko:koName('Pokedex',x),
   isMega:!!x.isMega,baseSpecies:x.baseSpecies,
   abilities:abilityList(x),
   baseAbilities:x.isMega?abilityList(dex.species.get(x.baseSpecies)):[],
   megaItem:x.isMega?(x.requiredItem||x.requiredItems?.[0]||''):''
 })),
 moves:dex.moves.all().filter(x=>x.exists&&!unofficialCatalogIds.Moves.has(x.id))
  .map(x=>({id:x.id,en:x.name,ko:koName('Moves',x)})),
 items:dex.items.all().filter(x=>x.exists&&!unofficialCatalogIds.Items.has(x.id))
  .map(x=>({id:x.id,en:x.name,ko:koName('Items',x)})),
 abilities:dex.abilities.all().filter(x=>x.exists&&!unofficialCatalogIds.Abilities.has(x.id))
  .map(x=>({id:x.id,en:x.name,ko:koName('Abilities',x)}))
};
if(require.main===module)console.log('[CATALOG]',Object.fromEntries(Object.entries(catalog).map(([k,v])=>[k,v.length])));
const translationAudit=(()=>{
 const allMega=dex.species.all().filter(x=>x.exists&&x.isMega&&x.num>0);
 const allStones=dex.items.all().filter(x=>x.exists&&!unofficialCatalogIds.Items.has(x.id)&&
  x.megaStone&&Object.keys(x.megaStone).length>0);
 const uncapturedSpecies=allMega.filter(x=>!/[가-힣]/.test(koName('Pokedex',x)));
 const uncapturedStones=allStones.filter(x=>!/[가-힣]/.test(koName('Items',x)));
 const generatedSpecies=allMega.filter(x=>!/[가-힣]/.test(koData.Pokedex?.[x.id]?.name||'')&&/[가-힣]/.test(koName('Pokedex',x)));
 const generatedStones=allStones.filter(x=>!/[가-힣]/.test(koData.Items?.[x.id]?.name||'')&&/[가-힣]/.test(koName('Items',x)));
 return {
  totalMegaForms:allMega.length,totalMegaStones:allStones.length,
  generatedSpecies:generatedSpecies.length,generatedStones:generatedStones.length,
  untranslatedSpecies:uncapturedSpecies.map(x=>x.name),
  untranslatedStones:uncapturedStones.map(x=>x.name),
  sample:{
   meowsticM:koName('Pokedex',dex.species.get('Meowstic-M-Mega')),
   meowsticF:koName('Pokedex',dex.species.get('Meowstic-F-Mega')),
   meowsticite:koName('Items',dex.items.get('Meowsticite')),
   tatsugiriCurly:koName('Pokedex',dex.species.get('Tatsugiri-Curly-Mega')),
   tatsugirinite:koName('Items',dex.items.get('Tatsugirinite')),
   floettite:koName('Items',dex.items.get('Floettite')),
   zygardite:koName('Items',dex.items.get('Zygardite')),
   delphox:koName('Pokedex',dex.species.get('Delphox-Mega')),
   delphoxite:koName('Items',dex.items.get('Delphoxite')),
   chandelure:koName('Pokedex',dex.species.get('Chandelure-Mega')),
   chandelurite:koName('Items',dex.items.get('Chandelurite')),
   garchompZ:koName('Pokedex',dex.species.get('Garchomp-Mega-Z')),
   garchompiteZ:koName('Items',dex.items.get('Garchompite Z')),
   charizardX:koName('Pokedex',dex.species.get('Charizard-Mega-X')),
   charizarditeX:koName('Items',dex.items.get('Charizardite X'))
  }
 };
})();
if(require.main===module)console.log('[TRANSLATION-AUDIT]',JSON.stringify(translationAudit));

if(require.main===module)console.log('[KO-CHECK]',JSON.stringify({
 garchomp:catalog.species.find(x=>x.en==='Garchomp'),
 megametagross:catalog.species.find(x=>x.en==='Metagross-Mega'),
 earthquake:catalog.moves.find(x=>x.en==='Earthquake'),
 focusSash:catalog.items.find(x=>x.en==='Focus Sash'),
 garchompMegaZ:catalog.species.find(x=>x.en==='Garchomp-Mega-Z'),
 garchompiteZ:catalog.items.find(x=>x.en==='Garchompite Z')
}));

const port=Number(process.env.PORT)||10000;
function startServer(){
const server=http.createServer(async(req,res)=>{
 const pathname=new URL(req.url||'/', 'http://localhost').pathname.replace(/\/+$/, '')||'/';
 console.log('[HTTP]',req.method,req.url,'=>',pathname);
 try{
  if((pathname==='/'||pathname==='/index.html'||!pathname.startsWith('/api/'))&&req.method==='GET'){
   if(pathname==='/favicon.ico'){res.writeHead(204);return res.end()}
   res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});return res.end(require('node:fs').readFileSync(require('node:path').join(__dirname,'index.html'),'utf8'));
  }
  if(pathname==='/api/health'&&req.method==='GET')return respond(res,{ok:true,engine:'pokemon-showdown',mod:dex.currentMod,policyVersion:'0.7.1'});
  if(pathname==='/api/sample-library/status'&&req.method==='GET'){
   const settings=sampleLibrary.settings();
   return respond(res,{enabled:settings.enabled,storage:'encrypted-github-branch',
    message:settings.enabled?'영구 보관함 준비 완료':'Render에 영구 저장용 GitHub 토큰과 보관함 비밀번호를 등록해야 해.'});
  }
  if(pathname==='/api/sample-library'){
   const settings=sampleLibrary.settings();
   if(!settings.enabled)return respond(res,{error:'영구 저장소가 아직 연결되지 않았어. Render 환경변수 설정이 필요해.'},503);
   if(!sampleLibrary.authorized(req.headers['x-samples-key']))
    return respond(res,{error:'보관함 비밀번호가 올바르지 않아.'},401);
   try{
    if(req.method==='GET')return respond(res,await sampleLibrary.listSamples());
    if(req.method==='POST'){
     let body='';
     for await(const c of req){
      body+=c;
      if(body.length>20000)return respond(res,{error:'샘플 데이터가 너무 커.'},413);
     }
     let payload;
     try{payload=JSON.parse(body)}catch(e){return respond(res,{error:'요청 형식이 잘못됐어.'},400)}
     return respond(res,await sampleLibrary.mutateSamples(payload,{validate}));
    }
   }catch(e){
    console.error('[SAMPLE_LIBRARY_ERROR]',e.status||500,e.message);
    return respond(res,{error:e.message||'샘플 저장 오류'},e.status||500);
   }
  }
  if(pathname==='/api/catalog'&&req.method==='GET')return respond(res,catalog);
  if(pathname==='/api/duel'&&req.method==='POST'){let s='';for await(const c of req){s+=c;if(s.length>100000)throw Error('Request too large')};const x=JSON.parse(s);const result=simulation(x.a,x.b,Number(x.maxTurns)||120,x.rngSeed);
if([x.a?.species,x.b?.species].map(id).includes('floettemega')&&
 [x.a?.species,x.b?.species].map(id).includes('mimikyu'))
 console.log('[LIVE_DUEL_TRACE]',JSON.stringify({build:process.env.RENDER_GIT_COMMIT,
  seed:result.rngSeed,side:[x.a.species,x.b.species],
  choices:result.choices.slice(0,3),
  moves:[x.a.moves,x.b.moves],evs:[x.a.evs,x.b.evs],
  second:result.decisionDetails[1]&&{
   depth:result.decisionDetails[1].depth,
   audit:result.decisionDetails[1].exposedSetupAudit
  }}));
return respond(res,result)}
  return respond(res,{error:'Not found',method:req.method,path:pathname},404);
 }catch(e){console.error('[REQUEST_ERROR]',e.stack||e);return respond(res,{error:String(e.message||e)},400)}
});
server.listen(port,'0.0.0.0',()=>{
 console.log('[START] Listening on',port,'Showdown mod:',dex.currentMod);
 if(process.env.RUN_PROBABILITY_LIVE_REGRESSION==='1'){
  try{
   const sal={species:'Salamence-Mega',nature:'Adamant',ability:'Aerilate',preMegaAbility:'Intimidate',item:'Salamencite',
    evs:{hp:27,atk:9,spe:30},moves:['Giga Impact','Earthquake']};
   const prim={species:'Primarina',nature:'Modest',ability:'Torrent',item:'Sitrus Berry',
    evs:{hp:32,def:20,spa:14},moves:['Moonblast','Aqua Jet']};
   const t=Date.now(),r=simulation(sal,prim,3,'1579,3137,6027,8191');
   console.log('[PROBABILITY-LIVE-REGRESSION]',JSON.stringify({ms:Date.now()-t,
    first:r.decisionDetails[0],turns:r.turns,choices:r.choices,
    winner:r.winner,stopReason:r.stopReason}));
  }catch(e){console.error('[PROBABILITY-LIVE-ERROR]',e.stack||e)}
 }

 if(process.env.RUN_PROBABILITY_DIAGNOSTIC==='1'){
  try{
   const sal={species:'Salamence-Mega',nature:'Adamant',ability:'Aerilate',preMegaAbility:'Intimidate',item:'Salamencite',
    evs:{hp:27,atk:9,spe:30},moves:['Giga Impact','Earthquake']};
   const prim={species:'Primarina',nature:'Modest',ability:'Torrent',item:'Sitrus Berry',
    evs:{hp:32,def:20,spa:14},moves:['Moonblast','Aqua Jet']};
   const B=battle(sal,prim);
   const root=evalTwoTurn(B,0,Date.now()+6500);
   const chosen=root||{left:'move 1 mega',right:'move 1'};
   const start=Date.now();
   const audit=probabilisticAttackSearch(B,chosen,0,Date.now()+12000);
   console.log('[PROBABILISTIC-REGRESSION]',JSON.stringify({elapsed:Date.now()-start,
    root:root?{left:root.left,right:root.right}:null,audit}));
   const trace=[];
   for(let n=0;n<6;n++)for(const lead of ['move 1 mega','move 2 mega']){
    const b=battle(sal,prim);b.resetRNG(verificationSeed(0,n,71));
    const moves=[['first',lead,'move 1']];b.makeChoices(lead,'move 1');
    for(let k=1;k<=4&&!b.ended;k++){
     const p=evalOneTurn(b,k,1,Date.now()+3500,2);
     if(!p?.left||!p?.right)break;
     moves.push([k,p.left,p.right]);b.makeChoices(p.left,p.right);
    }
    const a=b.getSide('p1').pokemon[0],q=b.getSide('p2').pokemon[0];
    trace.push({n,lead,moves,winner:b.winner||'',hp:[a.hp,q.hp],
     events:b.log.filter(x=>/^\|move\||^\|-damage\||^\|-heal\||^\|-fail\||^\|-miss\|/.test(x)).slice(0,15)});
   }
   console.log('[PROBABILISTIC-FOLLOWUPS]',JSON.stringify(trace));

   const mint={species:'Gholdengo',nature:'Modest',ability:'Good as Gold',item:'Air Balloon',
    evs:{hp:32,spa:32,spe:2},moves:['Make It Rain','Dazzling Gleam','Shadow Ball','Nasty Plot']};
   const meta={species:'Metagross-Mega',nature:'Adamant',ability:'Tough Claws',
    preMegaAbility:'Clear Body',item:'Metagrossite',evs:{hp:2,atk:32,spe:32},
    moves:['Ice Punch','Psychic Fangs','Bullet Punch','Earthquake']};
   const G=battle(mint,meta);
   const g=evalTwoTurn(G,0,Date.now()+6500);
   const goldAudit=probabilisticAttackSearch(G,g||{left:'move 3',right:'move 1 mega'},0,Date.now()+11000);
   console.log('[PROBABILISTIC-GOLD]',JSON.stringify({root:g?{left:g.left,right:g.right}:null,audit:goldAudit}));
  }catch(e){console.error('[PROBABILISTIC-REGRESSION-ERROR]',e.stack||e)}
 }

 if(process.env.RUN_SALAMENCE_PROBABILITY==='1'){
  try{
   const sal={species:'Salamence-Mega',nature:'Adamant',ability:'Aerilate',preMegaAbility:'Intimidate',item:'Salamencite',
    evs:{hp:27,atk:9,spe:30},moves:['Giga Impact','Earthquake']};
   const prim={species:'Primarina',nature:'Modest',ability:'Torrent',item:'Sitrus Berry',
    evs:{hp:32,def:20,spa:14},moves:['Moonblast','Aqua Jet']};
   const reference=battle(sal,prim);
   const p=reference.getSide('p1').pokemon[0],q=reference.getSide('p2').pokemon[0];
   console.log('[SAL-PRIM-STATS]',JSON.stringify({sal:{species:p.species.name,hp:p.hp,atk:p.storedStats.atk,spe:p.storedStats.spe,spd:p.storedStats.spd,ability:p.ability},prim:{hp:q.hp,def:q.storedStats.def,spa:q.storedStats.spa,atk:q.storedStats.atk,spe:q.storedStats.spe,status:q.status},initialLog:reference.log.slice(-10)}));
   const saved=JSON.stringify(reference.toJSON());
   const tally={giga:{win:0,lose:0,unresolved:0,firstKO:0,firstMiss:0,firstNonKO:0,gigaFirstDamage:{},moonFirstDamage:{},primAfterFirstItem:{}},
    quake:{win:0,lose:0,unresolved:0,firstKO:0,firstMiss:0,firstNonKO:0,quakeFirstDamage:{},moonFirstDamage:{},primAfterFirstItem:{}}};
   const N=160;
   const started=Date.now();
   for(let n=0;n<N;n++){
    for(const mode of ['giga','quake']){
     const st=tally[mode],B=Sim.Battle.fromJSON(saved);
     B.resetRNG(verificationSeed(33,n,47));
     const salBefore=B.getSide('p1').pokemon[0],primBefore=B.getSide('p2').pokemon[0];
     B.makeChoices(mode==='giga'?'move 1 mega':'move 2 mega','move 1');
     const a=B.getSide('p1').pokemon[0],b=B.getSide('p2').pokemon[0];
     const label=mode==='giga'?'gigaFirstDamage':'quakeFirstDamage';
     const d=primBefore.maxhp-b.hp;
     st[label][d]=(st[label][d]||0)+1;
     const md=salBefore.maxhp-a.hp;
     st.moonFirstDamage[md]=(st.moonFirstDamage[md]||0)+1;
     st.primAfterFirstItem[b.item||'used']=(st.primAfterFirstItem[b.item||'used']||0)+1;
     if(B.winner==='Left'){st.firstKO++}
     else if(mode==='giga'&&d===0){st.firstMiss++}
     else st.firstNonKO++;
     for(let step=0;step<4&&!B.ended;step++){
      const pp=B.getSide('p1').pokemon[0], qq=B.getSide('p2').pokemon[0];
      const recharge=!!pp.volatiles['mustrecharge'];
      // An uncharged, faster Mega Salamence attacks before Moonblast;
      // Primarina's only chance to interrupt is priority Aqua Jet.
      // During recharge, Moonblast is Primarina's best direct attack.
      const firstMove=recharge?'move 1':'move 1';
      const secondMove=recharge?'move 1':'move 2';
      B.makeChoices(firstMove,secondMove);
     }
     if(B.winner==='Left')st.win++;
     else if(B.winner==='Right')st.lose++;
     else st.unresolved++;
    }
   }
   console.log('[SAL-PRIM-PROBABILITY]',JSON.stringify({N,elapsed:Date.now()-started,tally}));
  }catch(e){console.error('[SAL-PRIM-ERROR]',e.stack||e)}
 }


 if(process.env.RUN_DEFENSIVE_REGRESSION==='1'){
 try{
  const m={species:'Mimikyu',name:'고집HA따라큐',nature:'Adamant',ability:'Disguise',item:'Scope Lens',
   evs:{hp:32,atk:32,spe:2},moves:['Swords Dance','Shadow Claw','Play Rough','Shadow Sneak']};
  const c={species:'Corviknight',name:'대담HB아머까오',nature:'Bold',ability:'Pressure',item:'Rocky Helmet',
   evs:{hp:32,def:32,spe:2},moves:['Iron Defense','Roost','Body Press','U-turn']};
  const start=Date.now(),run=simulation(m,c,8);
  console.log('[DEFENSIVE-ROUTE-SMOKE]',JSON.stringify({elapsed:Date.now()-start,
   turns:run.turns,winner:run.winner,stopReason:run.stopReason,
   decisions:run.decisionDetails.map(d=>({turn:d.turn,left:d.left,right:d.right,
    plan:d.longPlan?{chosen:d.longPlan.chosen,reason:d.longPlan.reason,
     candidates:d.longPlan.candidates?.map(x=>({action:x.action,value:Math.round(x.value)}))}:null}))}));
 }catch(e){console.error('[DEFENSIVE-ROUTE-ERROR]',e.stack||e)}
}


if(process.env.RUN_META_GOLD_DIAGNOSTIC==='1'){
 try{
  const gold={name:'조심HC 풍선 타부자고',species:'Gholdengo',item:'Air Balloon',ability:'Good as Gold',nature:'Modest',
   evs:{hp:32,spa:32,spe:2},moves:['Make It Rain','Dazzling Gleam','Shadow Ball','Nasty Plot']};
  const meta={name:'고집AS 메가메타그로스',species:'Metagross-Mega',item:'Metagrossite',ability:'Tough Claws',preMegaAbility:'Clear Body',
   nature:'Adamant',evs:{hp:2,atk:32,spe:32},moves:['Ice Punch','Psychic Fangs','Bullet Punch','Earthquake']};
  const B=battle(gold,meta);
  const start=Date.now();
  const L=legal(B,'p1'),R=legal(B,'p2');
  const shallow=evalOneTurn(B,0,4,Date.now()+4000);
  const deep=evalTwoTurn(B,0,Date.now()+13000);
  const checked=deep?verifyChanceOutcomes(B,deep,0,Date.now()+9000):null;
  console.log('[META-GOLD-WINRATE-CHECK]',JSON.stringify(checked));
  const summaries=(d)=>d?{
   firstLeft:d.left,firstRight:d.right,
   rows:d.matrix?.map((row,i)=>({p1:L[i],vsR:row.map((v,j)=>({p2:R[j],v:Math.round(v)}))})),
   immediate:d.immediate?.map((row,i)=>({p1:L[i],vsR:row.map((v,j)=>({p2:R[j],v:Math.round(v)}))}))
  }:null;
  const moves=[];
  for(const action of ['move 1 mega','move 2 mega','move 3 mega','move 4 mega']){
   const tmp=battle(gold,meta);tmp.makeChoices('move 4',action);
   const g=tmp.getSide('p1').pokemon[0],m=tmp.getSide('p2').pokemon[0];
   moves.push({move:action,hpGold:g.hp,hpMeta:m.hp,goldItem:g.item,
    logs:tmp.log.filter(x=>/^\|move\||^\|-damage\||^\|-start\||^\|-enditem\||^\|-status\||^\|-miss\||^\|-mega\|/.test(x)).slice(-10)});
  }
  console.log('[META-GOLD-REASON]',JSON.stringify({duration:Date.now()-start,shallow:summaries(shallow),deep:summaries(deep),moves}));
 }catch(e){console.error('[META-GOLD-DIAG-ERROR]',e.stack||e)}
}


if(process.env.MATCHUP_DIAGNOSTIC==='1'){
 const run=(bNature,bSp,pNature,pSp)=>{
 try{
 const bx={species:'Baxcalibur-Mega',item:'Baxcalibrite',nature:bNature,ability:'Thermal Exchange',preMegaAbility:'Thermal Exchange',moves:['Swords Dance','Thunder Fang','Earthquake','Ice Shard'],evs:bSp};
 const pr={species:'Primarina',item:'Sitrus Berry',nature:pNature,ability:'Torrent',moves:['Calm Mind','Aqua Jet','Moonblast','Sparkling Aria'],evs:pSp};
 const b=battle(bx,pr), L=legal(b,'p1'),R=legal(b,'p2');
 const pre={type:b.getSide('p1').pokemon[0].getTypes(),firstLegal:L,secondLegal:R};
 const shallow=evalOneTurn(b,0,2,Date.now()+6000);
 const deep=evalTwoTurn(b,0,Date.now()+14000);
 const mk=(m)=>m?.matrix?.map((row,i)=>({p1:L[i],row:row.map((v,j)=>[R[j],Math.round(v)])}));
 console.log('[MOONBLAST-INVESTIGATION]',JSON.stringify({bNature,bSp,pNature,pSp,pre,
 shallow:shallow?{left:shallow.left,right:shallow.right,matrix:mk(shallow)}:null,
 deep:deep?{left:deep.left,right:deep.right,matrix:mk(deep)}:null}));
 }catch(e){console.error('[MOONBLAST-DIAG-ERROR]',e.stack||e)}
 };
 run('Impish',{hp:32,def:32,spe:2},'Modest',{hp:32,spa:32,spe:2});
 run('Impish',{hp:32,def:32,spe:2},'Bold',{hp:32,def:32,spe:2});
}


 if(process.env.RUN_POLICY_REGRESSION==='1'){
 try{
  const b={species:'Baxcalibur-Mega',name:'HB메가드닐레이브',item:'Baxcalibrite',nature:'Impish',
    ability:'Thermal Exchange',preMegaAbility:'Thermal Exchange',
    moves:['Swords Dance','Thunder Fang','Dragon Claw','Glaive Rush'],evs:{hp:32,def:32,spe:2}};
  const p={species:'Primarina',name:'자뭉누리레느',item:'Sitrus Berry',nature:'Modest',
    ability:'Torrent',moves:['Moonblast','Sparkling Aria','Ice Beam','Psychic'],evs:{hp:32,spa:32,spe:2}};
  const B=battle(b,p);
  const first=Date.now();
  const shallow=evalOneTurn(B,0,8);
  const deep=evalTwoTurn(B,0,Date.now()+6500);
  const two=[];
  for(const [label,firstMove] of [['SD','move 1 mega'],['ATTACK','move 2 mega']]){
   const sim=battle(b,p);
   sim.makeChoices(firstMove,'move 1');
   if(!sim.ended)sim.makeChoices('move 2','move 1');
   two.push({label,winner:sim.winner,remaining:[sim.getSide('p1').pokemon[0].hp,sim.getSide('p2').pokemon[0].hp],
     item:sim.getSide('p2').pokemon[0].item});
  }
  console.log('[TACTICAL-4MOVE-REGRESSION]',JSON.stringify({
   shallow:shallow?.left,deep:deep?.left,opponent:deep?.right,
   rows:deep?.matrix.map((v,i)=>[deep.L[i],Math.min(...v)]),
   scripted:two,ms:Date.now()-first}));
 }catch(e){console.error('[TACTICAL-4MOVE-ERROR]',e.stack||e)}
 }

 const check=(path,method='GET',payload)=>new Promise(resolve=>{
  const req=http.request({hostname:'127.0.0.1',port,path,method,headers:{'content-type':'application/json'}},res=>{
    let body='';res.on('data',c=>body+=c);res.on('end',()=>{
      let data={};try{data=JSON.parse(body)}catch(e){}
      const turns=Array.isArray(data.log)?data.log.filter(v=>v.startsWith('|turn|')).map(v=>Number(v.slice(6))):[];
      resolve({status:res.statusCode,type:res.headers['content-type'],turns:data.turns,stopReason:data.stopReason,choices:data.choices?.slice(0,3),seed:data.rngSeed,secondAudit:data.decisionDetails?.[1]?.exposedSetupAudit,firstTurn:turns[0],lastTurn:turns.at(-1),loggedTurnCount:turns.length});
    });
  });req.on('error',e=>resolve({error:e.message}));if(payload)req.write(JSON.stringify(payload));req.end();
 });
 (async()=>{
  for(const [name,pth,met,data] of [
    ['home','/?source=smoketest','GET'],
    ['health','/api/health','GET'],
    ['duel','/api/duel','POST',{a:samples[0],b:samples[1]}],
    ...[0,1].map(index=>{
     const rotom={name:'HB불로톰',species:'Rotom-Heat',nature:'Bold',
      item:'Leftovers',ability:'Levitate',
      moves:['Volt Switch','Overheat','Will-O-Wisp','Pain Split'],
      evs:{hp:32,atk:0,def:32,spa:0,spd:2,spe:0}};
     const sal={name:'고집AS메만다',species:'Salamence-Mega',nature:'Adamant',
      item:'Salamencite',ability:'Aerilate',preMegaAbility:'Intimidate',
      moves:['Double-Edge','Earthquake','Dragon Dance','Roost'],
      evs:{hp:2,atk:32,def:0,spa:0,spd:0,spe:32}};
     return ['live-rotom-vs-megasalamence-'+index,'/api/duel','POST',{
      a:index===0?rotom:sal,b:index===0?sal:rotom,
      maxTurns:4,rngSeed:'1579,3137,6027,8191'}];
    }),
    ...[0,1].map((index)=>[
     'live-megameta-vs-megascrafty-'+index,'/api/duel','POST',{
      a:index===0?{
       name:'고집AS메메타',species:'Metagross-Mega',nature:'Adamant',
       item:'Metagrossite',ability:'Tough Claws',preMegaAbility:'Clear Body',
       moves:['Psychic Fangs','Ice Punch','Earthquake','Bullet Punch'],
       evs:{hp:2,atk:32,def:0,spa:0,spd:0,spe:32}
      }:{
       name:'용춤 메가곤율거니',species:'Scrafty-Mega',nature:'Adamant',
       item:'Scraftinite',ability:'Intimidate',preMegaAbility:'Intimidate',
       moves:['Drain Punch','Knock Off','Dragon Dance','Taunt'],
       evs:{hp:19,atk:21,def:0,spa:0,spd:0,spe:26}
      },
      b:index===1?{
       name:'고집AS메메타',species:'Metagross-Mega',nature:'Adamant',
       item:'Metagrossite',ability:'Tough Claws',preMegaAbility:'Clear Body',
       moves:['Psychic Fangs','Ice Punch','Earthquake','Bullet Punch'],
       evs:{hp:2,atk:32,def:0,spa:0,spd:0,spe:32}
      }:{
       name:'용춤 메가곤율거니',species:'Scrafty-Mega',nature:'Adamant',
       item:'Scraftinite',ability:'Intimidate',preMegaAbility:'Intimidate',
       moves:['Drain Punch','Knock Off','Dragon Dance','Taunt'],
       evs:{hp:19,atk:21,def:0,spa:0,spd:0,spe:26}
      },
      maxTurns:2,rngSeed:'1579,3137,6027,8191'
     }
    ]),
    ...['9050,5038,6950,14342','21540,8808,14040,34072'].map((seed,i)=>[
      'live-floette-'+i,'/api/duel','POST',{
       a:{species:'Floette-Mega',nature:'Timid',item:'Floettite',ability:'Fairy Aura',
        preMegaAbility:'Flower Veil',moves:['Moonblast','Synthesis','Draining Kiss','Calm Mind'],
        evs:{hp:22,atk:0,def:11,spa:1,spd:0,spe:32}},
       b:{species:'Mimikyu',nature:'Adamant',item:'Scope Lens',ability:'Disguise',
        moves:['Shadow Claw','Play Rough','Swords Dance','Shadow Sneak'],
        evs:{hp:32,atk:32,def:0,spa:0,spd:0,spe:2}},
       rngSeed:seed,maxTurns:3
      }
    ]),
    ['long-battle','/api/duel','POST',{
      a:{species:'Magikarp',name:'테스트 A',nature:'Jolly',ability:'Swift Swim',moves:['Splash']},
      b:{species:'Magikarp',name:'테스트 B',nature:'Jolly',ability:'Swift Swim',moves:['Splash']},maxTurns:25
    }]
  ]){try{let r=await check(pth,met,data);console.log('[SMOKETEST]',name,JSON.stringify(r))}catch(e){console.error('[SMOKETEST_FAIL]',name,e.stack||e)}}
 })();
});
return server;
}
if(require.main===module)startServer();
module.exports={battle,legal,simulation,validate,needsSustainHorizon,Sim,startServer,probabilisticAttackSearch,resolveMatrix,
 continuationMove,estimatedDirectDamage,provablyImmuneAttack,wastedOpeningEncore,strategicLegal,avoidImmuneChoice,catalog,koData,koName,dex};
function respond(res,x,status=200){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(x))}
