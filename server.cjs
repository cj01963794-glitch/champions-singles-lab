'use strict';
const http=require('node:http');
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
 const megaItem=spc.isMega?(spc.requiredItem||spc.requiredItems?.[0]):'';
 const species=spc.isMega?spc.baseSpecies:spc.name;
 const item=input.item||megaItem||'';
 if(item&&!dex.items.get(item).exists)throw Error('Unknown item '+item);
 const nature=dex.natures.get(input.nature||'Serious');if(!nature.exists)throw Error('Unknown nature');
 return {name:input.name||species,species,nature:nature.name,ability:input.ability||dex.species.get(species).abilities['0'],item,moves,evs,level:50};
}
function battle(a,b){
 const B=new Sim.Battle({formatid:FORMAT,seed:'1579,3137,6027,8191'});
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
function simulation(a,b,depth=120){
 depth=Number.isInteger(depth)?Math.min(250,Math.max(1,depth)):120;
 const B=battle(a,b),choices=[];
 const started=Date.now();
 let stopReason='';
 for(let t=0;t<depth&&!B.ended;t++){
  if(Date.now()-started>18000){stopReason='compute_timeout';break}
  const L=legal(B,'p1'),R=legal(B,'p2');
  if(!L.length||!R.length){stopReason='no_available_actions';break}
  // Clone the live battle state to evaluate this turn. Replaying a long
  // history for every candidate was quadratic in the number of turns.
  const snapshot=JSON.stringify(B.toJSON());
  let bestL=L[0],bestR=R[0],max=-Infinity,min=Infinity;
  const matrix=[];
  for(let i=0;i<L.length;i++){
   const row=[];
   for(let j=0;j<R.length;j++){
    const tmp=Sim.Battle.fromJSON(snapshot);
    tmp.makeChoices(L[i],R[j]);
    row.push(score(tmp));
   }
   matrix.push(row);
  }
  for(let i=0;i<L.length;i++){
   const worst=Math.min(...matrix[i]);
   if(worst>max){max=worst;bestL=L[i]}
  }
  for(let j=0;j<R.length;j++){
   const worst=Math.max(...matrix.map(row=>row[j]));
   if(worst<min){min=worst;bestR=R[j]}
  }
  B.makeChoices(bestL,bestR);
  choices.push([bestL,bestR]);
 }
 if(!B.ended&&!stopReason)stopReason=choices.length>=depth?'turn_limit':'other';
 return {
  winner:B.ended?(B.winner||'draw'):'unresolved',
  stopReason:B.ended?'battle_ended':stopReason,
  log:B.log, // Keep the complete battle log, including turns 1-9
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
const koName=(type,obj)=>koData[type]?.[obj.id]?.name||obj.name;
const abilityList=(s)=>{
 const initial=(s.isMega && s.baseSpecies)?dex.species.get(s.baseSpecies):s;
 return [...new Set(Object.values(initial.abilities||{}))].filter(Boolean).map(en=>({
   id:dex.abilities.get(en).id,en:dex.abilities.get(en).name,
   ko:koName('Abilities',dex.abilities.get(en))
 }));
};
const catalog={
 species:dex.species.all().filter(x=>x.exists).map(x=>({
   id:x.id,en:x.name,ko:koName('Pokedex',x),
   abilities:abilityList(x),megaItem:x.isMega?(x.requiredItem||x.requiredItems?.[0]||''):''
 })),
 moves:dex.moves.all().filter(x=>x.exists).map(x=>({id:x.id,en:x.name,ko:koName('Moves',x)})),
 items:dex.items.all().filter(x=>x.exists).map(x=>({id:x.id,en:x.name,ko:koName('Items',x)})),
 abilities:dex.abilities.all().filter(x=>x.exists).map(x=>({id:x.id,en:x.name,ko:koName('Abilities',x)}))
};
console.log('[CATALOG]',Object.fromEntries(Object.entries(catalog).map(([k,v])=>[k,v.length])));
console.log('[KO-CHECK]',JSON.stringify({
 garchomp:catalog.species.find(x=>x.en==='Garchomp'),
 megametagross:catalog.species.find(x=>x.en==='Metagross-Mega'),
 earthquake:catalog.moves.find(x=>x.en==='Earthquake'),
 focusSash:catalog.items.find(x=>x.en==='Focus Sash')
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
  if(pathname==='/api/duel'&&req.method==='POST'){let s='';for await(const c of req){s+=c;if(s.length>100000)throw Error('Request too large')};const x=JSON.parse(s);return respond(res,simulation(x.a,x.b,Number(x.maxTurns)||120))}
  return respond(res,{error:'Not found',method:req.method,path:pathname},404);
 }catch(e){console.error('[REQUEST_ERROR]',e.stack||e);return respond(res,{error:String(e.message||e)},400)}
});
server.listen(port,'0.0.0.0',()=>{
 console.log('[START] Listening on',port,'Showdown mod:',dex.currentMod);

 // Diagnostic: candidate move outcomes on a representative Primarina/Cinderace matchup.
 try{
   const prima={species:'Primarina',name:'누리레느 테스트',nature:'Modest',item:'Sitrus Berry',ability:'Torrent',moves:['Moonblast','Sparkling Aria','Aqua Jet','Encore'],evs:{hp:32,spa:32,spe:2}};
   const cinder={species:'Cinderace',name:'에이스번 테스트',nature:'Jolly',item:'Wide Lens',ability:'Libero',moves:['Gunk Shot','U-turn','Pyro Ball','High Jump Kick'],evs:{hp:2,atk:32,spe:32}};
   const base=battle(prima,cinder);
   const l=legal(base,'p1'),r=legal(base,'p2'),snapshot=JSON.stringify(base.toJSON());
   let grid=[];
   for(const left of l){
     let row=[];
     for(const right of r){
       const tmp=Sim.Battle.fromJSON(snapshot);
       tmp.makeChoices(left,right);
       const p1=tmp.getSide('p1').pokemon[0],p2=tmp.getSide('p2').pokemon[0];
       row.push({choice:right,move:cinder.moves[Number(right.match(/move (\d+)/)?.[1]||1)-1],value:score(tmp),hp1:p1.hp,hp2:p2.hp,ended:tmp.ended,winner:tmp.winner,events:tmp.log.filter(x=>x.startsWith('|move|')||x.startsWith('|-miss|')||x.startsWith('|-damage|')||x.startsWith('|-ability|')||x.startsWith('|-start|')).slice(-14)});
     }
     grid.push({against:prima.moves[Number(left.match(/move (\d+)/)?.[1]||1)-1],row});
   }
   console.log('[CINDER-PRIMARINA-GRID]',JSON.stringify(grid));
   const duel=simulation(prima,cinder,3);console.log('[CINDER-PRIMARINA-CHOICE]',JSON.stringify({choices:duel.choices,events:duel.log.filter(x=>x.startsWith('|move|')||x.startsWith('|-miss|')||x.startsWith('|-damage|')).slice(0,18)}))
 }catch(e){console.error('[CINDER-PRIMARINA-ERROR]',e.stack||e)}

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
