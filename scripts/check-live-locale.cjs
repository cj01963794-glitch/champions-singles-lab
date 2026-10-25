'use strict';
const assert=require('node:assert/strict');

(async()=>{
 const url='https://champions-singles-lab.onrender.com/api/catalog';
 const response=await fetch(url,{signal:AbortSignal.timeout(65000),headers:{
  'Cache-Control':'no-cache','User-Agent':'Champions-Lab-CI/locale-check'
 }});
 assert.equal(response.status,200,'Production catalog should return HTTP 200');
 const data=await response.json();
 const expected={
  'Indeedee':'에써르（수컷의 모습）',
  'Indeedee-F':'에써르（암컷의 모습）',
  'Basculegion':'대쓰여너（수컷의 모습）',
  'Basculegion-F':'대쓰여너（암컷의 모습）',
  'Meowstic':'냐오닉스（수컷의 모습）',
  'Meowstic-F':'냐오닉스（암컷의 모습）',
  'Oinkologne':'퍼퓨돈（수컷의 모습）',
  'Oinkologne-F':'퍼퓨돈（암컷의 모습）',
  'Rattata-Alola':'꼬렛（알로라의 모습）',
  'Charizard-Gmax':'리자몽（거다이맥스의 모습）'
 };
 const species=new Map(data.species.map(x=>[x.en,x.ko]));
 for(const [en,ko]of Object.entries(expected)){
  assert.equal(species.get(en),ko,'Production Korean form: '+en);
 }
 for(const kind of ['species','moves','items','abilities']){
  assert.ok(Array.isArray(data[kind])&&data[kind].length>200,'Expected full '+kind+' catalog');
  const missing=data[kind].filter(x=>!/[가-힣]/.test(x.ko));
  assert.deepEqual(missing.map(x=>x.en),[],
   'Production catalog contains untranslated '+kind);
  const mixed=kind==='species'?data[kind].filter(x=>/[A-Za-z]{3,}/.test(x.ko)):[];
  assert.deepEqual(mixed.map(x=>x.en+' → '+x.ko),[],
   'Production has mixed English / Korean form name');
  console.log('[LIVE-KO-COVERAGE]',kind,data[kind].length,'entries, 0 English-only');
 }
 assert.equal(species.has('Crucibelle-Mega'),false,'Exclude non-Champions CAP fake species');
 console.log('[LIVE-KO-VERIFIED] All supported Pokémon formes, incl. gendered variants, are Korean.');
})().catch(error=>{console.error('[LIVE-KO-FAILED]',error.stack||error);process.exitCode=1});
