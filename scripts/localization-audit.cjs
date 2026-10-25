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

const unlocalized=catalog.species.filter(x=>!/[가-힣]/.test(x.ko));
const byBase=new Map();
for(const record of unlocalized){
 const dexEntry=dex.species.get(record.id);
 const ancestor=dex.species.get(dexEntry.baseSpecies);
 const baseText=koData.Pokedex?.[ancestor.id]||{};
 const raw=koData.Pokedex?.[record.id]||{};
 const group=byBase.get(ancestor.name)||{base:ancestor.name,baseKo:baseText.baseSpecies||baseText.name,
  forms:[]};
 group.forms.push({name:record.en,forme:dexEntry.forme,rawForme:raw.forme,rawName:raw.name});
 byBase.set(ancestor.name,group);
}
console.log('[KO-BASE-GROUPS]',JSON.stringify([...byBase.values()]));
const noBase=[...byBase.values()].filter(x=>!/[가-힣]/.test(x.baseKo||''));
console.log('[KO-BASE-UNTRANSLATED]',JSON.stringify(noBase));
