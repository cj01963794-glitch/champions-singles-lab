'use strict';
// Independent two-sided UCB1 / DUCT-style search inspired by Foul Play's
// open-source method. Does not import its rule database or battle engine.
const A=require('./showdown-adapter.cjs');

function createNode(B,deps) {
  return {
    visits:0,
    left:A.legal(B,'p1',deps).map(action=>({action,visits:0,value:0})),
    right:A.legal(B,'p2',deps).map(action=>({action,visits:0,value:0})),
    pairs:new Map()
  };
}
function chooseUcb(actions, parentVisits, rng, exploration) {
  if (!actions.length) return null;
  let best=-Infinity, selected=null, ties=0;
  for (const a of actions) {
    const mean=a.visits ? a.value/a.visits : 0;
    const score=a.visits ?
      mean + exploration*Math.sqrt(Math.log(Math.max(2,parentVisits))/a.visits) :
      Infinity;
    if (score>best+1e-12) {best=score;selected=a;ties=1}
    else if (score===best || (Number.isFinite(score)&&Math.abs(score-best)<1e-12)) {
      ++ties;
      if(rng()<1/ties)selected=a;
    }
  }
  return selected;
}
function sample(actions, weights, rng) {
  if (!actions.length)return null;
  let total=0;
  for (const w of weights) total+=w;
  if (!(total>0)) return actions[Math.floor(rng()*actions.length)];
  let r=rng()*total;
  for(let i=0;i<actions.length;i++){r-=weights[i];if(r<0)return actions[i]}
  return actions.at(-1);
}
function rootPolicies(node) {
  const counts = xs=>xs.map(x=>x.visits);
  const normalize = xs=>{
    const s=xs.reduce((a,b)=>a+b,0);
    return xs.map(x=>s?x/s:1/Math.max(1,xs.length));
  };
  return {
    leftActions:node.left.map(x=>x.action),
    rightActions:node.right.map(x=>x.action),
    policyLeft:normalize(counts(node.left)),
    policyRight:normalize(counts(node.right))
  };
}
function defaultRollout(B,deps,rng,remaining,deadline) {
  let turns=0;
  while(!B.ended && turns<remaining && Date.now()<deadline) {
    const ls=A.legal(B,'p1',deps), rs=A.legal(B,'p2',deps);
    if(!ls.length||!rs.length)break;
    B.makeChoices(ls[Math.floor(rng()*ls.length)],rs[Math.floor(rng()*rs.length)]);
    turns++;
  }
  const terminal=A.terminalValue(B);
  return {value:terminal??A.uncertainValue(B),resolved:terminal!=null,turns};
}
function runDuct(B,deps,config={}) {
  const {
    budgetMs=1400, maxIterations=5000, treeDepth=10, maxRolloutTurns=24,
    exploration=1.35, seed='stage1b'
  }=config;
  const start=Date.now(),deadline=start+Math.max(20,budgetMs);
  const saved=A.snapshot(B), rng=A.makeRandom(String(seed)+':UCT');
  const root=createNode(B,deps);
  let completed=0, unresolved=0, nodes=1, maxReachedDepth=0, totalRolloutTurns=0;
  if (!root.left.length||!root.right.length)
    return {...rootPolicies(root),iterations:0,completed:0,unresolved:0,nodes,elapsedMs:0,maxReachedDepth:0};
  let iterations=0;
  while(iterations<maxIterations && (iterations===0 || Date.now()<deadline)) {
    // Independently reseed chance events each *simulation*, not each turn.
    // A search trial can now sample hit/miss, crit and damage-roll variation.
    const test=A.restore(saved,deps.Sim,String(seed)+':chance:'+iterations);
    const path=[];
    let node=root,depth=0,selectedLeaf=false;
    while(!test.ended && depth<treeDepth && Date.now()<deadline) {
      if(!node.left.length||!node.right.length)break;
      const l=chooseUcb(node.left,node.visits,rng,exploration);
      const r=chooseUcb(node.right,node.visits,rng,exploration);
      if(!l||!r)break;
      path.push({node,l,r});
      test.makeChoices(l.action,r.action);
      depth++;
      if(test.ended) break;
      const pairKey=l.action+'|'+r.action;
      let outcomes=node.pairs.get(pairKey);
      if(!outcomes){outcomes=new Map();node.pairs.set(pairKey,outcomes)}
      const key=A.signature(test);
      let next=outcomes.get(key);
      if(!next) {
        next=createNode(test,deps);
        outcomes.set(key,next);
        nodes++;
        selectedLeaf=true;
        break;
      }
      node=next;
    }
    maxReachedDepth=Math.max(maxReachedDepth,depth);
    const rollout=defaultRollout(test,deps,rng,Math.max(0,maxRolloutTurns-depth),deadline);
    totalRolloutTurns+=rollout.turns;
    if(rollout.resolved)completed++;else unresolved++;
    for (const {node,l,r} of path) {
      node.visits++;
      l.visits++;l.value+=rollout.value;
      r.visits++;r.value+=1-rollout.value;
    }
    iterations++;
    // No pathological busy-loop when a position yields no selectable moves.
    if(path.length===0)break;
    if(selectedLeaf && nodes>maxIterations*treeDepth)break;
  }
  return {...rootPolicies(root),iterations,completed,unresolved,nodes,
    elapsedMs:Date.now()-start,maxReachedDepth,totalRolloutTurns,
    // A rollout heuristic score is not a calibrated win probability.
    estimatedGameValuePct:null,certified:false,
    estimateType:'duct-sampled-partial-rollouts',
    warning:'UCT 방문 비율은 승률이 아님. 종료되지 않은 전투는 낮은 가중치의 휴리스틱으로 평가했으며 최적 행동을 보장하지 않음.'};
}
module.exports={runDuct,chooseUcb,rootPolicies,sample,createNode};
