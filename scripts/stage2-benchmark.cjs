'use strict';
// Stage 2 battle-engine-inspired root ensemble vs retained Foul Play exact
// control. LIVE pinned Champions Showdown for both players. No outside Dex.
// Predeclared exploratory+held-out cases; deterministic orientation/seed.
const assert=require('node:assert/strict');
const core=require('../server.cjs');
const A=require('../engines/stage1b/showdown-adapter.cjs');
const {runDuct,sample}=require('../engines/stage1b/duct-search.cjs');
const {independentRootEnsemble}=require('../engines/stage1b/root-ensemble.cjs');
const {tallyGames}=require('../engines/stage1b/benchmark-metrics.cjs');
const fixture=require('../test/experimental-cases.json');
const sets=new Map(fixture.sets.map(s=>[s.name,s]));
const deps={Sim:core.Sim,legal:core.legal};
const cohorts={
  known:[['HS명상메플라','HB와자몽'],['초점HA따라큐','울멧HB아머까오'],
    ['조심CS메망나','기띠고집한카']],
  holdout:[['용춤 메가곤율거니','HB불로톰'],['고집AS메메타','용춤 메가곤율거니'],
    ['원본광각리베로에이스번','원본H32B20C14누리레느'],
    ['HBC자뭉누리','고집AS메만다'],['HS명상메플라','초점HA따라큐']]
};
const seeds=['1579,3137,6027,8191','9050,5038,6950,14342'];
const budgetMs=120,maxTurns=10;
const games=[];
function select(B,side,agent,id,turn){
  const searchSeed=id+':'+agent+':'+side+':'+turn;
  const options={budgetMs,maxIterations:1600,treeDepth:10,maxRolloutTurns:24,
    seed:searchSeed,treeMode:'exact',jointWidening:false};
  const r=agent==='ensemble'
    ?independentRootEnsemble(B,deps,{...options,roots:3})
    :runDuct(B,deps,options);
  const actions=side==='p1'?r.leftActions:r.rightActions;
  const policy=side==='p1'?r.policyLeft:r.policyRight;
  const chosen=sample(actions,policy,A.makeRandom(id+':pick:'+agent+':'+side+':'+turn));
  assert.ok(core.legal(B,side).includes(chosen),'Invalid selected move: '+agent+'/'+chosen);
  return chosen;
}
for(const [cohort,matchups] of Object.entries(cohorts))
 for(const [one,two] of matchups)
 for(const [left,right] of [[one,two],[two,one]])
 for(const seed of seeds)
 for(const agents of [['ensemble','exact'],['exact','ensemble']]){
  const id=cohort+':'+left+':'+right+':'+seed;
  const B=core.battle(sets.get(left),sets.get(right),seed);
  for(let turn=0;turn<maxTurns&&!B.ended;turn++){
    const initial=JSON.stringify(B.toJSON());
    const leftChoice=select(B,'p1',agents[0],id,turn);
    const rightChoice=select(B,'p2',agents[1],id,turn);
    assert.equal(JSON.stringify(B.toJSON()),initial,'Search mutated live battle');
    B.makeChoices(leftChoice,rightChoice);
  }
  const winner=B.ended
    ?(B.winner==='Left'?agents[0]:B.winner==='Right'?agents[1]:'draw')
    :'unresolved';
  const row={cohort,left,right,seed,agents,winner,turns:Math.min(maxTurns,B.turn)};
  games.push(row);
  console.log('[STAGE2-GAME]',JSON.stringify(row));
 }
for(const [cohort] of Object.entries(cohorts)){
 const rows=games.filter(g=>g.cohort===cohort);
 console.log('[STAGE2-COHORT]',JSON.stringify({
  cohort,ensemble:tallyGames(rows,'ensemble'),control:tallyGames(rows,'exact')
 }));
}
console.log('[STAGE2-OVERALL]',JSON.stringify({
 games:games.length,budgetMsPerAgentPerTurn:budgetMs,
 ensemble:tallyGames(games,'ensemble'),control:tallyGames(games,'exact'),
 disclaimer:'Independent 3-root aggregation candidate at same total wall budget. Censored games excluded from resolved Wilson CI. Small matched-sample, non-independent games are not proof of advantage. Candidate is NOT deployed.'
}));
assert.equal(games.length,64);
