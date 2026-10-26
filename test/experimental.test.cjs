'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path'),fs=require('node:fs');
const deps=require('../server.cjs'), exp=require('../engines/experimental.cjs');
const manifest=JSON.parse(fs.readFileSync(path.join(__dirname,'experimental-cases.json'),'utf8'));
const sets=new Map(manifest.sets.map(s=>[s.name,s]));
function sample(name){const x=sets.get(name);assert.ok(x,name+' missing');return x}
const engineDeps={battle:deps.battle,legal:deps.legal,strategicLegal:deps.strategicLegal,
 avoidImmuneChoice:deps.avoidImmuneChoice,estimatedDirectDamage:deps.estimatedDirectDamage,Sim:deps.Sim};
const rng='1579,3137,6027,8191';
test('14 historical matchups are archived with battle-valid saved samples',()=>{
 let valid=0;
 for(const c of manifest.cases.filter(c=>c.available)){
  assert.doesNotThrow(()=>deps.battle(sample(c.a),sample(c.b),rng),c.id);
  valid++;
 }
 assert.ok(valid>=14);
 console.log('[EXPERIMENTAL-CASE-MANIFEST]',JSON.stringify({valid,missing:manifest.cases.filter(c=>!c.available).map(x=>x.id)}));
});
test('simultaneous strategy solver mixes in a nontrivial zero-sum game',()=>{
 const {left,right}=exp.equilibrium([[1,-1],[-1,1]],1000);
 for(const p of [...left,...right])assert.ok(p>=0.40&&p<=0.60,'should not fix pure strategy under matching pennies: '+p);
});
test('experimental policy opens legal moves and records balanced opponent responses',()=>{
 for(const [a,b] of [
  ['HB불로톰','용춤 메가곤율거니'],
  ['고집AS메메타','용춤 메가곤율거니'],
  ['기띠에써르','초점HA따라큐'],
  ['조심CS메망나','기띠고집한카']
 ]){
  const B=deps.battle(sample(a),sample(b),rng);
  const t=Date.now();
  const result=exp.simulateExperimental(sample(a),sample(b),1,rng,engineDeps);
  assert.equal(result.model,'experimental');
  assert.equal(result.choices.length,1,'needs one move for '+a+' vs '+b);
  assert.ok(deps.legal(B,'p1').includes(result.choices[0][0]),'illegal left move');
  assert.ok(deps.legal(B,'p2').includes(result.choices[0][1]),'illegal right move');
  assert.equal(result.decisionDetails[0].experimental.utility,'finite-horizon-not-win-probability');
  console.log('[EXPERIMENTAL-OPENING]',JSON.stringify({match:a+' / '+b,
   actions:result.choices[0],mode:result.decisionDetails[0].experimental.mode,
   probabilities:[result.decisionDetails[0].experimental.policyLeft,
    result.decisionDetails[0].experimental.policyRight],ms:Date.now()-t}));
 }
});
test('physical immunity and no-target Encore remain prohibited',()=>{
 const cases=[
  {a:'고집AS메메타',b:'용춤 메가곤율거니',forbidden:1,side:0},
  {a:'기띠에써르',b:'초점HA따라큐',forbidden:4,side:0}
 ];
 for(const {a,b,forbidden,side} of cases){
  const B=deps.battle(sample(a),sample(b),rng);
  const opts=exp.options(B,side?'p2':'p1',engineDeps);
  assert.ok(!opts.some(x=>x.startsWith('move '+forbidden)),
   'must eliminate impossible move '+forbidden+' for '+a);
 }
});
test('legacy simulation remains separate and export is unchanged',()=>{
 assert.equal(typeof deps.simulation,'function');
 assert.notEqual(exp.simulateExperimental,deps.simulation);
 const u=exp.equilibrium([[0,2],[-3,1]],30);
 assert.equal(u.left.length,2);assert.equal(u.right.length,2);
});
