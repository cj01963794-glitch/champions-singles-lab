'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {validate,battle,legal,simulation}=require('../server.cjs');
const floette={name:'HS명상메플라',species:'Floette-Mega',nature:'Timid',
 item:'Floettite',ability:'Fairy Aura',preMegaAbility:'Flower Veil',
 moves:['Moonblast','Synthesis','Draining Kiss','Calm Mind'],
 evs:{hp:22,atk:0,def:11,spa:1,spd:0,spe:32}};
const charizard={name:'HB와자몽',species:'Charizard-Mega-Y',nature:'Bold',
 item:'Charizardite Y',ability:'Drought',preMegaAbility:'Blaze',
 moves:['Flamethrower','Solar Beam','Dragon Pulse','Roost'],
 evs:{hp:32,atk:0,def:32,spa:2,spd:0,spe:0}};
test('Mega source forme comes from Mega Stone, not generic baseSpecies',()=>{
 const f=validate(floette);
 assert.equal(f.species,'Floette-Eternal');
 assert.equal(f.ability,'Flower Veil');
 assert.equal(f.item,'Floettite');
 const b=battle(floette,charizard);
 assert.ok(legal(b,'p1').includes('move 4 mega'),'Eternal Floette must be able to Mega with Calm Mind');
 assert.ok(legal(b,'p2').includes('move 1 mega'),'Charizard Y must be able to Mega');
 b.makeChoices('move 4 mega','move 1 mega');
 assert.equal(b.p1.pokemon[0].species.name,'Floette-Mega');
 assert.equal(b.p2.pokemon[0].species.name,'Charizard-Mega-Y');
 assert.equal(b.p1.pokemon[0].boosts.spa,1);
 assert.equal(b.p1.pokemon[0].boosts.spd,1);
 assert.equal(b.field.weather,'sunnyday');
});
test('other Mega evolutions with ordinary stones remain unchanged',()=>{
 const z={species:'Dragonite-Mega',item:'Dragoninite',nature:'Modest',ability:'Multiscale',
 moves:['Draco Meteor','Extreme Speed'],evs:{hp:2,spa:32,spe:32}};
 assert.equal(validate(z).species,'Dragonite');
 const c={species:'Charizard-Mega-Y',item:'Charizardite Y',nature:'Bold',
 ability:'Drought',preMegaAbility:'Blaze',moves:['Flamethrower'],evs:{hp:32,def:32,spa:2}};
 assert.equal(validate(c).species,'Charizard');
});
