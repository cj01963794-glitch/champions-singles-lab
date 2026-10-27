'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const A=require('../engines/stage1b/showdown-adapter.cjs');
const {runDuct,chooseUcb}=require('../engines/stage1b/duct-search.cjs');

// Tiny simultaneous-action game independent of Pokémon's mechanics.
// This proves the search does not assume the opponent observes our choice.
class MatrixBattle {
  constructor(state){this.state=state;this.ended=!!state.ended;this.winner=state.winner||'';}
  toJSON(){return {...this.state,ended:this.ended,winner:this.winner};}
  makeChoices(left,right){
    const row=Number(left.slice(-1)),col=Number(right.slice(-1));
    this.ended=true;
    this.winner=this.state.matrix[row][col]?'Left':'Right';
    this.state={...this.state,ended:this.ended,winner:this.winner,turn:1};
  }
  static fromJSON(data){return new MatrixBattle(data)}
}
const deps={
  Sim:{Battle:MatrixBattle},
  legal:(B,side)=>B.ended?[]:(side==='p1'?['move 0','move 1']:['opp 0','opp 1'])
};
test('independent UCB revisits weak candidates but learns dominant action',()=>{
  const B=new MatrixBattle({turn:0,prng:[1,2,3,4],matrix:[[1,1],[0,0]]});
  const result=runDuct(B,deps,{budgetMs:2000,maxIterations:800,maxRolloutTurns:1,seed:'dominant'});
  assert.equal(result.iterations,800);
  assert.equal(result.unresolved,0);
  assert.ok(result.policyLeft[0]>0.75,JSON.stringify(result.policyLeft));
  assert.equal(result.policyLeft.reduce((a,b)=>a+b,0),1);
  assert.equal(result.policyRight.reduce((a,b)=>a+b,0),1);
  assert.ok(result.policyLeft[1]>0);
});
test('both players visit responses in a nontransitive matrix game',()=>{
  const B=new MatrixBattle({turn:0,prng:[1,2,3,4],matrix:[[1,0],[0,1]]});
  const r=runDuct(B,deps,{budgetMs:2000,maxIterations:700,maxRolloutTurns:1,seed:'matrix'});
  assert.equal(r.iterations,700);
  for(const w of [...r.policyLeft,...r.policyRight])assert.ok(w>0.05&&w<0.95,String(w));
});
test('snapshot restoration retains state while alternative trials have distinct RNGs',()=>{
  const B=new MatrixBattle({turn:0,prng:[1,2,3,4],matrix:[[1,0],[0,1]]});
  const saved=A.snapshot(B),plain=A.restore(saved,deps.Sim);
  assert.deepEqual(plain.toJSON(),saved);
  const a=A.restore(saved,deps.Sim,'trial-A'),b=A.restore(saved,deps.Sim,'trial-B');
  assert.notDeepEqual(a.toJSON().prng,b.toJSON().prng);
  assert.deepEqual(saved.prng,[1,2,3,4]);
});
test('unvisited UCB moves receive initial exploration',()=>{
  const actions=[{action:'a',visits:100,value:99},{action:'b',visits:0,value:0}];
  assert.equal(chooseUcb(actions,100,()=>0.5,1.35).action,'b');
});
