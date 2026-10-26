'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const core=require('../server.cjs');
const {buildPlans,actionForPlan}=require('../engines/strategic-plans.cjs');
const {analyzePlans,play}=require('../engines/adversarial-plan-search.cjs');
const experimental=require('../engines/experimental.cjs');
const cases=require('./experimental-cases.json');
const set=new Map(cases.sets.map(x=>[x.name,x]));
const deps={battle:core.battle,legal:core.legal,estimatedDirectDamage:core.estimatedDirectDamage,
 provablyImmuneAttack:core.provablyImmuneAttack,Sim:core.Sim};
const seed='1579,3137,6027,8191';
function pair(a,b){return core.battle(set.get(a),set.get(b),seed)}
test('discover both immediate offense and long setup-heal plans from move effects',()=>{
 const B=pair('HS명상메플라','HB와자몽');
 const plans=buildPlans(B,deps,'p1'),op=buildPlans(B,deps,'p2');
 assert.ok(plans.some(x=>x.kind==='setup-heal'&&x.stage>=2),
  'recover-and-boost plan must be generated without a Pokémon-name rule');
 assert.ok(plans.some(x=>x.kind==='attack'),'direct win/race plans must remain available');
 assert.ok(op.some(x=>x.kind==='attack'),'the opponent must have immediate offense plans');
 const raw=core.legal(B,'p1');
 for(const x of plans)assert.ok(raw.includes(actionForPlan(B,deps,'p1',x,0)),
  'every generated plan must start with a legal move');
 console.log('[PLAN-GENERATION-FLOETTE]',JSON.stringify({left:plans.map(x=>({
  plan:x.name,first:actionForPlan(B,deps,'p1',x,0)})),right:op.map(x=>x.name)}));
});
test('plans discover both delayed Mega and immediately evolved options',()=>{
 for(const [a,b] of [['노자속기메갸라','HBC자뭉누리'],
  ['HS명상메플라','HB와자몽'],['조심CS메망나','기띠고집한카']]){
  const B=pair(a,b),plans=buildPlans(B,deps,'p1');
  assert.ok(plans.some(x=>x.mega==='delay'&&
   !actionForPlan(B,deps,'p1',x,0)?.endsWith(' mega')),
   a+': preserve delayed evolution');
  assert.ok(plans.some(x=>actionForPlan(B,deps,'p1',x,0)?.endsWith(' mega')),
   a+': preserve immediate evolution');
 }
});
test('untrained counterplan matching exercises diverse historical failure classes',()=>{
 const focus=[
  ['원본H32B20C14누리레느','원본광각리베로에이스번'],
  ['HS명상메플라','HB와자몽'],
  ['초점HA따라큐','울멧HB아머까오'],
  ['HB불로톰','용춤 메가곤율거니'],
  ['조심CS메망나','기띠고집한카'],
  ['기띠에써르','초점HA따라큐']
 ];
 for(const [a,b] of focus){
  const B=pair(a,b),time=Date.now();
  const res=analyzePlans(B,deps,{seed,budgetMs:3200,maxTurns:85,maxSamples:2200});
  assert.ok(res.samples>=1);
  assert.equal(res.certified,false,'no counterfeit mathematical certification');
  assert.ok(core.legal(B,'p1').includes(res.leftActions[
   res.policyLeft.indexOf(Math.max(...res.policyLeft))]));
  assert.ok(core.legal(B,'p2').includes(res.rightActions[
   res.policyRight.indexOf(Math.max(...res.policyRight))]));
  assert.ok(res.leadingPlans.length>0&&res.bestCounterplans.length>0);
  console.log('[STRATEGIC-PLAN-REGRESSION]',JSON.stringify({match:a+' vs '+b,
   samples:res.samples,plans:res.planCounts,
   first:res.leftActions[res.policyLeft.indexOf(Math.max(...res.policyLeft))],
   second:res.rightActions[res.policyRight.indexOf(Math.max(...res.policyRight))],
   policyLeft:res.policyLeft,policyRight:res.policyRight,
   best:res.leadingPlans.slice(0,4),counter:res.bestCounterplans.slice(0,3),
   estimate:res.estimatedGameValuePct,ms:Date.now()-time}));
 }
});
test('all historical opening moves represented by a contingent candidate',()=>{
 for(const c of cases.cases.filter(c=>c.available)){
  const B=pair(c.a,c.b);
  for(const side of ['p1','p2']){
   const actual=new Set(buildPlans(B,deps,side).map(p=>actionForPlan(B,deps,side,p,0)));
   const legal=core.legal(B,side);
   assert.ok(legal.every(a=>actual.has(a)),c.id+': unrepresented '+side+' '+legal.filter(a=>!actual.has(a)));
  }
 }
});

test('setup-with-recovery changes to healing under real incoming damage',()=>{
 const B=pair('HS명상메플라','HB와자몽');
 const healPlan=buildPlans(B,deps,'p1').find(x=>x.kind==='setup-heal'&&x.mega==='immediate');
 assert.ok(healPlan,'must generate contingent recovery plan');
 B.makeChoices('move 4 mega','move 1 mega');
 B.makeChoices('move 4','move 1');
 const action=actionForPlan(B,deps,'p1',healPlan,2);
 console.log('[PLAN-RECOVERY-ASSERTION]',JSON.stringify({
  afterTwo:[B.p1.pokemon[0].hp,B.p1.pokemon[0].maxhp],
  boosts:B.p1.pokemon[0].boosts,
  plan:healPlan.name,choice:action,
  healMeta:B.dex.moves.get('synthesis').flags
 }));
 assert.equal(action,'move 2','a setup-sustain plan must heal before lethal repeated Flamethrower');
});
