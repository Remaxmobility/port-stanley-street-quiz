// Pure state-machine game engine per port-stanley-street-quiz-PLAN.md section 4.
const GameEngine = {
  init(streets) {
    const streetPool = GameEngine._shuffle(streets.slice());
    const currentStreet = streetPool.length ? streetPool.shift() : null;
    return {
      score: 0,
      strikes: 0,
      streetPool,
      currentStreet,
      roundStatus: 'prompting',
      history: [],
    };
  },

  hitTolerance(obscurityWeight) {
    if (obscurityWeight <= 1) return 45;
    if (obscurityWeight === 2) return 35;
    if (obscurityWeight === 3) return 28;
    return 20; // 4-5
  },

  // Equirectangular projection to a local planar frame in meters, then
  // point-to-segment distance (not just point-to-vertex) for every edge.
  distanceToLineMeters(lat, lon, geometry) {
    const latRef = geometry[0][0];
    const mPerDegLat = 111320;
    const mPerDegLon = 111320 * Math.cos(latRef * Math.PI / 180);
    const toXY = ([pLat, pLon]) => [
      (pLon - geometry[0][1]) * mPerDegLon,
      (pLat - geometry[0][0]) * mPerDegLat,
    ];
    const p = toXY([lat, lon]);

    let min = Infinity;
    for (let i = 0; i < geometry.length - 1; i++) {
      const a = toXY(geometry[i]);
      const b = toXY(geometry[i + 1]);
      min = Math.min(min, GameEngine._pointToSegmentDist(p, a, b));
    }
    return min;
  },

  _pointToSegmentDist(p, a, b) {
    const abx = b[0] - a[0], aby = b[1] - a[1];
    const apx = p[0] - a[0], apy = p[1] - a[1];
    const lenSq = abx * abx + aby * aby;
    let t = lenSq === 0 ? 0 : (apx * abx + apy * aby) / lenSq;
    t = Math.max(0, Math.min(1, t));
    const cx = a[0] + t * abx, cy = a[1] + t * aby;
    return Math.hypot(p[0] - cx, p[1] - cy);
  },

  // Pure: returns a new state, does not mutate the input.
  submitGuess(state, lat, lon) {
    const street = state.currentStreet;
    const distance = GameEngine.distanceToLineMeters(lat, lon, street.geometry);
    const tolerance = GameEngine.hitTolerance(street.obscurityWeight);
    const hit = distance <= tolerance;
    const pointsAwarded = hit ? street.points : 0;
    const strikes = hit ? state.strikes : state.strikes + 1;
    const roundStatus = hit ? 'correct' : (strikes >= 3 ? 'gameover' : 'miss');

    return {
      ...state,
      score: state.score + pointsAwarded,
      strikes,
      roundStatus,
      history: [...state.history, {
        street, guessLatLng: { lat, lon }, hit, pointsAwarded, distance,
      }],
    };
  },

  // Pure: advances to the next street (or game over if pool empty / already over).
  nextRound(state) {
    if (state.roundStatus === 'gameover' || state.streetPool.length === 0) {
      return { ...state, roundStatus: 'gameover', currentStreet: null };
    }
    const streetPool = state.streetPool.slice();
    const currentStreet = streetPool.shift();
    return { ...state, streetPool, currentStreet, roundStatus: 'prompting' };
  },

  _shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  },
};

if (typeof module !== 'undefined') module.exports = GameEngine;
