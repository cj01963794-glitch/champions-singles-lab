'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {settings,authorized,encrypt,decrypt,listSamples,mutateSamples,LibraryError}=require('../sample-library.cjs');
const password='correct horse battery staple long',token='fake-test-token';
const env={SAMPLES_GITHUB_TOKEN:token,SAMPLES_ACCESS_KEY:password};
const sample={name:'AS 메가나무킹',species:'Sceptile-Mega',nature:'Jolly',
 item:'Sceptilite',ability:'Lightning Rod',preMegaAbility:'Overgrow',
 moves:['Swords Dance','Leaf Blade','Earthquake','Rock Slide'],
 evs:{hp:2,atk:32,def:0,spa:0,spd:0,spe:32}};
function githubMock(){
 let file=null,serial=0,paths=[];
 const client=async(url,options)=>{
  assert.ok(url.includes('/repos/cj01963794-glitch/champions-singles-lab/contents/data/samples.enc.json'));
  assert.equal(options.headers.Authorization,'Bearer '+token);
  paths.push({url,method:options.method});
  if(options.method==='GET'){
   if(!file)return {status:404,ok:false,json:async()=>({message:'Not Found'})};
   return {status:200,ok:true,json:async()=>({sha:file.sha,
    content:Buffer.from(file.body,'utf8').toString('base64')})};
  }
  const payload=JSON.parse(options.body);
  assert.equal(payload.branch,'sample-library');
  if(file && payload.sha!==file.sha)return {status:409,ok:false,json:async()=>({})};
  if(!file && payload.sha!==undefined)return {status:409,ok:false,json:async()=>({})};
  file={body:Buffer.from(payload.content,'base64').toString('utf8'),sha:'sha'+(++serial)};
  return {status:200,ok:true,json:async()=>({content:{sha:file.sha}})};
 };
 return {client,files:()=>file,paths};
}
const validate=s=>{
 assert.ok(s.species&&s.moves.length);
 if(Object.values(s.evs).reduce((a,b)=>a+b,0)>66)throw Error('Too many SP');
};
test('vault requires configured strong password and correct access key',()=>{
 assert.equal(settings({}).enabled,false);
 assert.equal(settings({SAMPLES_GITHUB_TOKEN:token,SAMPLES_ACCESS_KEY:'weak'}).enabled,false);
 assert.equal(settings(env).enabled,true);
 assert.equal(authorized(password,env),true);
 assert.equal(authorized('wrong',env),false);
});
test('encrypted GitHub branch retains complete named Mega ability/move/SP samples',async()=>{
 const remote=githubMock();
 assert.deepEqual((await listSamples({env,client:remote.client})).items,[]);
 const a=await mutateSamples({action:'save',sample},{env,client:remote.client,validate});
 assert.equal(a.items.length,1);
 assert.ok(a.id);
 assert.equal(a.items[0].sample.preMegaAbility,'Overgrow');
 assert.deepEqual(a.items[0].sample.moves,sample.moves);
 const persisted=remote.files().body;
 assert.ok(!persisted.includes('Sceptile'));
 assert.ok(!persisted.includes('Leaf Blade'));
 assert.ok(!persisted.includes('AS 메가나무킹'));
 assert.equal(remote.paths.filter(x=>x.method==='PUT').length,1);
 assert.ok(remote.paths.some(x=>x.url.endsWith('?ref=sample-library')));
 const reload=await listSamples({env,client:remote.client});
 assert.deepEqual(reload.items,a.items);
 const modified={...sample,name:'칼춤 나무킹',moves:['Leaf Blade','Swords Dance']};
 const b=await mutateSamples({action:'save',id:a.id,sample:modified},{env,client:remote.client,validate});
 assert.equal(b.items.length,1);
 assert.equal(b.items[0].sample.name,'칼춤 나무킹');
 assert.equal(b.items[0].id,a.id);
 const after=await mutateSamples({action:'delete',id:a.id},{env,client:remote.client,validate});
 assert.deepEqual(after.items,[]);
 assert.deepEqual((await listSamples({env,client:remote.client})).items,[]);
});
test('password change cannot silently corrupt encrypted vault',async()=>{
 const blob=encrypt([{id:'123',sample}],password);
 assert.deepEqual(decrypt(blob,password)[0].sample,sample);
 assert.throws(()=>decrypt(blob,'different password'),/복호화/);
});
test('missing IDs and invalid/oversize SP are not saved',async()=>{
 const remote=githubMock();
 await assert.rejects(()=>mutateSamples({action:'save',id:'not-found',sample},{env,client:remote.client,validate}),e=>e.status===409);
 await assert.rejects(()=>mutateSamples({action:'save',sample:{...sample,evs:{hp:32,atk:32,def:32}}},{env,client:remote.client,validate}),/샘플 검증 실패/);
 assert.equal(remote.files(),null);
});
test('UI provides cross-device save, search, restore, overwrite and delete actions',()=>{
 const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
 for(const id of ['sample-library','library-unlock','library-search','library-items',
  'library-save-a','library-save-b','library-load-a','library-load-b',
  'library-update-a','library-update-b','library-delete','library-refresh'])
  assert.ok(html.includes('id="'+id+'"'),id);
 const script=html.slice(html.indexOf('<script>')+8,html.indexOf('</script>'));
 assert.doesNotThrow(()=>new Function(script));
 assert.ok(script.includes("fetch('/api/sample-library'"));
 assert.ok(script.includes("fetch('/api/sample-library/status'"));
 assert.ok(script.includes('sessionStorage'));
 assert.ok(!script.includes("localStorage.setItem('champions-library-session-key'"));
});
