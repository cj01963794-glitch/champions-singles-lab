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
// Open-loop search deliberately shares a *decision history* across chance
// realizations. Its node is only a statistical aggregate; every traversal
// must intersect cached candidates with actions legal in the actual state.
// The exact-state tree remains as a benchmark/control mode.
function availableAtNode(node, B, deps) {
  const actions=[];
  for (const [side,key] of [['p1','left'],['p2','right']]) {
    const legal=A.legal(B,side,deps);
    const known=new Map(node[key].map(a=>[a.action,a]));
    for(const action of legal) {
      if(!known.has(action)) {
        const fresh={action,visits:0,value:0};
        node[key].push(fresh);known.set(action,fresh);
      }
    }
    actions.push(legal.map(a=>known.get(a)));
  }
  return actions;
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
    exploration=1.35, seed='stage1b', treeMode='open-loop'
  }=config;
  if(treeMode!=='open-loop'&&treeMode!=='exact')
    throw Error('Unknown Stage 1B tree mode: '+treeMode);
  const start=Date.now(),deadline=start+Math.max(20,budgetMs);
  const saved=A.snapshot(B), rng=A.makeRandom(String(seed)+':UCT');
  const root=createNode(B,deps);
  let completed=0, unresolved=0, nodes=1, maxReachedDepth=0, totalRolloutTurns=0, legalDivergences=0;
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
      // Never play a cached action that has become illegal through Encore,
      // Mega evolution, disable, PP depletion, or any other Showdown state.
      const [left,right]=treeMode==='open-loop'
        ? availableAtNode(node,test,deps)
        : [node.left,node.right];
      if(!left.length||!right.length)break;
      if(left.length!==node.left.length||right.length!==node.right.length)
        legalDivergences++;
      const l=chooseUcb(left,node.visits,rng,exploration);
      const r=chooseUcb(right,node.visits,rng,exploration);
      if(!l||!r)break;
      path.push({node,l,r});
      test.makeChoices(l.action,r.action);
      depth++;
      if(test.ended) break;
      const pairKey=l.action+'|'+r.action;
      let outcomes=node.pairs.get(pairKey);
      if(!outcomes){outcomes=new Map();node.pairs.set(pairKey,outcomes)}
      // In open-loop mode, distinct hit/miss/damage rolls visit the same
      // action-history node. Exact mode preserves state-by-state splitting
      // for controlled comparison and counterexamples.
      const key=treeMode==='open-loop'?'action-history':A.signature(test);
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
    elapsedMs:Date.now()-start,maxReachedDepth,totalRolloutTurns,treeMode,legalDivergences,
    // A rollout heuristic score is not a calibrated win probability.
    estimatedGameValuePct:null,certified:false,
    estimateType:'duct-'+treeMode+'-sampled-partial-rollouts',
    warning:'UCT 방문 비율은 승률이 아님. 오픈루프 탐색은 다른 난수 결과의 전략 가치를 혼합할 수 있음. 무작위 후속 수순 및 미종료 휴리스틱은 최적 전략을 보장하지 않음.'};
}
module.exports={runDuct,chooseUcb,rootPolicies,sample,createNode};
