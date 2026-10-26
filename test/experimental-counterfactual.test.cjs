'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const core=require('../server.cjs'),exp=require('../engines/experimental.cjs');
const fixture=JSON.parse(fs.readFileSync(path.join(__dirname,'experimental-cases.json'),'utf8'));
const sets=new Map(fixture.sets.map(x=>[x.name,x]));
const deps={battle:core.battle,legal:core.legal,strategicLegal:core.strategicLegal,
 avoidImmuneChoice:core.avoidImmuneChoice,estimatedDirectDamage:core.estimatedDirectDamage,Sim:core.Sim};
function get(name){return sets.get(name)}
test('expert counterfactuals: threatened Floette, burned Scrafty and setup Corviknight',()=>{
 for(const c of [
  {id:'floette-after-disguise-breaking',a:'HS명상메플라',b:'초점HA따라큐',l:'move 1 mega',r:'move 2'},
  {id:'rotom-after-burn-scrafty',a:'HB불로톰',b:'용춤 메가곤율거니',l:'move 3',r:'move 3 mega'},
  {id:'corviknight-after-mimikyu-swords-dance',a:'울멧HB아머까오',b:'초점HA따라큐',l:'move 1',r:'move 3'},
  {id:'gyarados-delayed-mega-after-power-whip',a:'노자속기메갸라',b:'HBC자뭉누리',l:'move 1',r:'move 2'}
 ]){
  const B=core.battle(get(c.a),get(c.b),'1579,3137,6027,8191');
  B.makeChoices(c.l,c.r);
  if(B.ended){console.log('[EXPERIMENTAL-COUNTERFACTUAL]',JSON.stringify({id:c.id,ended:B.winner}));continue}
  const result=exp.planning(B,deps,Date.now()+2500,'1579,3137,6027,8191',1);
  if(!result){console.log('[EXPERIMENTAL-COUNTERFACTUAL]',JSON.stringify({id:c.id,notEnoughTime:true}));continue}
  const dist=result.chanceGame?{left:result.chanceGame.policyLeft,right:result.chanceGame.policyRight}:exp.equilibrium(result.values,250);
  console.log('[EXPERIMENTAL-COUNTERFACTUAL]',JSON.stringify({id:c.id,
    left:result.L.map((action,i)=>({action,prob:Math.round(dist.left[i]*100)})),
    right:result.R.map((action,i)=>({action,prob:Math.round(dist.right[i]*100)})),
    hp:[B.p1.pokemon[0].hp,B.p2.pokemon[0].hp],
    statuses:[B.p1.pokemon[0].status,B.p2.pokemon[0].status],
    boosts:[B.p1.pokemon[0].boosts,B.p2.pokemon[0].boosts]}));
  assert.ok(result.L.length>0&&result.R.length>0);
 }
});