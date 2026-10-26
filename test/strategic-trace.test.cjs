'use strict';
const {test}=require('node:test'),core=require('../server.cjs');
const {buildPlans,actionForPlan}=require('../engines/strategic-plans.cjs');
const fixture=require('./experimental-cases.json');
const sets=new Map(fixture.sets.map(s=>[s.name,s]));
const deps={battle:core.battle,legal:core.legal,estimatedDirectDamage:core.estimatedDirectDamage,
 provablyImmuneAttack:core.provablyImmuneAttack,Sim:core.Sim};
const seed='1579,3137,6027,8191';
test('diagnostic reveal of stage-by-stage generated plans against adaptive adversaries',()=>{
 for(const [a,b,kindL,kindR] of [
  ['HS명상메플라','HB와자몽','setup-heal','sustain'],
  ['HS명상메플라','HB와자몽','setup-heal','attack'],
  ['HB불로톰','용춤 메가곤율거니','disrupt','disrupt']
 ]){
  const B=core.battle(sets.get(a),sets.get(b),seed);
  const p1=buildPlans(B,deps,'p1').find(x=>x.kind===kindL&&
    (kindL!=='setup-heal'||x.mega==='immediate'));
  const p2=buildPlans(B,deps,'p2').find(x=>x.kind===kindR&&
    (kindR!=='sustain'||x.mega==='immediate'));
  if(!p1||!p2)continue;
  const steps=[];
  for(let turn=0;turn<15&&!B.ended;turn++){
   const L=actionForPlan(B,deps,'p1',p1,turn),R=actionForPlan(B,deps,'p2',p2,turn);
   B.makeChoices(L,R);
   steps.push({t:turn+1,L,R,HP:[B.p1.pokemon[0].hp,B.p2.pokemon[0].hp],
    stat:[B.p1.pokemon[0].boosts,B.p2.pokemon[0].boosts],
    weather:B.field.weather,latest:B.log.filter(x=>x.startsWith('|move|')||
     x.startsWith('|-crit|')||x.startsWith('|-fail|')).slice(-3)});
  }
  console.log('[CONTINGENT-PLAN-TRACE]',JSON.stringify({match:a+' vs '+b,
   planL:p1.name,planR:p2.name,steps,winner:B.winner||'unresolved'}));
 }
});
