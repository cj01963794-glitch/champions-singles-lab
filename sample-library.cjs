'use strict';
const crypto=require('node:crypto');

const BRANCH='sample-library';
const PATH='data/samples.enc.json';
const REPOSITORY='cj01963794-glitch/champions-singles-lab';
class LibraryError extends Error{
 constructor(message,status=400){super(message);this.status=status}
}
function settings(env=process.env){
 const token=env.SAMPLES_GITHUB_TOKEN||'';
 const password=env.SAMPLES_ACCESS_KEY||'';
 return {token,password,repo:env.SAMPLES_GITHUB_REPO||REPOSITORY,
  branch:env.SAMPLES_GITHUB_BRANCH||BRANCH,
  enabled:!!token&&password.length>=16};
}
function authorized(candidate,env=process.env){
 const {password,enabled}=settings(env);
 if(!enabled)return false;
 const hash=value=>crypto.createHash('sha256').update(String(value||'')).digest();
 return crypto.timingSafeEqual(hash(candidate),hash(password));
}
function encrypt(items,password){
 const salt=crypto.randomBytes(16),iv=crypto.randomBytes(12);
 const key=crypto.scryptSync(password,salt,32);
 const cipher=crypto.createCipheriv('aes-256-gcm',key,iv);
 const encrypted=Buffer.concat([cipher.update(JSON.stringify(items),'utf8'),cipher.final()]);
 return {v:1,alg:'aes-256-gcm',kdf:'scrypt',
  salt:salt.toString('base64'),iv:iv.toString('base64'),
  tag:cipher.getAuthTag().toString('base64'),data:encrypted.toString('base64')};
}
function decrypt(record,password){
 if(record?.v!==1||record.alg!=='aes-256-gcm'||record.kdf!=='scrypt')
  throw new LibraryError('보관함 암호화 데이터 형식을 읽을 수 없어.',500);
 try{
  const key=crypto.scryptSync(password,Buffer.from(record.salt,'base64'),32);
  const decipher=crypto.createDecipheriv('aes-256-gcm',key,Buffer.from(record.iv,'base64'));
  decipher.setAuthTag(Buffer.from(record.tag,'base64'));
  const text=Buffer.concat([decipher.update(Buffer.from(record.data,'base64')),decipher.final()]).toString('utf8');
  const items=JSON.parse(text);
  if(!Array.isArray(items))throw Error('invalid array');
  return items;
 }catch(e){throw new LibraryError('보관함을 복호화할 수 없어. Render 비밀번호가 기존 저장 때와 같은지 확인해 줘.',500)}
}
function safeRepo(repo){
 if(!/^[a-z\d_.-]+\/[a-z\d_.-]+$/i.test(repo))throw new LibraryError('저장소 설정이 올바르지 않아.',503);
 return repo;
}
async function githubFetch(cfg,method,payload,client=globalThis.fetch){
 const path='https://api.github.com/repos/'+safeRepo(cfg.repo)+'/contents/'+PATH;
 const url=method==='GET'?path+'?ref='+encodeURIComponent(cfg.branch):path;
 const res=await client(url,{method,headers:{
  'Accept':'application/vnd.github+json','Authorization':'Bearer '+cfg.token,
  'X-GitHub-Api-Version':'2022-11-28','User-Agent':'champions-singles-lab',
  ...(payload?{'Content-Type':'application/json'}:{})
 },...(payload?{body:JSON.stringify(payload)}:{})});
 let data={};try{data=await res.json()}catch(e){}
 return {status:res.status,ok:res.ok,data};
}
async function readItems(cfg,client){
 const r=await githubFetch(cfg,'GET',null,client);
 if(r.status===404)return {items:[],sha:null};
 if(!r.ok)throw new LibraryError('GitHub 보관함을 불러오지 못했어. 토큰 권한과 저장소를 확인해 줘. ('+r.status+')',502);
 if(!r.data.sha||!r.data.content)throw new LibraryError('GitHub 보관함 응답이 비정상적이야.',502);
 let blob;
 try{blob=JSON.parse(Buffer.from(r.data.content.replace(/\s/g,''),'base64').toString('utf8'))}
 catch(e){throw new LibraryError('보관함 파일이 손상되었거나 형식이 맞지 않아.',500)}
 return {items:decrypt(blob,cfg.password),sha:r.data.sha};
}
function sanitize(sample,validate){
 if(!sample||typeof sample!=='object'||Array.isArray(sample))throw new LibraryError('샘플 정보가 올바르지 않아.');
 const name=String(sample.name||'').trim();
 if(!name||name.length>80)throw new LibraryError('샘플 이름을 1~80자로 지정해 줘.');
 if(!Array.isArray(sample.moves)||sample.moves.length<1||sample.moves.length>4)
  throw new LibraryError('기술은 1~4개 지정해 줘.');
 const clean={name,
  species:String(sample.species||''),
  nature:String(sample.nature||''),
  item:String(sample.item||''),
  ability:String(sample.ability||''),
  ...(sample.preMegaAbility?{preMegaAbility:String(sample.preMegaAbility)}:{}),
  moves:sample.moves.map(x=>String(x||'')),
  evs:Object.fromEntries(['hp','atk','def','spa','spd','spe'].map(k=>[k,Number(sample.evs?.[k]||0)]))};
 try{validate(clean)}catch(e){throw new LibraryError('샘플 검증 실패: '+e.message)}
 return clean;
}
async function listSamples({env=process.env,client=globalThis.fetch}={}){
 const cfg=settings(env);
 if(!cfg.enabled)throw new LibraryError('영구 저장이 아직 설정되지 않았어. Render에 SAMPLES_GITHUB_TOKEN과 SAMPLES_ACCESS_KEY를 등록해 줘.',503);
 const result=await readItems(cfg,client);
 return {items:result.items};
}
async function mutateSamples(payload,{env=process.env,client=globalThis.fetch,validate}={}){
 const cfg=settings(env);
 if(!cfg.enabled)throw new LibraryError('영구 저장소 설정이 완료되지 않았어.',503);
 if(!validate)throw new LibraryError('샘플 검증기를 사용할 수 없어.',500);
 if(!['save','delete'].includes(payload?.action))throw new LibraryError('지원하지 않는 보관함 동작이야.');
 const cleaned=payload.action==='save'?sanitize(payload.sample,validate):null;
 const targetId=String(payload.id||'');
 if(targetId&&!/^[a-zA-Z0-9-]{1,70}$/.test(targetId))throw new LibraryError('샘플 ID가 올바르지 않아.');
 for(let attempt=0;attempt<3;attempt++){
  const {items,sha}=await readItems(cfg,client);
  const next=items.map(x=>({...x})),index=next.findIndex(x=>x.id===targetId);
  let changedId=targetId;
  if(payload.action==='delete'){
   if(index<0)throw new LibraryError('삭제할 샘플을 찾을 수 없어. 보관함을 새로고침해 줘.',404);
   next.splice(index,1);
  }else{
   if(targetId&&index<0)throw new LibraryError('덮어쓸 샘플을 찾을 수 없어. 보관함을 새로고침해 줘.',409);
   if(!targetId&&next.length>=300)throw new LibraryError('보관함은 최대 300개까지 저장할 수 있어.');
   changedId=targetId||crypto.randomUUID();
   const saved={id:changedId,sample:cleaned,updatedAt:new Date().toISOString()};
   if(index>=0)next[index]=saved;else next.push(saved);
  }
  const file=JSON.stringify(encrypt(next,cfg.password));
  const encoded=Buffer.from(file,'utf8').toString('base64');
  const result=await githubFetch(cfg,'PUT',{message:'Update encrypted Pokémon sample library',
   content:encoded,branch:cfg.branch,...(sha?{sha}:{})},client);
  if(result.ok)return {items:next,id:changedId};
  if((result.status===409||result.status===422)&&attempt<2)continue;
  throw new LibraryError('GitHub 저장에 실패했어. 저장소 토큰의 Contents 읽기/쓰기 권한을 확인해 줘. ('+result.status+')',502);
 }
 throw new LibraryError('동시에 변경된 샘플이 있어. 보관함을 다시 열어 줘.',409);
}
module.exports={settings,authorized,encrypt,decrypt,sanitize,listSamples,mutateSamples,LibraryError};
