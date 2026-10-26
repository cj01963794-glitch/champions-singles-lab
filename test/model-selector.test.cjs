'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
test('both models offered and request carries model without overwriting stored samples',()=>{
 const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
 assert.match(html,/<select id="engine-model"/);
 assert.match(html,/<option value="legacy" selected>/);
 assert.match(html,/<option value="experimental">/);
 assert.match(html,/document\.getElementById\('engine-model'\)\.value/);
 assert.match(html,/JSON\.stringify\(\{a,b,maxTurns:[^}]+rngSeed,model\}\)/);
 const scripts=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)];
 assert.ok(scripts.length>=1);
 for(const [,source] of scripts)assert.doesNotThrow(()=>new vm.Script(source,{filename:'index.html'}));
});
test('legacy remains the default API model and experimental is explicitly opted in',()=>{
 const s=fs.readFileSync(path.join(__dirname,'..','server.cjs'),'utf8');
 assert.match(s,/const model=x\.model\|\|'legacy'/);
 assert.match(s,/model==='experimental'\?/);
 assert.match(s,/\.simulateExperimental\(/);
 assert.match(s,/\.\.\.simulation\(x\.a,x\.b/);
});