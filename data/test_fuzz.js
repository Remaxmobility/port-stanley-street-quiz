// Backtest: exercise GameEngine.distanceToLineMeters/hitTolerance/submitGuess
// across every street in the live dataset plus edge cases, looking for
// throws or nonsensical results (not gameplay balance).
const fs = require('fs');
const path = require('path');
const GameEngine = require('../game-engine.js');
const streets = JSON.parse(fs.readFileSync(path.join(__dirname, 'streets.json')));

let checks = 0;
let failures = [];

function check(label, fn) {
  checks++;
  try {
    fn();
  } catch (e) {
    failures.push(`${label}: THREW ${e.message}`);
  }
}

function offsetMeters([lat, lon], dEast, dNorth) {
  const mPerDegLat = 111320;
  const mPerDegLon = 111320 * Math.cos(lat * Math.PI / 180);
  return [lat + dNorth / mPerDegLat, lon + dEast / mPerDegLon];
}

// Same equirectangular meter-space conversion the engine itself uses,
// anchored on a given reference geometry — needed so a "perpendicular in
// meters" offset actually stays perpendicular once projected back to
// lat/lon (raw degree-space perpendiculars are skewed by longitude
// compression and don't land at the intended distance).
function toXY(refLat, refLon, [lat, lon]) {
  const mPerDegLat = 111320;
  const mPerDegLon = 111320 * Math.cos(refLat * Math.PI / 180);
  return [(lon - refLon) * mPerDegLon, (lat - refLat) * mPerDegLat];
}
function fromXY(refLat, refLon, [x, y]) {
  const mPerDegLat = 111320;
  const mPerDegLon = 111320 * Math.cos(refLat * Math.PI / 180);
  return [refLat + y / mPerDegLat, refLon + x / mPerDegLon];
}

// 1. Every vertex of every street — must register as a hit (distance ~0).
streets.forEach(s => {
  s.geometry.forEach((pt, i) => {
    check(`${s.name} vertex ${i}`, () => {
      const d = GameEngine.distanceToLineMeters(pt[0], pt[1], s.geometry);
      if (d > 1) failures.push(`${s.name} vertex ${i}: expected ~0m, got ${d.toFixed(2)}m`);
    });
  });
});

// 2. Every segment midpoint — must register as a hit.
streets.forEach(s => {
  for (let i = 0; i < s.geometry.length - 1; i++) {
    const a = s.geometry[i], b = s.geometry[i + 1];
    const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    check(`${s.name} seg ${i} midpoint`, () => {
      const d = GameEngine.distanceToLineMeters(mid[0], mid[1], s.geometry);
      if (d > 1) failures.push(`${s.name} seg ${i} midpoint: expected ~0m, got ${d.toFixed(2)}m`);
    });
  }
});

// 3. Tap at exactly the tolerance boundary (perpendicular offset from a
// segment midpoint) — should be a hit at tolerance-1, a miss at tolerance+1.
streets.forEach(s => {
  const tol = GameEngine.hitTolerance(s.obscurityWeight);
  // Use the longest segment, not always segment 0: a short first segment on
  // a curving street puts a perpendicular test point closer to a different,
  // angled segment than the one it was offset from, which isn't an engine
  // bug (min-distance-across-all-segments is correct) but breaks this
  // specific test's assumption of a single reference edge.
  let a = s.geometry[0], b = s.geometry[1] || s.geometry[0], bestLen = 0;
  for (let i = 0; i < s.geometry.length - 1; i++) {
    const segLen = Math.hypot(s.geometry[i+1][0] - s.geometry[i][0], s.geometry[i+1][1] - s.geometry[i][1]);
    if (segLen > bestLen) { bestLen = segLen; a = s.geometry[i]; b = s.geometry[i+1]; }
  }
  const refLat = a[0], refLon = a[1];
  const axy = toXY(refLat, refLon, a), bxy = toXY(refLat, refLon, b);
  const dx = bxy[0] - axy[0], dy = bxy[1] - axy[1];
  const len = Math.hypot(dx, dy) || 1;
  const perp = [-dy / len, dx / len]; // unit perpendicular, meter space
  const midxy = [(axy[0] + bxy[0]) / 2, (axy[1] + bxy[1]) / 2];

  check(`${s.name} tolerance-1 hit`, () => {
    const pxy = [midxy[0] + perp[0] * (tol - 1), midxy[1] + perp[1] * (tol - 1)];
    const p = fromXY(refLat, refLon, pxy);
    const d = GameEngine.distanceToLineMeters(p[0], p[1], s.geometry);
    const hit = d <= tol;
    if (!hit) failures.push(`${s.name}: expected hit at tol-1 (d=${d.toFixed(1)}, tol=${tol})`);
  });
  check(`${s.name} tolerance+5 miss`, () => {
    // Skip for chains short/compact enough that the whole polyline fits
    // within a (tol+5) radius of itself (e.g. a small out-and-back spur) —
    // the offset point can legitimately swing back within tolerance of a
    // *different* part of the same real street, which is correct
    // min-distance behavior, not a bug.
    if (s.lengthMeters < (tol + 5) * 1.5) return;
    const pxy = [midxy[0] + perp[0] * (tol + 5), midxy[1] + perp[1] * (tol + 5)];
    const p = fromXY(refLat, refLon, pxy);
    const d = GameEngine.distanceToLineMeters(p[0], p[1], s.geometry);
    const hit = d <= tol;
    if (hit) failures.push(`${s.name}: expected miss at tol+5 (d=${d.toFixed(1)}, tol=${tol})`);
  });
});

// 4. Shared junction vertices between two different streets — tapping
// exactly on the shared node must not throw for either street's own
// distance check (ambiguity is a UX question, not a crash bug).
const vertexOwners = new Map(); // "lat,lon" -> [street names]
streets.forEach(s => {
  s.geometry.forEach(pt => {
    const key = pt.join(',');
    if (!vertexOwners.has(key)) vertexOwners.set(key, []);
    vertexOwners.get(key).push(s.name);
  });
});
let junctionCount = 0;
vertexOwners.forEach((names, key) => {
  const uniq = [...new Set(names)];
  if (uniq.length > 1) {
    junctionCount++;
    const [lat, lon] = key.split(',').map(Number);
    uniq.forEach(name => {
      const s = streets.find(x => x.name === name);
      check(`junction ${key} vs ${name}`, () => {
        GameEngine.distanceToLineMeters(lat, lon, s.geometry);
      });
    });
  }
});

// 5. Extreme / malformed input coordinates — must not throw.
const extremeInputs = [
  [0, 0], [90, 180], [-90, -180], [NaN, NaN], [Infinity, -Infinity],
  [42.669, -81.221 + 1e-12], [1e10, 1e10],
];
const sample = streets[0];
extremeInputs.forEach(([lat, lon]) => {
  check(`extreme input (${lat},${lon})`, () => {
    GameEngine.distanceToLineMeters(lat, lon, sample.geometry);
  });
});

// 6. Full submitGuess/nextRound loop through the entire deck, tapping the
// exact first vertex of whatever street is current each round (should be
// a hit every time, strikes should stay 0, no throws, pool drains fully).
check('full deck playthrough', () => {
  let state = GameEngine.init(streets.slice());
  let rounds = 0;
  while (state.roundStatus !== 'gameover') {
    const s = state.currentStreet;
    state = GameEngine.submitGuess(state, s.geometry[0][0], s.geometry[0][1]);
    if (!state.history[state.history.length - 1].hit) {
      failures.push(`full deck: round ${rounds} on ${s.name} was a MISS at its own vertex`);
    }
    state = GameEngine.nextRound(state);
    rounds++;
    if (rounds > streets.length + 2) { failures.push('full deck: exceeded expected round count, possible infinite loop'); break; }
  }
  if (rounds !== streets.length) failures.push(`full deck: expected ${streets.length} rounds, got ${rounds}`);
  if (state.strikes !== 0) failures.push(`full deck: expected 0 strikes, got ${state.strikes}`);
});

// 7. Double-submit on an already-answered state (simulates the historical
// double-tap-during-transition bug at the engine level) — must not throw,
// and must not silently double-award points beyond what submitGuess itself computes.
check('double submitGuess on same state (no mutation)', () => {
  let state = GameEngine.init(streets.slice());
  const s = state.currentStreet;
  const r1 = GameEngine.submitGuess(state, s.geometry[0][0], s.geometry[0][1]);
  const r2 = GameEngine.submitGuess(state, s.geometry[0][0], s.geometry[0][1]);
  if (r1.score !== r2.score) failures.push(`double submitGuess: r1.score=${r1.score} != r2.score=${r2.score} (state was mutated)`);
});

console.log(`${checks} checks run across ${streets.length} streets (${junctionCount} shared junction nodes)`);
if (failures.length) {
  console.log(`\n${failures.length} FAILURES:`);
  failures.forEach(f => console.log(' - ' + f));
  process.exit(1);
} else {
  console.log('ALL FUZZ CHECKS PASSED');
}
