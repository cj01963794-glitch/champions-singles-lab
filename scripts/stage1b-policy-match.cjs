'use strict';
// Head-to-head A/B of action-history and deeper progressive-widening policies.
// Two players independently search the *same* fully open-sheet live state.
// This is diagnostic, not evidence of globally optimal Pokémon play.
const assert=require('node:assert/strict');
const core=require('../server.cjs');
const A=require('../engines/stage1b/showdown-adapter.cjs');
const {runDuct,sample}=require('../engines/stage1b/duct-search.cjs');
const fixture=require('../test/experimental-cases.json');
const sets=new Map(fixture.sets.map(s=>[s.name,s]));
const deps={Sim:core.Sim,legal:core.legal};
const matchups=[['HS명상메플라','HB와자몽'],['초점HA따라큐','울멧HB아머까오'],
  ['조심CS메망나','기띠고집한카']];
const pairings=[['widen','open'],['open','widen'],['widen','exact'],['exact','widen']];
const seeds=['1579,3137,6027,8191','9050,5038,6950,14342'];
const all=[];
function select(B,side,mode,id,turn){
  const res=runDuct(B,deps,{budgetMs:120,maxIterations:1000,treeDepth:10,
    maxRolloutTurns:24,seed:id+':'+mode+':'+side+':'+turn,
    treeMode:mode==='exact'?'exact':'open-loop',jointWidening:mode==='widen'});
  const legal=core.legal(B,side);
  const isLeft=side==='p1',actions=isLeft?res.leftActions:res.rightActions,
    shares=isLeft?res.policyLeft:res.policyRight;
  const picked=sample(actions,shares,A.makeRandom(id+':choice:'+mode+':'+side+':'+turn));
  assert.ok(legal.includes(picked),'Illegal '+mode+' '+side+' '+picked+' / '+id);
  return picked;
}
for(const [first,second] of matchups)
 for(const [left,right] of [[first,second],[second,first]])
 for(const seed of seeds)
 for(const [agent1,agent2] of pairings){
   const id=left+':'+right+':'+seed+':'+agent1+':'+agent2;
   const B=core.battle(sets.get(left),sets.get(right),seed);
   const actions=[];
   for(let t=0;t<10&&!B.ended;t++){
     const before=JSON.stringify(B.toJSON());
     const a=select(B,'p1',agent1,id,t);
     const b=select(B,'p2',agent2,id,t);
     assert.equal(JSON.stringify(B.toJSON()),before,'Search mutated source: '+id);
     B.makeChoices(a,b);actions.push([a,b]);
   }
   const winner=B.ended?(B.winner==='Left'?agent1:B.winner==='Right'?agent2:'draw'):'unresolved';
   const row={left,right,seed,agents:[agent1,agent2],winner,turns:actions.length,
     opener:actions[0]};
   all.push(row);
   console.log('[STAGE1B-POLICY-DUEL]',JSON.stringify(row));
 }
const groups={};
for(const x of all){
 const competitor=x.agents.find(a=>a!=='widen');
 const group=(groups[competitor]??={widenWins:0,opponentWins:0,draws:0,unresolved:0,n:0});
 group.n++;
 if(x.winner==='widen')group.widenWins++;
 else if(x.winner===competitor)group.opponentWins++;
 else if(x.winner==='draw')group.draws++;
 else group.unresolved++;
}
console.log('[STAGE1B-POLICY-DUEL-SUMMARY]',JSON.stringify({matches:all.length,groups,
 note:'Exploratory 120ms/side/turn paired games; not 1.8s performance, proof of correctness or Nash optimality.'}));
assert.equal(all.length,matchups.length*2*seeds.length*pairings.length);
