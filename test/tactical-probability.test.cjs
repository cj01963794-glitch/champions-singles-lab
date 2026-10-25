'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {battle,Sim,simulation}=require('../server.cjs');
const {makeTacticalSearch,createTacticalModel,choosePolicy}=require('../tactical-race.cjs');
const prim={species:'Primarina',nature:'Modest',ability:'Torrent',item:'Sitrus Berry',
 evs:{hp:32,def:20,spa:14},moves:['Moonblast','Sparkling Aria','Encore','Aqua Jet']};
const sal={species:'Salamence-Mega',nature:'Adamant',ability:'Aerilate',preMegaAbility:'Intimidate',
 item:'Salamencite',evs:{hp:27,atk:9,spe:30},moves:['Double-Edge','Giga Impact','Earthquake','Dragon Dance']};
const search=B=>makeTacticalSearch(B,{Sim,horizon:2,deadline:Date.now()+18000,
 assumeImmediateMega:true});

test('the full submitted sets exclude Aqua Jet by probability bounds, not a species override',()=>{
 const result=search(battle(prim,sal));
 assert.equal(result.applicable,true);assert.equal(result.horizon,2);
 assert.deepEqual(result.leftPolicy,[1,0,0,0]);
 assert.ok(result.dominatedLeftActions.includes('move 4'));
 assert.ok(result.dominatedLeftActions.includes('move 2'));
 for(let j=0;j<4;j++)assert.ok(result.payoff[0][j].winLowerPct>result.payoff[3][j].winUpperPct);
 for(const row of result.payoff)for(const cell of row){
  assert.ok(cell.winLowerPct>=0&&cell.winUpperPct<=100);
  assert.ok(cell.winLowerPct<=cell.winUpperPct);
 }
 assert.ok(Math.abs(result.payoff[0][0].winLowerPct-100*23/24)<0.0001);
 assert.equal(result.certified,false,'do not label unfinished full-game probabilities as a solved game');
});

test('side and move order swaps preserve Moonblast and complementary bounds',()=>{
 const forward=search(battle(prim,sal)),reverse=search(battle(sal,prim));
 assert.deepEqual(reverse.rightPolicy,[1,0,0,0]);
 for(let i=0;i<4;i++)for(let j=0;j<4;j++){
  assert.ok(Math.abs(forward.payoff[i][j].winLowerPct+reverse.payoff[j][i].winUpperPct-100)<0.0002);
  assert.ok(Math.abs(forward.payoff[i][j].winUpperPct+reverse.payoff[j][i].winLowerPct-100)<0.0002);
 }
 const rotated=search(battle({...prim,moves:['Aqua Jet','Encore','Sparkling Aria','Moonblast']},sal));
 assert.deepEqual(rotated.leftPolicy,[0,0,0,1]);
 assert.equal(choosePolicy(rotated.leftActions,rotated.leftPolicy,0.5),'move 4');
});

test('engine-derived damage distributions retain unit mass, including Sparkling Aria',()=>{
 const B=battle(prim,sal),model=createTacticalModel(B,Sim,Infinity,2,true),ps=model.profiles;
 const initial=[ps[0].hp,ps[1].hp,0,0,ps[0].boosts,ps[1].boosts,-1,-1,-1,-1,0,0];
 for(const hp of [initial[0],1])for(const side of [0,1])for(let i=0;i<4;i++){
  if(ps[side].moves[i].kind!=='attack')continue;
  const state=[...initial];state[0]=hp;
  const outcomes=model.distribution(state,side,i);
  assert.ok(Math.abs(outcomes.reduce((n,o)=>n+o.p,0)-1)<1e-10);
 }
});

test('Encore actually forces Dragon Dance and the solver preserves that forced action',()=>{
 const B=battle(prim,sal);B.makeChoices('move 3','move 4 mega');
 assert.equal(B.p2.pokemon[0].volatiles.encore.move,'dragondance');
 assert.equal(B.p2.pokemon[0].volatiles.encore.duration,3);
 const result=search(B);
 assert.deepEqual(result.rightActions,['move 4']);
 assert.equal(result.payoff[0][0].winLowerPct,100);
 assert.equal(result.payoff[0][0].winUpperPct,100);
 B.makeChoices('move 1','move 4');
 if(!B.ended)B.makeChoices('move 1','move 4');
 assert.equal(B.winner,'Left');
});

test('simultaneous Double-Edge recoil KOs match the pinned engine winner rule',()=>{
 const B=battle({...prim,item:''},sal);B.p1.pokemon[0].hp=1;B.p2.pokemon[0].hp=1;
 const result=makeTacticalSearch(B,{Sim,horizon:1,deadline:Date.now()+10000,assumeImmediateMega:true});
 assert.equal(result.payoff[0][0].winLowerPct,0);
 assert.equal(result.payoff[0][0].winUpperPct,0);
 B.makeChoices('move 1','move 1 mega');
 assert.equal(B.p1.pokemon[0].hp,0);assert.equal(B.p2.pokemon[0].hp,0);
 assert.equal(B.winner,'Right');
});

test('the full four-move Mega-timing rollout rejects premature Aqua Jet and keeps seeded replay',()=>{
 const a=simulation(prim,sal,8,'1579,3137,6027,8191');
 const b=simulation(prim,sal,8,'1579,3137,6027,8191');
 // Do not relabel a finite heuristic rollout as proof of Moonblast's
 // long-horizon optimality. Both special STAB attacks are still candidates.
 assert.ok(['move 1','move 2'].includes(a.choices[0][0]));
 assert.notEqual(a.choices[0][0],'move 4');
 assert.equal(a.decisionDetails[0].megaTimingConsidered,true);
 assert.equal(a.decisionDetails[0].tacticalProbability,undefined);
 assert.deepEqual(a.choices,b.choices);assert.equal(a.winner,b.winner);
 assert.equal(a.stopReason,'battle_ended');
});
