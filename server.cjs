'use strict';
const http=require('node:http');
const {randomBytes}=require('node:crypto');
const Sim=require(process.env.SHOWDOWN_PACKAGE_PATH || 'pokemon-showdown');
const FORMAT='gen9championscustomgame';
const dex=Sim.Dex.forFormat(FORMAT);
if(dex.currentMod!=='champions')throw Error('Champions mod missing');
const stats=['hp','atk','def','spa','spd','spe'];
const samples=[
 {species:'Garchomp',name:'한카리아스 기띠',nature:'Jolly',item:'Focus Sash',ability:'Rough Skin',moves:['Earthquake','Dragon Claw','Swords Dance','Stone Edge'],evs:{hp:2,atk:32,spe:32}},
 {species:'Metagross',name:'메타그로스 냉동펀치',nature:'Jolly',item:'Metagrossite',ability:'Clear Body',moves:['Ice Punch','Bullet Punch','Meteor Mash','Earthquake'],evs:{hp:2,atk:32,spe:32}},
];
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const id=s=>String(s||'').toLowerCase().replace(/[^a-z0-9]/g,'');
function validate(input){
 if(!input||typeof input!=='object')throw Error('Missing Pokémon');
 const spc=dex.species.get(input.species);
 if(!spc.exists)throw Error('Unknown Pokémon '+input.species);
 const moves=(input.moves||[]).filter(Boolean).map(m=>{const x=dex.moves.get(m);if(!x.exists)throw Error('Unknown move '+m);return x.name}).slice(0,4);
 if(!moves.length)throw Error('No moves');
 const evs={};for(const k of stats)evs[k]=Number(input.evs?.[k]??input.sp?.[k]??0);
 if(Object.values(evs).some(x=>!Number.isInteger(x)||x<0||x>32)||Object.values(evs).reduce((a,b)=>a+b,0)>66)throw Error('Invalid SP');
 const mega=!!spc.isMega;
 const species=mega?spc.baseSpecies:spc.name;
 const base=dex.species.get(species);
 const neededItem=mega?(spc.requiredItem||spc.requiredItems?.[0]||''):'';
 const item=input.item||neededItem||'';
 if(item&&!dex.items.get(item).exists)throw Error('Unknown item '+item);
 if(mega && neededItem && dex.items.get(item).id!==dex.items.get(neededItem).id)
  throw Error(spc.name+' needs '+neededItem+' to activate its Mega ability');
 const allowedPre=Object.values(base.abilities||{});
 const allowedPost=Object.values(spc.abilities||{});
 let preAbility=input.preMegaAbility||'';
 if(mega){
  const selected=input.ability||'';
  if(selected&&!allowedPost.includes(selected)&&!allowedPre.includes(selected))
   throw Error('Unknown Mega ability '+selected+' for '+spc.name);
  if(!preAbility&&allowedPre.includes(selected))preAbility=selected; // compatibility with older saved sets
  if(!preAbility)preAbility=base.abilities['0'];
  if(!allowedPre.includes(preAbility))throw Error('Invalid pre-Mega ability '+preAbility);
 }else{
  preAbility=input.ability||base.abilities['0'];
  if(!allowedPre.includes(preAbility))throw Error('Invalid ability '+preAbility);
 }
 const nature=dex.natures.get(input.nature||'Serious');
 if(!nature.exists)throw Error('Unknown nature');
 return {name:input.name||species,species,nature:nature.name,ability:preAbility,item,moves,evs,level:50};
}
function battle(a,b,seed='1579,3137,6027,8191'){
 const B=new Sim.Battle({formatid:FORMAT,seed});
 B.setPlayer('p1',{name:'Left',team:[validate(a)]});B.setPlayer('p2',{name:'Right',team:[validate(b)]});
 for(const k of ['p1','p2']){const s=B.getSide(k);if(s.activeRequest?.teamPreview)B.choose(k,'team 1')}
 return B;
}
function legal(B,k){
 const r=B.getSide(k)?.activeRequest?.active?.[0];
 if(!r)return [];
 const mega=r.canMegaEvo?' mega':'';
 return (r.moves||[]).map((m,i)=>!m.disabled&&m.pp!==0?'move '+(i+1)+mega:null).filter(Boolean);
}
function score(B){const a=B.getSide('p1').pokemon[0],b=B.getSide('p2').pokemon[0];
 if(B.ended)return B.winner==='Left'?10000:B.winner==='Right'?-10000:0;
 const v=p=>p.hp/p.maxhp*150+11*(p.boosts.atk+p.boosts.spa+p.boosts.spe)+6*(p.boosts.def+p.boosts.spd);
 return v(a)-v(b);
}

const policySeed=(turn,sample)=>{
 const i=sample+1,t=turn+1;
 return [11017+3701*i+131*t,23011+4219*i+337*t,33013+2749*i+271*t,41017+5563*i+193*t].map(x=>x%65536).join(',');
};
function newRngSeed(){
 const bytes=randomBytes(8);
 return [0,2,4,6].map(i=>bytes.readUInt16BE(i)).join(',');
}
function checkedRngSeed(s){
 if(s==null||s==='')return newRngSeed();
 if(typeof s!=='string'||!/^\d{1,5}(,\d{1,5}){3}$/.test(s)||s.split(',').some(x=>Number(x)>65535))
  throw Error('Invalid RNG seed');
 return s;
}

function resolveMatrix(matrix,L,R){
 let bestL=L[0],bestR=R[0],bestLeft=-Infinity,bestRight=Infinity;
 for(let i=0;i<L.length;i++){
  const worst=Math.min(...matrix[i]);
  if(worst>bestLeft){bestLeft=worst;bestL=L[i]}
 }
 for(let j=0;j<R.length;j++){
  const worst=Math.max(...matrix.map(row=>row[j]));
  if(worst<bestRight){bestRight=worst;bestR=R[j]}
 }
 return {left:bestL,right:bestR,leftValue:bestLeft,rightValue:bestRight};
}
// Values at the end of the entire searched line, not only the first turn.
// Follow-up moves use actual HP, stat boosts and consumed items from Showdown.
// Only the second ply is beam-pruned for CPU cost; the root still considers
// every legal move, including every setup option. This pruning ranks coverage
// and move roles but never scores the final result without Showdown simulation.
function followChoiceBeam(B,side,actions,limit=2){
 if(actions.length<=limit)return actions;
 const active=B.getSide(side).pokemon[0];
 const foe=B.getSide(side==='p1'?'p2':'p1').pokemon[0];
 const scored=actions.map(action=>{
  const idx=Number(action.match(/move (\d+)/)?.[1]||0)-1;
  const id=active.moveSlots[idx]?.id;
  const m=B.dex.moves.get(id);
  if(!m.exists)return {action,attack:false,rank:-99};
  if(m.category==='Status'){
   const priorityStatus=new Set(['encore','taunt','protect','substitute','recover','roost',
    'swordsdance','dragondance','calmmind','nastyplot','irondefense','shellsmash',
    'bulkup','quiverdance','willowisp','toxic','leechseed']);
   return {action,attack:false,rank:priorityStatus.has(m.id)?90:20};
  }
  const sameType=active.getTypes().includes(m.type)?1.5:1;
  let effectiveness=1;
  for(const type of foe.getTypes()){
   const eff=B.dex.getEffectiveness(m.type,type);
   effectiveness*=eff>0?2**eff:eff<0?2**eff:1;
  }
  if(B.dex.getImmunity(m.type,foe)===false)effectiveness=0;
  const rank=(m.basePower||0)*sameType*effectiveness*(typeof m.accuracy==='number'?m.accuracy/100:1)+
    (m.priority>0?20:0);
  return {action,attack:true,rank};
 });
 const attacks=scored.filter(x=>x.attack).sort((a,b)=>b.rank-a.rank);
 const tactical=scored.filter(x=>!x.attack).sort((a,b)=>b.rank-a.rank);
 const keep=[];
 if(attacks.length)keep.push(attacks[0]);
 if(tactical.length&&keep.length<limit)keep.push(tactical[0]);
 for(const x of [...attacks.slice(1),...tactical.slice(1)])
  if(keep.length<limit&&!keep.includes(x))keep.push(x);
 return keep.slice(0,limit).map(x=>x.action);
}

function evalOneTurn(position,turn,samples=2,deadline=Infinity,beamLimit=0){
 if(position.ended)return {value:score(position)};
 const L0=legal(position,'p1'),R0=legal(position,'p2');
 const L=beamLimit?followChoiceBeam(position,'p1',L0,beamLimit):L0;
 const R=beamLimit?followChoiceBeam(position,'p2',R0,beamLimit):R0;
 if(!L.length||!R.length)return {value:score(position)};
 const saved=JSON.stringify(position.toJSON());
 const matrix=Array.from({length:L.length},()=>Array(R.length).fill(0));
 for(let k=0;k<samples;k++){
  if(Date.now()>deadline)return null;
  const seed=policySeed(turn,k+13);
  for(let i=0;i<L.length;i++)for(let j=0;j<R.length;j++){
   const branch=Sim.Battle.fromJSON(saved);
   branch.resetRNG(seed);
   branch.makeChoices(L[i],R[j]);
   matrix[i][j]+=score(branch)/samples;
  }
 }
 const selected=resolveMatrix(matrix,L,R);
 return {value:selected.leftValue,left:selected.left,right:selected.right,matrix};
}
function hasTacticalMove(B){
 const tactical=new Set(['swordsdance','dragondance','nastyplot','calmmind','bulkup','irondefense','agility','shellsmash',
  'coil','quiverdance','curse','cosmicpower','amnesia','stockpile','recover','roost','slackoff','softboiled',
  'shoreup','synthesis','moonlight','morningsun','wish','substitute','encore','taunt','protect',
  'rest','strengthsap','leechseed','toxic','willowisp']);
 return ['p1','p2'].some(side=>{
  const p=B.getSide(side).pokemon[0];
  return p.moveSlots.some(m=>tactical.has(m.id)) || (p.item&&B.dex.items.get(p.item).isBerry);
 });
}
function evalTwoTurn(position,turn,deadline){
 const L=legal(position,'p1'),R=legal(position,'p2');
 if(!L.length||!R.length)return null;
 const saved=JSON.stringify(position.toJSON());
 const matrix=Array.from({length:L.length},()=>Array(R.length).fill(0));
 const samples=3;
 for(let k=0;k<samples;k++){
  const seed=policySeed(turn,k+29);
  for(let i=0;i<L.length;i++)for(let j=0;j<R.length;j++){
   if(Date.now()>deadline)return null;
   const branch=Sim.Battle.fromJSON(saved);
   branch.resetRNG(seed);
   branch.makeChoices(L[i],R[j]);
   const future=branch.ended?score(branch):evalOneTurn(branch,turn+1,1,deadline,2)?.value;
   if(future===undefined||future===null)return null;
   matrix[i][j]+=future/samples;
  }
 }
 const selected=resolveMatrix(matrix,L,R);
 return {...selected,depth:2,matrix,L,R};
}
function simulation(a,b,depth=120,rngSeed){
 depth=Number.isInteger(depth)?Math.min(250,Math.max(1,depth)):120;
 const actualSeed=checkedRngSeed(rngSeed);
 const B=battle(a,b,actualSeed),choices=[];
 const started=Date.now(),globalDeadline=started+18000;
 let stopReason='',planned=0,fallbacks=0;
 const decisionDetails=[];
 for(let t=0;t<depth&&!B.ended;t++){
  if(Date.now()>globalDeadline){stopReason='compute_timeout';break}
  const L=legal(B,'p1'),R=legal(B,'p2');
  if(!L.length||!R.length){stopReason='no_available_actions';break}
  let choice=null,depthUsed=1;
  // Planning runs when set-up, healing, disabling or a consumable Berry may
  // change the outcome across turns. Budgeted to preserve Render responsiveness.
  if(t<6 && hasTacticalMove(B) && Date.now()-started<10000){
   const deadline=Math.min(Date.now()+6500,globalDeadline-2200);
   const deep=evalTwoTurn(B,t,deadline);
   if(deep){choice=deep;depthUsed=2;planned++}
   else fallbacks++;
  }
  if(!choice){
   const shallow=evalOneTurn(B,t,t<3?8:t<20?4:2,globalDeadline-500);
   if(!shallow){stopReason='compute_timeout';break}
   choice={left:shallow.left,right:shallow.right};
  }
  B.makeChoices(choice.left,choice.right);
  choices.push([choice.left,choice.right]);
  if(t<6)decisionDetails.push({turn:t+1,depth:depthUsed,left:choice.left,right:choice.right});
 }
 if(!B.ended&&!stopReason)stopReason=choices.length>=depth?'turn_limit':'other';
 return {
  winner:B.ended?(B.winner||'draw'):'unresolved',
  stopReason:B.ended?'battle_ended':stopReason,
  policy:'conditional-two-turn-adversarial-search',
  tacticalTurns:planned,searchFallbacks:fallbacks,decisionDetails,
  rngSeed:actualSeed,log:B.log,
  choices,turns:choices.length,maxTurns:depth
 };
}

function page(){return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>챔피언즈 싱글 대면 실험실</title><style>body{font-family:system-ui;background:#0c1220;color:#e8eef9;max-width:840px;margin:auto;padding:20px}h1{font-size:25px}section{background:#182238;border:1px solid #34425d;border-radius:16px;padding:18px;margin:16px 0}input,select,button,textarea{box-sizing:border-box;width:100%;background:#10192b;color:#e8eef9;border:1px solid #40516d;border-radius:8px;padding:10px;margin:5px 0}button{background:#426cf2;border:0;font-weight:bold;cursor:pointer}label{font-size:13px;color:#b6c4dc}.grid{display:grid;grid-template-columns:1fr 1fr;gap:15px}@media(max-width:650px){.grid{grid-template-columns:1fr}}.muted{color:#b6c4dc;font-size:13px}pre{white-space:pre-wrap;overflow:auto}</style></head><body><h1>챔피언즈 1대1 대면 분석기</h1><p class="muted">쇼다운 챔피언즈 싱글 배틀 엔진 · 실험용 자동 행동 정책 (승률/랭킹 정확도 미검증)</p><div class="grid"><section><h2>A 샘플</h2><textarea id="a" rows="13"></textarea></section><section><h2>B 샘플</h2><textarea id="b" rows="13"></textarea></section></div><section><button id="run">1대1 자동 대면 계산</button><pre id="result"></pre><details><summary>지원 데이터 검색</summary><input id="q" placeholder="English Pokémon / Move / Item"><pre id="matches"></pre></details></section><script>
const examples=${JSON.stringify(samples)};
document.getElementById('a').value=JSON.stringify(examples[0],null,2);document.getElementById('b').value=JSON.stringify(examples[1],null,2);
document.getElementById('run').onclick=async()=>{const out=document.getElementById('result');out.textContent='계산 중...';try{const r=await fetch('/api/duel',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({a:JSON.parse(document.getElementById('a').value),b:JSON.parse(document.getElementById('b').value)})});const v=await r.json();out.textContent=r.ok?JSON.stringify(v,null,2):'오류: '+v.error}catch(e){out.textContent='오류: '+e.message}};
let catalog;
document.getElementById('q').oninput=async e=>{if(!catalog)catalog=await(await fetch('/api/catalog')).json();const q=e.target.value.toLowerCase();document.getElementById('matches').textContent=q.length<2?'':JSON.stringify(Object.fromEntries(Object.entries(catalog).map(([k,v])=>[k,v.filter(x=>x.toLowerCase().includes(q)).slice(0,12)])),null,2)};
</script></body></html>`}

const koData=dex.loadTextData('ko');
// The source's Korean text may localize "baseSpecies" or "forme" without
// localizing "name", especially for gendered and regional forms.
const verifiedKoreanBaseExceptions={floette:'플라엣테',zygarde:'지가르데'};
const nativeBaseName=(english)=>{
 const species=dex.species.get(english);
 const ancestor=dex.species.get(species.baseSpecies||english);
 for(const obj of [species,ancestor]){
  const data=koData.Pokedex?.[obj.id]||{};
  if(data.name&&/[가-힣]/.test(data.name))return data.name;
  if(data.baseSpecies&&/[가-힣]/.test(data.baseSpecies))return data.baseSpecies;
 }
 return verifiedKoreanBaseExceptions[ancestor.id]||null;
};
const megaSuffix=(forme)=>{
 const m=/^Mega(?:-([XYZ]))?$/i.exec(forme||'');
 return m?(m[1]||''):'';
};
const koName=(type,obj)=>{
 const data=koData[type]?.[obj.id]||{};
 const official=data.name;
 if(official&&official!==obj.name)return official;
 if(type==='Pokedex'&&obj.isMega){
  // Some Korean mega-form labels exist only in the "forme" field, and
  // include important distinctions such as male/female, color, and posture.
  if(data.forme&&/[가-힣]/.test(data.forme)&&data.forme.startsWith('메가'))return data.forme;
  const base=nativeBaseName(obj.baseSpecies);
  if(base){
   if(/^Mega(?:-[XYZ])?$/i.test(obj.forme||'')){
    return '메가'+base+megaSuffix(obj.forme);
   }
   // Unlocalized irregular Mega-form labels are kept distinguishable.
   const variant=(obj.forme||'').replace(/-?Mega$/i,'').replace(/^Mega-?/i,'');
   return '메가'+base+(variant?' ('+variant+')':'');
  }
 }
 if(type==='Items'&&obj.megaStone&&typeof obj.megaStone==='object'){
  const pairs=Object.entries(obj.megaStone);
  if(pairs.length){
   const bases=[...new Set(pairs.map(([en])=>nativeBaseName(en)))];
   const targets=pairs.map(([,target])=>dex.species.get(target));
   if(bases.length===1&&bases[0]&&targets.every(t=>t.exists&&t.isMega)){
    const suffixes=[...new Set(targets.map(t=>megaSuffix(t.forme)))];
    const suffix=suffixes.length===1?suffixes[0]:'';
    return bases[0]+'나이트'+suffix;
   }
  }
 }
 return official||obj.name;
};
const abilityList=(s)=>[...new Set(Object.values(s.abilities||{}))].filter(Boolean).map(en=>{
 const x=dex.abilities.get(en);return {id:x.id,en:x.name,ko:koName('Abilities',x)};
});
const catalog={
 species:dex.species.all().filter(x=>x.exists).map(x=>({
   id:x.id,en:x.name,ko:koName('Pokedex',x),
   isMega:!!x.isMega,baseSpecies:x.baseSpecies,
   abilities:abilityList(x),
   baseAbilities:x.isMega?abilityList(dex.species.get(x.baseSpecies)):[],
   megaItem:x.isMega?(x.requiredItem||x.requiredItems?.[0]||''):''
 })),
 moves:dex.moves.all().filter(x=>x.exists).map(x=>({id:x.id,en:x.name,ko:koName('Moves',x)})),
 items:dex.items.all().filter(x=>x.exists).map(x=>({id:x.id,en:x.name,ko:koName('Items',x)})),
 abilities:dex.abilities.all().filter(x=>x.exists).map(x=>({id:x.id,en:x.name,ko:koName('Abilities',x)}))
};
console.log('[CATALOG]',Object.fromEntries(Object.entries(catalog).map(([k,v])=>[k,v.length])));
const translationAudit=(()=>{
 const allMega=dex.species.all().filter(x=>x.exists&&x.isMega);
 const allStones=dex.items.all().filter(x=>x.exists&&x.megaStone&&Object.keys(x.megaStone).length>0);
 const uncapturedSpecies=allMega.filter(x=>!/[가-힣]/.test(koName('Pokedex',x)));
 const uncapturedStones=allStones.filter(x=>!/[가-힣]/.test(koName('Items',x)));
 const generatedSpecies=allMega.filter(x=>!/[가-힣]/.test(koData.Pokedex?.[x.id]?.name||'')&&/[가-힣]/.test(koName('Pokedex',x)));
 const generatedStones=allStones.filter(x=>!/[가-힣]/.test(koData.Items?.[x.id]?.name||'')&&/[가-힣]/.test(koName('Items',x)));
 return {
  totalMegaForms:allMega.length,totalMegaStones:allStones.length,
  generatedSpecies:generatedSpecies.length,generatedStones:generatedStones.length,
  untranslatedSpecies:uncapturedSpecies.map(x=>x.name),
  untranslatedStones:uncapturedStones.map(x=>x.name),
  sample:{
   meowsticM:koName('Pokedex',dex.species.get('Meowstic-M-Mega')),
   meowsticF:koName('Pokedex',dex.species.get('Meowstic-F-Mega')),
   meowsticite:koName('Items',dex.items.get('Meowsticite')),
   tatsugiriCurly:koName('Pokedex',dex.species.get('Tatsugiri-Curly-Mega')),
   tatsugirinite:koName('Items',dex.items.get('Tatsugirinite')),
   floettite:koName('Items',dex.items.get('Floettite')),
   zygardite:koName('Items',dex.items.get('Zygardite')),
   delphox:koName('Pokedex',dex.species.get('Delphox-Mega')),
   delphoxite:koName('Items',dex.items.get('Delphoxite')),
   chandelure:koName('Pokedex',dex.species.get('Chandelure-Mega')),
   chandelurite:koName('Items',dex.items.get('Chandelurite')),
   garchompZ:koName('Pokedex',dex.species.get('Garchomp-Mega-Z')),
   garchompiteZ:koName('Items',dex.items.get('Garchompite Z')),
   charizardX:koName('Pokedex',dex.species.get('Charizard-Mega-X')),
   charizarditeX:koName('Items',dex.items.get('Charizardite X'))
  }
 };
})();
console.log('[TRANSLATION-AUDIT]',JSON.stringify(translationAudit));

console.log('[KO-CHECK]',JSON.stringify({
 garchomp:catalog.species.find(x=>x.en==='Garchomp'),
 megametagross:catalog.species.find(x=>x.en==='Metagross-Mega'),
 earthquake:catalog.moves.find(x=>x.en==='Earthquake'),
 focusSash:catalog.items.find(x=>x.en==='Focus Sash'),
 garchompMegaZ:catalog.species.find(x=>x.en==='Garchomp-Mega-Z'),
 garchompiteZ:catalog.items.find(x=>x.en==='Garchompite Z')
}));

const port=Number(process.env.PORT)||10000;
const server=http.createServer(async(req,res)=>{
 const pathname=new URL(req.url||'/', 'http://localhost').pathname.replace(/\/+$/, '')||'/';
 console.log('[HTTP]',req.method,req.url,'=>',pathname);
 try{
  if((pathname==='/'||pathname==='/index.html'||!pathname.startsWith('/api/'))&&req.method==='GET'){
   if(pathname==='/favicon.ico'){res.writeHead(204);return res.end()}
   res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});return res.end(require('node:fs').readFileSync(require('node:path').join(__dirname,'index.html'),'utf8'));
  }
  if(pathname==='/api/health'&&req.method==='GET')return respond(res,{ok:true,engine:'pokemon-showdown',mod:dex.currentMod});
  if(pathname==='/api/catalog'&&req.method==='GET')return respond(res,catalog);
  if(pathname==='/api/duel'&&req.method==='POST'){let s='';for await(const c of req){s+=c;if(s.length>100000)throw Error('Request too large')};const x=JSON.parse(s);return respond(res,simulation(x.a,x.b,Number(x.maxTurns)||120,x.rngSeed))}
  return respond(res,{error:'Not found',method:req.method,path:pathname},404);
 }catch(e){console.error('[REQUEST_ERROR]',e.stack||e);return respond(res,{error:String(e.message||e)},400)}
});
server.listen(port,'0.0.0.0',()=>{
 console.log('[START] Listening on',port,'Showdown mod:',dex.currentMod);

 if(true){
 try{
  const b={species:'Baxcalibur-Mega',name:'HB메가드닐레이브',item:'Baxcalibrite',nature:'Impish',
    ability:'Thermal Exchange',preMegaAbility:'Thermal Exchange',
    moves:['Swords Dance','Thunder Fang','Earthquake','Ice Shard'],evs:{hp:32,def:32,spe:2}};
  const p={species:'Primarina',name:'자뭉누리레느',item:'Sitrus Berry',nature:'Modest',
    ability:'Torrent',moves:['Moonblast','Sparkling Aria','Ice Beam','Psychic'],evs:{hp:32,spa:32,spe:2}};
  const B=battle(b,p);
  const first=Date.now();
  const shallow=evalOneTurn(B,0,8);
  const deep=evalTwoTurn(B,0,Date.now()+10000);
  const two=[];
  for(const [label,firstMove] of [['SD','move 1 mega'],['ATTACK','move 2 mega']]){
   const sim=battle(b,p);
   sim.makeChoices(firstMove,'move 1');
   if(!sim.ended)sim.makeChoices('move 2','move 1');
   two.push({label,winner:sim.winner,remaining:[sim.getSide('p1').pokemon[0].hp,sim.getSide('p2').pokemon[0].hp],
     item:sim.getSide('p2').pokemon[0].item});
  }
  console.log('[TACTICAL-4MOVE-REGRESSION]',JSON.stringify({
   shallow:shallow?.left,deep:deep?.left,opponent:deep?.right,
   rows:deep?.matrix.map((v,i)=>[deep.L[i],Math.min(...v)]),
   scripted:two,ms:Date.now()-first}));
 }catch(e){console.error('[TACTICAL-4MOVE-ERROR]',e.stack||e)}
 }

 const check=(path,method='GET',payload)=>new Promise(resolve=>{
  const req=http.request({hostname:'127.0.0.1',port,path,method,headers:{'content-type':'application/json'}},res=>{
    let body='';res.on('data',c=>body+=c);res.on('end',()=>{
      let data={};try{data=JSON.parse(body)}catch(e){}
      const turns=Array.isArray(data.log)?data.log.filter(v=>v.startsWith('|turn|')).map(v=>Number(v.slice(6))):[];
      resolve({status:res.statusCode,type:res.headers['content-type'],body:body.slice(0,160),turns:data.turns,stopReason:data.stopReason,firstTurn:turns[0],lastTurn:turns.at(-1),loggedTurnCount:turns.length});
    });
  });req.on('error',e=>resolve({error:e.message}));if(payload)req.write(JSON.stringify(payload));req.end();
 });
 (async()=>{
  for(const [name,pth,met,data] of [
    ['home','/?source=smoketest','GET'],
    ['health','/api/health','GET'],
    ['duel','/api/duel','POST',{a:samples[0],b:samples[1]}],
    ['long-battle','/api/duel','POST',{
      a:{species:'Magikarp',name:'테스트 A',nature:'Jolly',ability:'Swift Swim',moves:['Splash']},
      b:{species:'Magikarp',name:'테스트 B',nature:'Jolly',ability:'Swift Swim',moves:['Splash']},maxTurns:25
    }]
  ]){try{let r=await check(pth,met,data);console.log('[SMOKETEST]',name,JSON.stringify(r))}catch(e){console.error('[SMOKETEST_FAIL]',name,e.stack||e)}}
 })();
});
function respond(res,x,status=200){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(x))}
