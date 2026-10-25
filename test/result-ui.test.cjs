'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
const source=html.slice(html.indexOf('function renderResult(raw,a,b){'),
 html.indexOf("document.getElementById('run').onclick=async()=>{"));
function render(first){
 const nodes=new Map();
 const node=()=>({style:{},textContent:'',innerHTML:'',after(element){nodes.set(element.id,element)}});
 const document={getElementById(id){if(!nodes.has(id))nodes.set(id,node());return nodes.get(id)},createElement:node};
 const context=vm.createContext({document,
  h:s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),
  korean:(_,s)=>s,sampleLabel:s=>s.name,hpCard:()=>'',
  parseBattle:()=>({state:{},started:{},turns:[]})});
 vm.runInContext('let lastRngSeed=null;\n'+source,context);
 context.raw={winner:'Left',turns:2,decisionDetails:[first],log:[]};
 context.a={name:'A',moves:['Earthquake','<unsafe>']};context.b={name:'B',moves:['Moonblast']};
 vm.runInContext('renderResult(raw,a,b)',context);
 return nodes;
}
test('entry abilities and attack drops before turn one are shown in the battle log',()=>{
 const parser=html.slice(html.indexOf('function parseBattle(log){'),
  html.indexOf('function hpCard(',html.indexOf('function parseBattle(log){')));
 const context=vm.createContext({
  unSplit:log=>log,sideOf:s=>s?.startsWith('p1')?'p1':'p2',
  hpInfo:()=>({now:100,max:100}),printActor:s=>s,
  korean:()=>'',abilityKo:{Intimidate:'위협'},statKo:{atk:'공격'}
 });
 vm.runInContext(parser,context);
 context.lines=[
  '|switch|p1a: Salamence|Salamence|100/100',
  '|switch|p2a: Garchomp|Garchomp|100/100',
  '|-ability|p1a: Salamence|Intimidate|boost',
  '|-unboost|p2a: Garchomp|atk|1',
  '|turn|1',
  '|move|p1a: Salamence|Earthquake|p2a: Garchomp'
 ];
 const parsed=vm.runInContext('parseBattle(lines)',context);
 assert.ok(parsed.turns[0].intro.some(x=>x.text.includes('위협')));
 assert.ok(parsed.turns[0].intro.some(x=>x.text.includes('공격')&&x.text.includes('1랭크')));
});
test('result table distinguishes weighted probability bounds from sampled estimates',()=>{
 const exact=render({left:'move 1',right:'move 1',depth:3,exactSearch:{
  method:'exact-bounded-attack-game',certified:true,horizon:3,
  leftActions:['move 1','move 2'],rightActions:['move 1'],
  payoff:[[{winLowerPct:54.4605,winUpperPct:54.4643}],[{winLowerPct:0,winUpperPct:1}]]}});
 const table=exact.get('probability-matrix').innerHTML;
 assert.ok(table.includes('확률 합산'));assert.ok(table.includes('54.46'));
 assert.ok(table.includes('&lt;unsafe&gt;'));assert.ok(!table.includes('<unsafe>'));
 assert.ok(exact.get('policy-info').textContent.includes('확률을 합산'));
 const sample=render({left:'move 1',right:'move 1',depth:3,attackAudit:{
  method:'sampled-joint-opening-game',samples:64,side:'p1',chosen:null,candidates:[],
  leftActions:['move 1'],rightActions:['move 1'],
  payoff:[[{winLowerPct:50,winUpperPct:60}]]}});
 assert.ok(sample.get('probability-matrix').innerHTML.includes('조합별 64회 표본'));
 assert.ok(sample.get('probability-matrix').innerHTML.includes('신뢰구간은 아니며'));
 const tactical=render({left:'move 1',right:'move 1',depth:2,tacticalProbability:{
  method:'bounded-tactical-probability-game',applicable:true,applied:true,horizon:2,
  leftActions:['move 1','move 2'],rightActions:['move 1'],dominatedLeftActions:['move 2'],
  payoff:[[{winLowerPct:50,winUpperPct:60}],[{winLowerPct:0,winUpperPct:40}]]}});
 assert.ok(tactical.get('policy-info').textContent.includes('승률 하한'));
 assert.ok(tactical.get('probability-matrix').innerHTML.includes('반동·랭크업·앙코르'));
 assert.ok(tactical.get('probability-matrix').innerHTML.includes('다른 기술보다 불리함'));
});
