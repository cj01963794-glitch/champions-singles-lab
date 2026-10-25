'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
const start=html.indexOf('function selectedLibraryItem(){');
const end=html.indexOf('async function refreshLibrary(',start);
const source=html.slice(start,end);
function mount(){
 const nodes=new Map();
 const select=()=>({
  value:'',options:[],
  replaceChildren(){this.options=[];this.value=''},
  appendChild(option){this.options.push(option);if(!this.value)this.value=option.value}
 });
 nodes.set('library-search',{value:''});
 nodes.set('library-sort',{value:'pokemon'});
 nodes.set('library-items',select());
 nodes.set('library-count',{textContent:''});
 nodes.set('library-selected-info',{textContent:''});
 const labels={Garchomp:'한카리아스',Primarina:'누리레느',
  'Sceptile-Mega':'메가나무킹',Corviknight:'아머까오'};
 const ctx=vm.createContext({Intl,document:{
  getElementById(id){return nodes.get(id)},
  createElement(){return {value:'',textContent:''}}
 },natureKo:{Jolly:'명랑'},
 normalized:s=>String(s||'').normalize('NFKC').trim().toLocaleLowerCase(),
 korean:(kind,s)=>kind==='species'?labels[s]||s:s});
 vm.runInContext('let libraryItems=[];\nconst libraryEl=id=>document.getElementById(id);\n'+source,ctx);
 return {nodes,ctx,setItems:items=>{ctx.rawItems=items;vm.runInContext('libraryItems=rawItems',ctx)},
  render:()=>vm.runInContext('renderLibraryItems()',ctx),
  options:()=>nodes.get('library-items').options.map(o=>({id:o.value,label:o.textContent}))};
}
function row(id,species,name,updatedAt){
 return {id,sample:{species,name,nature:'Jolly',moves:['Earthquake']},updatedAt};
}
const entries=[
 row('a','Garchomp','스카프형','2026-10-24T12:00:00Z'),
 row('b','Primarina','자뭉형','2026-10-26T12:00:00Z'),
 row('c','Sceptile-Mega','칼춤형','2026-10-25T12:00:00Z'),
 row('d','Corviknight','철벽형','2026-10-23T12:00:00Z'),
 row('e','Primarina','구애안경형','2026-10-25T10:00:00Z')
];
test('saved samples default to Korean Pokémon alphabetical order with species-first labels',()=>{
 const ui=mount();ui.setItems(entries);ui.render();
 assert.deepEqual(ui.options().map(x=>x.label),[
  '누리레느 · 구애안경형','누리레느 · 자뭉형',
  '메가나무킹 · 칼춤형','아머까오 · 철벽형','한카리아스 · 스카프형'
 ]);
 assert.equal(ui.nodes.get('library-count').textContent,'(5/5개)');
 assert.equal(ui.nodes.get('library-sort').value,'pokemon');
});
test('recent and sample-name sorts preserve chosen sample identity',()=>{
 const ui=mount();ui.setItems(entries);ui.render();
 const sel=ui.nodes.get('library-items');
 sel.value='c';
 ui.nodes.get('library-sort').value='recent';ui.render();
 assert.deepEqual(ui.options().map(x=>x.id),['b','c','e','a','d']);
 assert.equal(sel.value,'c');
 ui.nodes.get('library-sort').value='sample';ui.render();
 assert.deepEqual(ui.options().map(x=>x.id),['e','a','b','d','c']);
 assert.equal(sel.value,'c');
});
test('search matches Korean Pokémon names and sample names with species-first template',()=>{
 const ui=mount();ui.setItems(entries);
 ui.nodes.get('library-search').value='누리';
 ui.render();
 assert.deepEqual(ui.options().map(x=>x.label),['누리레느 · 구애안경형','누리레느 · 자뭉형']);
 ui.nodes.get('library-search').value='칼춤';
 ui.render();
 assert.deepEqual(ui.options().map(x=>x.label),['메가나무킹 · 칼춤형']);
});
test('sort control refreshes after Korean catalog load and browser script parses',()=>{
 assert.match(html,/<select id="library-sort"/);
 assert.match(html,/value="pokemon" selected/);
 assert.match(html,/libraryEl\('library-sort'\)\.addEventListener\('change',\(\)=>renderLibraryItems\(\)\)/);
 assert.match(html,/if\(libraryItems.length\)renderLibraryItems\(\)/);
 const script=html.slice(html.indexOf('<script>')+8,html.indexOf('</script>'));
 assert.doesNotThrow(()=>new Function(script));
});
