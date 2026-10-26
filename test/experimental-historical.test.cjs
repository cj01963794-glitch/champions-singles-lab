'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const core=require('../server.cjs'),engine=require('../engines/experimental.cjs');
const fixture=JSON.parse(fs.readFileSync(path.join(__dirname,'experimental-cases.json'),'utf8'));
const sets=new Map(fixture.sets.map(x=>[x.name,x]));
const deps={battle:core.battle,legal:core.legal,strategicLegal:core.strategicLegal,
 avoidImmuneChoice:core.avoidImmuneChoice,estimatedDirectDamage:core.estimatedDirectDamage,Sim:core.Sim};
test('all archived reproducible opponent matchups receive a non-immune legal decision',()=>{
 let examined=0;
 for(const c of fixture.cases.filter(x=>x.available)){
  const left=sets.get(c.a),right=sets.get(c.b),B=core.battle(left,right,'1579,3137,6027,8191');
  const t=Date.now();
  const r=engine.simulateExperimental(left,right,1,'1579,3137,6027,8191',deps);
  const actions=r.choices[0];
  assert.ok(actions&&actions.length===2,c.id+': no choice');
  for(const [i,side] of ['p1','p2'].entries()){
   assert.ok(core.legal(B,side).includes(actions[i]),c.id+': illegal '+side);
   assert.notEqual(core.provablyImmuneAttack(B,side,actions[i]),true,c.id+': provably immune');
  }
  const mechanicalExpected={
   '누리레느-에이스번':['move 2'],
   '누리레느-광각에이스번-내구형':['move 2'],
   '따라큐-아머까오':['move 3'],
   '플라엣테-리자몽Y':['move 4','move 4 mega'],
   '망나뇽-기띠한카':['move 1','move 1 mega'],
   '에써르-따라큐':['move 1','move 2','move 3'],
   '누리레느-보만다':['move 2']
  };
  if(mechanicalExpected[c.id]){
   assert.ok(mechanicalExpected[c.id].includes(actions[0]),
    c.id+': tactical regression: '+actions[0]+' is not among supported opener plans');
  }
  console.log('[EXPERIMENTAL-HISTORICAL-AUDIT]',JSON.stringify({id:c.id,
   left:actions[0],right:actions[1],mode:r.decisionDetails[0]?.experimental?.mode,ms:Date.now()-t}));
  examined++;
 }
 assert.equal(examined,fixture.cases.filter(x=>x.available).length);
});