'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {battle,Sim,simulation,legal,resolveMatrix}=require('../server.cjs');
const {exactAttackRace,gameValue,supportsMove}=require('../attack-race.cjs');
const {sampledRace}=require('../sampled-race.cjs');
const sal={species:'Salamence-Mega',nature:'Adamant',ability:'Aerilate',preMegaAbility:'Intimidate',
 item:'Salamencite',evs:{hp:27,atk:9,spe:30},moves:['Giga Impact','Earthquake']};
const prim={species:'Primarina',nature:'Modest',ability:'Torrent',item:'Sitrus Berry',
 evs:{hp:32,def:20,spa:14},moves:['Moonblast','Aqua Jet']};
const exact=(B,horizon=3)=>exactAttackRace(B,{Sim,horizon,deadline:Date.now()+10000});

test('simultaneous probability games include mixed strategies',()=>{
 assert.equal(gameValue([[1,0],[0,1]]),0.5);
 assert.ok(Math.abs(gameValue([[0.5,0,1],[1,0.5,0],[0,1,0.5]])-0.5)<1e-9);
 assert.ok(Math.abs(gameValue([[0.3,0.7],[0.6,0.4]])-0.5)<1e-9);
 assert.equal(gameValue([[0.8,0.7],[0.3,0.2]]),0.7);
});

test('given spreads certify Earthquake vs Moonblast without reading combat RNG',()=>{
 const B=battle(sal,prim),snapshot=JSON.stringify(B.toJSON()),result=exact(B);
 assert.equal(result.certified,true);
 assert.equal(result.left,'move 2 mega');assert.equal(result.right,'move 1');
 assert.ok(result.valueBounds[0]>54.4&&result.valueBounds[1]<54.5);
 assert.ok(result.payoff[0][0].winUpperPct<44.1);
 assert.ok(result.payoff[1][0].winLowerPct>54.4);
 assert.equal(JSON.stringify(B.toJSON()),snapshot,'analysis must not mutate the live battle');
 const differentSeed=exact(battle(sal,prim,'1,2,3,4'));
 assert.deepEqual(differentSeed.payoff,result.payoff);
});

test('swapping sides complements probability bounds and preserves chosen moves',()=>{
 const forward=exact(battle(sal,prim)),reverse=exact(battle(prim,sal));
 assert.equal(reverse.certified,true);
 assert.equal(reverse.left,'move 1');assert.equal(reverse.right,'move 2 mega');
 for(let i=0;i<2;i++)for(let j=0;j<2;j++){
  assert.ok(Math.abs(forward.payoff[i][j].winLowerPct+reverse.payoff[j][i].winUpperPct-100)<0.0002);
  assert.ok(Math.abs(forward.payoff[i][j].winUpperPct+reverse.payoff[j][i].winLowerPct-100)<0.0002);
 }
 const reordered=exact(battle({...sal,moves:[...sal.moves].reverse()},prim));
 assert.equal(reordered.left,'move 1 mega');
});

test('one-turn bound agrees with independently weighted full Showdown battles',()=>{
 const B=battle(sal,prim),result=exact(B,1),snapshot=JSON.stringify(B.toJSON());
 let wins=0,losses=0,total=0;
 const cases=[];
 for(const critical of [false,true])for(let damage=0;damage<16;damage++)
  cases.push({critical,damage,p:(critical?1/24:23/24)/16});
 const first=[{miss:true,p:0.1},...cases.map(c=>({...c,p:c.p*0.9}))];
 for(const a of first)for(const b of cases){
  const branch=Sim.Battle.fromJSON(snapshot);
  branch.randomChance=(num,den)=>{
   const roll=branch.activePokemon.side.id==='p1'?a:b;
   if(den===100)return !roll.miss;
   return !!roll.critical;
  };
  branch.randomizer=value=>{
   const roll=branch.activePokemon.side.id==='p1'?a:b;
   return Math.floor(value*(100-roll.damage)/100);
  };
  branch.makeChoices('move 1 mega','move 1');
  const p=a.p*b.p;total+=p;
  if(branch.winner==='Left')wins+=p;
  if(branch.winner==='Right')losses+=p;
 }
 assert.ok(Math.abs(total-1)<1e-10);
 assert.ok(Math.abs(result.payoff[0][0].winLowerPct-100*wins)<0.0001);
 assert.ok(Math.abs(result.payoff[0][0].winUpperPct-100*(1-losses))<0.0001);
});

test('unsupported mechanics are rejected instead of receiving an exact label',()=>{
 const dex=Sim.Dex.forFormat('gen9championscustomgame');
 const physical=[dex.moves.get('Earthquake')];
 for(const name of ['Ice Punch','Mind Blown','Foul Play','Body Press','Swords Dance'])
  assert.equal(supportsMove(dex.moves.get(name),physical),false,name);
 assert.equal(exact(battle({...sal,moves:['Giga Impact','Dragon Dance']},prim)),null);
 assert.equal(exact(battle({...sal,moves:['Giga Impact','Earthquake']},
  {...prim,item:'Life Orb'})),null);
 const B=battle(sal,prim);B.p2.pokemon[0].status='par';assert.equal(exact(B),null);
 assert.equal(exactAttackRace(battle(sal,prim),{Sim,deadline:0}),null);
});

test('Focus Sash prevents all first-hit KOs, and a search budget retains completed bounds',()=>{
 const sash=exact(battle(sal,{...prim,item:'Focus Sash'}),1);
 assert.equal(sash.payoff[0][0].winLowerPct,0);
 const limited=exactAttackRace(battle(sal,prim),{Sim,horizon:3,maxStates:1000,deadline:Date.now()+10000});
 assert.equal(limited.horizon,2);assert.equal(limited.certified,true);
 assert.equal(limited.left,'move 2 mega');
});

test('sampled fallback tests all opposing actions, all setups, and complete paired rounds',()=>{
 // A controlled fake engine distinguishes action-matrix evaluation from the
 // old single fixed response. One candidate is a setup move; none is pruned.
 const counts=new Map();
 const outcomes=[[0,1],[1,0],[1,1]];
 const fake={toJSON:()=>({}),Sim:{Battle:{fromJSON:()=>({
  ended:false,winner:'',resetRNG(){},makeChoices(a,b){
   const i=Number(a)-1,j=Number(b)-1;this.ended=true;
   this.winner=outcomes[i][j]?'Left':'Right';
   const key=a+':'+b;counts.set(key,(counts.get(key)||0)+1);
  }
 })}}};
 const audit=sampledRace(fake,{left:'1',right:'1'},0,Infinity,{
  Sim:fake.Sim,legal:(_,side)=>side==='p1'?['1','2','3']:['1','2'],
  seed:()=>'',followup:()=>null,resolveMatrix,maxSamples:40,minSamples:32});
 assert.equal(counts.size,6);
 assert.ok([...counts.values()].every(n=>n===40));
 assert.equal(audit.left,'3');assert.equal(audit.samples,40);
 assert.equal(audit.payoff[0][0].winPct,0);assert.equal(audit.payoff[0][1].winPct,100);
 assert.equal(audit.method,'sampled-joint-opening-game');
});

test('unresolved sampled continuations stay unknown and never count as wins',()=>{
 const fake={toJSON:()=>({})};
 const audit=sampledRace(fake,{},0,Infinity,{
  Sim:{Battle:{fromJSON:()=>({ended:false,resetRNG(){},makeChoices(){}})}},
  legal:()=>['move 1','move 2'],seed:()=>'',followup:()=>null,resolveMatrix,
  maxSamples:4,minSamples:32});
 assert.equal(audit.chosen,null);
 for(const row of audit.payoff)for(const c of row){
  assert.equal(c.winPct,0);assert.equal(c.unresolvedPct,100);
  assert.equal(c.winLowerPct,0);assert.equal(c.winUpperPct,100);
 }
});

test('actual simulation uses certified actions and preserves seeded replay',()=>{
 const first=simulation(sal,prim,8,'1579,3137,6027,8191');
 const second=simulation(sal,prim,8,'1579,3137,6027,8191');
 assert.deepEqual(first.choices[0],['move 2 mega','move 1']);
 assert.equal(first.decisionDetails[0].exactSearch.certified,true);
 assert.equal(first.stopReason,'battle_ended');
 assert.equal(first.winner,second.winner);assert.deepEqual(first.choices,second.choices);
 const combatLog=log=>log.filter(line=>!line.startsWith('|t:|'));
 assert.deepEqual(combatLog(first.log),combatLog(second.log));
});

test('setup and long battle behavior remain available outside the exact model',()=>{
 const karp={species:'Magikarp',nature:'Jolly',ability:'Swift Swim',moves:['Splash']};
 const result=simulation(karp,karp,20,'1579,3137,6027,8191');
 assert.equal(result.turns,20);assert.equal(result.stopReason,'turn_limit');
 assert.equal(result.winner,'unresolved');
});
