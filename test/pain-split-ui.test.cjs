'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
test('front-end Pain Split sethp event must update both HP bars and turn text',()=>{
 const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
 const from=html.indexOf('function parseBattle(log){');
 const until=html.indexOf('function hpCard(',from);
 assert.ok(from>=0&&until>from);
 const src=html.slice(from,until);
 const ctx={
  sideOf:value=>{const m=String(value||'').match(/\\bp([12])a?:/);return m?'p'+m[1]:null},
  hpInfo:(raw,old)=>{const m=String(raw||'').match(/(\\d+)\\/(\\d+)/);return m?{now:+m[1],max:+m[2]}:null},
  unSplit:lines=>lines,
  printActor:s=>s==='p1'?'A':'B',
  korean:()=>'',abilityKo:{},statKo:{},statusKo:{}
 };
 vm.runInNewContext(src,ctx);
 const log=[
  '|switch|p1a: Rotom|Rotom-Heat, L50|90/157',
  '|switch|p2a: Scrafty|Scrafty-Mega, L50|140/159',
  '|turn|1','|move|p1a: Rotom|Pain Split|p2a: Scrafty',
  '|-sethp|p1a: Rotom|115/157|p2a: Scrafty|115/159','|turn|2'
 ];
 const parsed=ctx.parseBattle(log);
 assert.equal(parsed.state.p1.now,115);
 assert.equal(parsed.state.p2.now,115);
 assert.ok(parsed.turns[0].actions[0].details.some(v=>v.text.includes('p1')&&v.text.includes('115')));
 assert.ok(parsed.turns[0].actions[0].details.some(v=>v.text.includes('p2')&&v.text.includes('115')));
});