'use strict';
const {catalog,koData,dex}=require('../server.cjs');
for(const category of ['species','moves','items','abilities']){
 const entries=catalog[category];
 const missing=entries.filter(x=>!/[가-힣]/.test(x.ko));
 console.log('[KO-COVERAGE]',category,JSON.stringify({total:entries.length,untranslated:missing.length,
  items:missing.map(x=>x.en).slice(0,160)}));
}
const targets=['Indeedee','Indeedee-F','Basculegion','Basculegion-F',
 'Meowstic','Meowstic-F','Pyroar','Pyroar-F','Oinkologne','Oinkologne-F',
 'Espurr','Maushold','Meowstic-M-Mega','Meowstic-F-Mega','Basculin-Blue-Striped',
 'Urshifu-Rapid-Strike','Rotom-Wash','Tauros-Paldea-Aqua','Crucibelle-Mega'];
for(const name of targets){
 const x=dex.species.get(name);
 const y=catalog.species.find(z=>z.id===x.id);
 console.log('[KO-FORM]',JSON.stringify({name,exists:x.exists,id:x.id,baseSpecies:x.baseSpecies,
  forme:x.forme,formeLetter:x.formeLetter,gender:x.gender,ko:y?.ko,originalText:koData.Pokedex?.[x.id],
  baseText:koData.Pokedex?.[dex.species.get(x.baseSpecies).id]}));
}
