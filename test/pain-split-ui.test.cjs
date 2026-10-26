'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
test('the web UI updates HP for both Pokemon after Pain Split sethp events',()=>{
 const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
 const from=html.indexOf('function parseBattle(log){');
 const until=html.indexOf('function hpCard(',from);
 assert.ok(from>=0&&until>from);
 const ctx={
  sideOf:v=>String(v).includes('p1a:')?'p1':String(v).includes('p2a:')?'p2':null,
  hpInfo:raw=>{
   const t=String(raw||'').split('/');
   return t.length===2?{now:Number(t[0]),max:Number(t[1])}:null;
  },
  unSplit:log=>log,
  printActor:v=>v==='p1'?'p1':'p2',
  korean:()=>'',abilityKo:{},statKo:{},statusKo:{}
 };
 vm.runInNewContext(html.slice(from,until),ctx);
 const log=[
  '|switch|p1a: Rotom|Rotom-Heat, L50|90/157',
  '|switch|p2a: Scrafty|Scrafty-Mega, L50|140/159',
  '|turn|1','|move|p1a: Rotom|Pain Split|p2a: Scrafty',
  '|-sethp|p1a: Rotom|115/157|p2a: Scrafty|115/159',
  '|turn|2'
 ];
 const result=ctx.parseBattle(log);
 assert.equal(result.state.p1.now,115);
 assert.equal(result.state.p2.now,115);
 assert.ok(result.turns[0].actions[0].details.some(x=>x.text.includes('p1')&&x.text.includes('115')));
 assert.ok(result.turns[0].actions[0].details.some(x=>x.text.includes('p2')&&x.text.includes('115')));
});