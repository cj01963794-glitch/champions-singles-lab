'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const core=require('../server.cjs');
const {runDuct}=require('../engines/stage1b/duct-search.cjs');
const {independentRootEnsemble}=require('../engines/stage1b/root-ensemble.cjs');
const {wilsonInterval,tallyGames}=require('../engines/stage1b/benchmark-metrics.cjs');
const sets=require('./experimental-cases.json').sets;
const get=n=>sets.find(x=>x.name===n);
const deps={Sim:core.Sim,legal:core.legal};
test('Wilson interval and censored game accounting have finite, honest bounds',()=>{
  assert.deepEqual(wilsonInterval(0,0),[0,1]);
  assert.ok(wilsonInterval(0,10)[0]===0&&wilsonInterval(0,10)[1]<0.3);
  assert.ok(wilsonInterval(10,10)[0]>0.7&&wilsonInterval(10,10)[1]<=1);
  assert.ok(Math.abs(wilsonInterval(50,100)[0]-(1-wilsonInterval(50,100)[1]))<1e-10);
  assert.throws(()=>wilsonInterval(11,10));
  const r=tallyGames([
    {agents:['ensemble','exact'],winner:'ensemble'},
    {agents:['exact','ensemble'],winner:'exact'},
    {agents:['ensemble','exact'],winner:'unresolved'},
    {agents:['ensemble','exact'],winner:'draw'}
  ],'ensemble');
  assert.equal(r.resolved,3);
  assert.deepEqual([r.wins,r.losses,r.draws,r.unresolved],[1,1,1,1]);
  assert.deepEqual(r.possibleWinRateRange,[0.25,0.5]);
});
test('Independent roots combine visit evidence without changing the battle or legalized options',()=>{
  const B=core.battle(get('기띠에써르'),get('초점HA따라큐'),'1579,3137,6027,8191');
  const snapshot=JSON.stringify(B.toJSON());
  const config={budgetMs:210,roots:3,maxIterations:1200,seed:'stage2-smoke',
    treeMode:'exact',jointWidening:false};
  const r=independentRootEnsemble(B,deps,config);
  const cmp=runDuct(B,deps,{...config,budgetMs:70});
  assert.equal(JSON.stringify(B.toJSON()),snapshot);
  assert.ok(r.independentRoots>=1&&r.independentRoots<=3);
  assert.ok(r.iterations>=3);
  assert.ok(r.completed+r.unresolved===r.iterations);
  assert.deepEqual(r.leftActions,cmp.leftActions);
  assert.deepEqual(r.rightActions,cmp.rightActions);
  for(const key of ['policyLeft','policyRight']){
    assert.ok(r[key].every(x=>Number.isFinite(x)&&x>=0&&x<=1));
    assert.ok(Math.abs(r[key].reduce((a,b)=>a+b,0)-1)<1e-8);
  }
  assert.equal(r.certified,false);
});
