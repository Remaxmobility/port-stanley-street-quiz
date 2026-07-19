const GameEngine = require('../game-engine.js');

function assert(cond, msg) { if (!cond) throw new Error('FAIL: ' + msg); console.log('ok:', msg); }

// distance-to-line: point exactly on a segment should be ~0
const geom = [[42.6600, -81.2100], [42.6610, -81.2100]]; // vertical line, ~111m long
const d0 = GameEngine.distanceToLineMeters(42.6605, -81.2100, geom);
assert(d0 < 1, `on-line point distance ~0 (got ${d0.toFixed(2)}m)`);

// point ~41m east of the line (0.0005 deg lon * 111320*cos(42.66deg) m/deg ~= 40.9m)
const d1 = GameEngine.distanceToLineMeters(42.6605, -81.2095, geom);
assert(d1 > 38 && d1 < 44, `off-line point distance ~41m (got ${d1.toFixed(2)}m)`);

// point beyond the segment endpoint (should clamp to nearest endpoint, not infinite line)
const d2 = GameEngine.distanceToLineMeters(42.6620, -81.2100, geom);
const expected = GameEngine._pointToSegmentDist; // sanity: distance from (42.6620,-81.2100) to endpoint (42.6610,-81.2100) ~ 111m
assert(d2 > 100 && d2 < 120, `beyond-endpoint clamps correctly (got ${d2.toFixed(2)}m)`);

// hitTolerance mapping
assert(GameEngine.hitTolerance(1) === 45, 'tolerance weight 1 = 45');
assert(GameEngine.hitTolerance(2) === 35, 'tolerance weight 2 = 35');
assert(GameEngine.hitTolerance(3) === 28, 'tolerance weight 3 = 28');
assert(GameEngine.hitTolerance(4) === 20, 'tolerance weight 4 = 20');
assert(GameEngine.hitTolerance(5) === 20, 'tolerance weight 5 = 20');

// init: pool excludes current street, pool decreases as rounds advance
const streets = [
  { id: 'a', name: 'A St', geometry: geom, obscurityWeight: 1, points: 10 },
  { id: 'b', name: 'B St', geometry: geom, obscurityWeight: 2, points: 20 },
  { id: 'c', name: 'C St', geometry: geom, obscurityWeight: 3, points: 30 },
];
let state = GameEngine.init(streets);
assert(state.currentStreet !== null, 'init sets currentStreet');
assert(state.streetPool.length === 2, 'init pool excludes currentStreet');
assert(state.score === 0 && state.strikes === 0, 'init score/strikes zero');

// submitGuess purity: original state untouched
const before = JSON.stringify(state);
const afterHit = GameEngine.submitGuess(state, 42.6605, -81.2100);
assert(JSON.stringify(state) === before, 'submitGuess does not mutate input state');
assert(afterHit.roundStatus === 'correct', 'on-target guess -> correct');
assert(afterHit.score === state.currentStreet.points, 'score increments by street points on hit');
assert(afterHit.history.length === 1, 'history records the round');

const afterMiss = GameEngine.submitGuess(state, 0, 0);
assert(afterMiss.roundStatus === 'miss', 'far-off guess -> miss');
assert(afterMiss.strikes === 1, 'miss increments strikes');

// 3 strikes -> gameover
let s2 = GameEngine.init(streets);
s2 = GameEngine.submitGuess(s2, 0, 0);
s2 = GameEngine.nextRound(s2);
s2 = GameEngine.submitGuess(s2, 0, 0);
s2 = GameEngine.nextRound(s2);
s2 = GameEngine.submitGuess(s2, 0, 0);
assert(s2.strikes === 3, 'three misses -> 3 strikes');
assert(s2.roundStatus === 'gameover', 'three strikes -> gameover');

// nextRound after gameover stays gameover
const s3 = GameEngine.nextRound(s2);
assert(s3.roundStatus === 'gameover', 'nextRound after gameover stays gameover');
assert(s3.currentStreet === null, 'gameover clears currentStreet');

// pool exhaustion -> gameover even without 3 strikes
let s4 = GameEngine.init(streets); // pool has 2 left
s4 = GameEngine.nextRound(GameEngine.submitGuess(s4, 42.6605, -81.2100)); // 1 left
s4 = GameEngine.nextRound(GameEngine.submitGuess(s4, 42.6605, -81.2100)); // 0 left, this call advances to last street
s4 = GameEngine.nextRound(GameEngine.submitGuess(s4, 42.6605, -81.2100)); // pool now empty -> gameover
assert(s4.roundStatus === 'gameover', 'exhausted pool -> gameover');

console.log('\\nALL TESTS PASSED');
