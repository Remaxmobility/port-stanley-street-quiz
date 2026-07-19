// Merges raw OSM ways into street records per port-stanley-street-quiz-PLAN.md sections 3.2/3.3.
const fs = require('fs');
const path = require('path');

// OSM tag names that are wrong per Jason's local knowledge (street was renamed,
// OSM not yet updated, etc). Applied before grouping so both raw files and any
// future Overpass re-pull stay untouched — this is the single place to fix names.
const nameOverrides = {
  'Hillcrest Drive': 'Franklin Drive',
  'Fairview Street': 'Brayside Street',
  'Fernie Street': 'Brayside Street',
  'Victoria Street': 'Harrison Place',
};

// Same idea as nameOverrides, but keyed by specific OSM way id instead of by
// name, for when only PART of a street's OSM-tagged extent is mistagged —
// renaming the whole name would be wrong here since the rest of "Bridge
// Street" is correctly named.
const wayNameOverrides = {
  // Per Jason: Bridge Street runs between Carlow Rd and Colborne St only.
  // Way 126454105 (42.6641853,-81.2156913 -> 42.6646400,-81.2147455) sits
  // entirely west of the Carlow Rd junction and its west end is the exact
  // node where George Street (126454194) ends — it's a mistagged
  // continuation of George Street, not part of Bridge Street.
  126454105: 'George Street',
};

// OSM ways that duplicate another way's geometry under the same street name,
// creating a branching triangle/cycle that breaks endpoint-based chaining
// (e.g. Colborne Street had two "residential"-tagged ways closely
// paralleling the "secondary"-tagged through-route between the same two
// junctions, which stopped the main chain short of reaching Joseph Street).
// Verified by checking each excluded way's coordinates sit within ~30m of
// an already-connected alternate path between the same two endpoints.
const excludeWayIds = new Set([
  126454147, // Colborne St (residential) — duplicates 126454125+1434586446
  126454230, // Colborne St (residential) — duplicates 1434586446
  126454134, // Selbourne Dr (2-pt straight) — duplicates 126454226 (13-pt
             // curve between the same two junction nodes); kept the more
             // detailed way. Without this the chain looped out-and-back
             // through both duplicates instead of continuing through.
  126454266, // Frances St (13-pt, 95m) — duplicates 126454107 (3-pt, 15m)
             // between the same two junction nodes only 15m apart in a
             // straight line; the direct way already bridges the main
             // chain cleanly, this detour was stranding itself as a
             // spurious separate 95m "Frances Street" quiz entry.
]);

const rawWithDupes = [
  ...JSON.parse(fs.readFileSync(path.join(__dirname, 'raw_main.json'))),
  ...JSON.parse(fs.readFileSync(path.join(__dirname, 'raw_residential.json'))),
  ...JSON.parse(fs.readFileSync(path.join(__dirname, 'raw_west.json'))),
  ...JSON.parse(fs.readFileSync(path.join(__dirname, 'raw_north.json'))),
]
  .filter(way => !excludeWayIds.has(way.id))
  .map(way => wayNameOverrides[way.id] ? { ...way, name: wayNameOverrides[way.id] } : way)
  .map(way => nameOverrides[way.name] ? { ...way, name: nameOverrides[way.name] } : way);

// Overlapping Overpass bbox queries legitimately return the same way twice
// when it crosses both boxes (e.g. East Road spans the original and north
// pulls) — dedupe by OSM way id, first occurrence wins, before chaining.
const seenIds = new Set();
const raw = rawWithDupes.filter(way => {
  if (seenIds.has(way.id)) return false;
  seenIds.add(way.id);
  return true;
});

function haversine([lat1, lon1], [lat2, lon2]) {
  const R = 6371000;
  const toRad = d => d * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.asin(Math.sqrt(a));
}

function segLength(geometry) {
  let len = 0;
  for (let i = 1; i < geometry.length; i++) len += haversine(geometry[i - 1], geometry[i]);
  return len;
}

function slugify(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

const highwayClassScore = { primary: 0, secondary: 1, tertiary: 2, unclassified: 2.5, residential: 3, service: 4 };

// Group segments by name, merge geometry chains, sum length.
const byName = new Map();
for (const way of raw) {
  const key = way.name;
  if (!byName.has(key)) byName.set(key, { name: key, highway: way.highway, segments: [] });
  const entry = byName.get(key);
  entry.segments.push(way.geometry);
  // Keep the "most major" highway class seen for this name (lowest score wins).
  if ((highwayClassScore[way.highway] ?? 3) < (highwayClassScore[entry.highway] ?? 3)) {
    entry.highway = way.highway;
  }
}

// Chain segments that share an endpoint into a single ordered polyline per street name.
function chainSegments(segments) {
  const remaining = segments.map(s => s.slice());
  const chains = [];
  while (remaining.length) {
    let chain = remaining.shift();
    let extended = true;
    while (extended) {
      extended = false;
      for (let i = 0; i < remaining.length; i++) {
        const seg = remaining[i];
        const a = chain[0], b = chain[chain.length - 1];
        const sa = seg[0], sb = seg[seg.length - 1];
        const close = (p, q) => Math.abs(p[0] - q[0]) < 1e-6 && Math.abs(p[1] - q[1]) < 1e-6;
        if (close(b, sa)) { chain = chain.concat(seg.slice(1)); remaining.splice(i, 1); extended = true; break; }
        if (close(b, sb)) { chain = chain.concat(seg.slice().reverse().slice(1)); remaining.splice(i, 1); extended = true; break; }
        if (close(a, sb)) { chain = seg.slice(0, -1).concat(chain); remaining.splice(i, 1); extended = true; break; }
        if (close(a, sa)) { chain = seg.slice().reverse().slice(0, -1).concat(chain); remaining.splice(i, 1); extended = true; break; }
      }
    }
    chains.push(chain);
  }
  return chains;
}

// Manual obscurity overrides from plan section 3.2 (Jason's local knowledge).
const manualWeight = {
  'main street': 1, 'bridge street': 1, 'colborne street': 1, 'william street': 1,
  'george street': 2, 'joseph street': 2, 'carlow road': 2, 'sunset drive': 2,
  'warren street': 3, 'east road': 3, 'lakeview street': 3, 'maud street': 3,
};

function isClosedLoop(geometry) {
  const a = geometry[0], b = geometry[geometry.length - 1];
  return Math.abs(a[0] - b[0]) < 1e-6 && Math.abs(a[1] - b[1]) < 1e-6;
}

const streets = [];
for (const [name, { highway, segments }] of byName.entries()) {
  let chains = chainSegments(segments);
  // Cul-de-sac turnaround loops attach to their street at an interior node,
  // not the loop way's own start/end — chainSegments only matches on
  // endpoints, so these end up as their own tiny closed-loop chain instead
  // of merging with the real street. When a name has another, non-loop
  // chain that already covers the street, drop small stray loops (<100m)
  // as redundant rather than quizzing them as a separate "street".
  if (chains.length > 1) {
    const hasNonLoopChain = chains.some(c => !isClosedLoop(c));
    if (hasNonLoopChain) {
      chains = chains.filter(c => !(isClosedLoop(c) && segLength(c) < 100));
    }
  }
  // one street record per contiguous chain (a name can have disconnected pieces, e.g. Front St in two parts)
  chains.forEach((geometry, idx) => {
    const lengthMeters = Math.round(segLength(geometry));
    if (lengthMeters < 5) return; // drop degenerate slivers
    const isDeadEnd = false; // not computed from topology yet; hand-review can flag true dead-ends later
    const score = (highwayClassScore[highway] ?? 3) + (lengthMeters < 150 ? 1 : 0) + (isDeadEnd ? 1 : 0);
    const key = name.toLowerCase();
    const weight = manualWeight[key] ?? Math.min(5, Math.max(1, Math.round(score)));
    const id = chains.length > 1 ? `${slugify(name)}-${idx + 1}` : slugify(name);
    streets.push({
      id,
      name,
      geometry,
      highwayClass: highway,
      lengthMeters,
      obscurityWeight: weight,
      points: 10 * weight,
    });
  });
}

streets.sort((a, b) => a.name.localeCompare(b.name));
fs.writeFileSync(path.join(__dirname, 'streets.json'), JSON.stringify(streets, null, 2));
console.log(`Wrote ${streets.length} streets to streets.json`);
console.log('Weight distribution:', streets.reduce((acc, s) => { acc[s.obscurityWeight] = (acc[s.obscurityWeight] || 0) + 1; return acc; }, {}));
