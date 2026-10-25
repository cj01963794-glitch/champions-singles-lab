'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {catalog,dex,koData,koName}=require('../server.cjs');
const map=new Map(catalog.species.map(x=>[x.id,x]));
const translated=name=>{
 const p=dex.species.get(name);
 assert.ok(p.exists,name+' should exist in the current Showdown build');
 return map.get(p.id)?.ko;
};
test('gendered Pokémon show distinct Korean male and female form names',()=>{
 const pairs=[
  ['Indeedee','Indeedee-F','에써르'],
  ['Basculegion','Basculegion-F','대쓰여너'],
  ['Meowstic','Meowstic-F','냐오닉스'],
  ['Oinkologne','Oinkologne-F','퍼퓨돈']
 ];
 for(const [male,female,base] of pairs){
  const m=translated(male),f=translated(female);
  assert.equal(m,base+'（수컷의 모습）',male);
  assert.equal(f,base+'（암컷의 모습）',female);
  assert.notEqual(m,f,'Gender-specific moves/stats must remain distinguishable');
 }
});
test('regional, Gigantamax, multi-form and recently released Pokémon have Korean labels',()=>{
 const expected={
  'Rattata-Alola':'꼬렛（알로라의 모습）',
  'Growlithe-Hisui':'가디（히스이의 모습）',
  'Farfetch’d-Galar':'파오리（가라르의 모습）',
  'Tauros-Paldea-Aqua':'켄타로스（워터종（팔데아의 모습））',
  'Charizard-Gmax':'리자몽（거다이맥스의 모습）',
  'Maushold':'파밀리쥐（3마리 가족）',
  'Maushold-Four':'파밀리쥐（4마리 가족）',
  'Urshifu-Rapid-Strike':'우라오스（연격의 태세）',
  'Zygarde-10%':'지가르데（10%폼）',
  'Toxtricity-Low-Key':'스트린더（로우한 모습）',
  'Alcremie-Matcha-Cream':'마휘핑（말차밀키）',
  'Dudunsparce-Three-Segment':'노고고치（세마디폼）'
 };
 for(const [name,ko]of Object.entries(expected))assert.equal(translated(name),ko,name);
});
test('every official Pokémon form has visible Korean labeling',()=>{
 const bad=catalog.species.filter(x=>dex.species.get(x.id).num>0&&!/[가-힣]/.test(x.ko));
 assert.deepEqual(bad.map(x=>x.en+' → '+x.ko),[],
  'Official Pokémon forms must never quietly fall back to English names.');
});
test('all official forms avoid untranslated English words inside Korean labels',()=>{
 const bad=catalog.species.filter(x=>{
  const p=dex.species.get(x.id);
  return p.num>0&&/[A-Za-z]{3,}/.test(x.ko);
 });
 assert.deepEqual(bad.map(x=>x.en+' → '+x.ko),[],
  'Mixed-language form labels must be explicitly localized before deploying.');
});
test('moves, items and abilities have no silent English-only labels',()=>{
 for(const group of ['moves','items','abilities']){
  const missing=catalog[group].filter(x=>!/[가-힣]/.test(x.ko));
  assert.deepEqual(missing.map(x=>x.en),[],group+' untranslated');
 }
});
test('supported Mega formes retain their Korean form distinctions',()=>{
 for(const [name,ko]of [
  ['Meowstic-M-Mega','메가냐오닉스（수컷의 모습）'],
  ['Meowstic-F-Mega','메가냐오닉스（암컷의 모습）'],
  ['Garchomp-Mega-Z','메가한카리아스Z']
 ])assert.equal(translated(name),ko);
});

test('official Pokémon selection excludes unused Showdown CAP fan data',()=>{
 assert.equal(catalog.species.some(x=>dex.species.get(x.id).num<=0),false);
 assert.equal(catalog.species.some(x=>x.en==='Crucibelle-Mega'),false);
 for(const [kind,en] of [['moves','Paleo Wave'],['items','Crucibellite'],
  ['abilities','Mountaineer']]){
  assert.equal(catalog[kind].some(x=>x.en===en),false);
 }
});
test('playable formes from the same Pokémon keep distinct Korean names',()=>{
 const byBase=new Map();
 for(const x of catalog.species){
  const base=dex.species.get(x.id).baseSpecies;
  const seen=byBase.get(base)||new Map();
  const old=seen.get(x.ko);
  assert.equal(old,undefined,
   base+' has two indistinguishable Korean form labels: '+old+' and '+x.en+
   ' both '+x.ko);
  seen.set(x.ko,x.en);
  byBase.set(base,seen);
 }
});
