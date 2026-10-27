'use strict';
// New Stage 1B only. The existing server's pinned Showdown Champions mod
// remains the authority for all mechanics, move data and legal actions.
const crypto = require('node:crypto');

function hashSeed(text) {
  const h = crypto.createHash('sha256').update(String(text)).digest();
  return [0, 2, 4, 6].map(i => h.readUInt16BE(i));
}
function makeRandom(seed) {
  let x = crypto.createHash('sha256').update(String(seed)).digest().readUInt32BE(0) || 1;
  return () => {
    x ^= x << 13; x ^= x >>> 17; x ^= x << 5;
    return (x >>> 0) / 4294967296;
  };
}
function snapshot(B) {
  if (typeof B.toJSON !== 'function') throw Error('Pinned Showdown state serializer not available');
  // Pinned Showdown's serializeBattle() deliberately returns battle.log BY
  // REFERENCE. Never let a saved search state share the live battle's log.
  const saved=B.toJSON();
  saved.log=Array.isArray(saved.log)?saved.log.slice():saved.log;
  return saved;
}
function restore(saved, Sim, randomSeed) {
  if (!Sim?.Battle || typeof Sim.Battle.fromJSON !== 'function')
    throw Error('Pinned Showdown battle state restoration is unavailable');
  // The state is the same; only future chance events change between trials.
  // Branching from identical saved RNG without reseeding samples one chance
  // outcome indefinitely, producing a false-looking probability estimate.
  // Pinned State.deserializeBattle() assigns battle.log = state.log (not a
  // clone). Without isolating it, every trial appends to the SAME log,
  // corrupts the live fight and eventually trips Showdown's 1000-line guard
  // (misleadingly reported as "Infinite loop").
  const state = {...saved,
    log: Array.isArray(saved.log)?saved.log.slice():saved.log,
    ...(randomSeed == null?{}:{prng: hashSeed(randomSeed)})
  };
  return Sim.Battle.fromJSON(state);
}
function legal(B, side, deps) {
  // One common authoritative path for legal moves and optional Mega.
  return deps.legal(B, side);
}
function signature(B) {
  // Full serialized post-turn state, excluding history and future RNG.
  // Do not merge merely because HP matches: PP, boosts, volatiles, items,
  // Mega/ability/field counters and other mechanics can change future play.
  const state = snapshot(B);
  delete state.log; delete state.prng; delete state.hints;
  return crypto.createHash('sha256').update(JSON.stringify(state)).digest('hex');
}
function terminalValue(B) {
  if (!B.ended) return null;
  if (B.winner === 'Left' || B.winner === 'p1') return 1;
  if (B.winner === 'Right' || B.winner === 'p2') return 0;
  return 0.5;
}
function uncertainValue(B) {
  // A heuristic score, NOT a win probability. Only used for unfinished
  // rollouts, clearly tracked as unresolved in diagnostics.
  const p1 = B.getSide('p1')?.pokemon?.[0];
  const p2 = B.getSide('p2')?.pokemon?.[0];
  if (!p1 || !p2) return 0.5;
  const frac = p => p.maxhp ? Math.min(1, Math.max(0,p.hp/p.maxhp)) : 0;
  const h = frac(p1) - frac(p2);
  // Deliberately weak static tiebreak. Avoid pretending a temporary HP
  // advantage is a proof that setup/healing cannot win.
  return Math.max(0.25, Math.min(0.75,0.5 + h * 0.25));
}
module.exports = {hashSeed, makeRandom, snapshot, restore, legal, signature, terminalValue, uncertainValue};
