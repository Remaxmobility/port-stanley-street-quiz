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
  // Merville St's end node (42.6661058,-81.2031083) is the exact start node
  // of Brayside St's existing chain — one continuous real street, OSM had
  // it split like the earlier Fairview/Fernie->Brayside case.
  'Merville Street': 'Brayside Street',
  // Per Jason: Main St runs from (42.665539,-81.211904) to
  // (42.663106,-81.210733). Jamieson St's end (42.6655206,-81.2119368) is
  // the exact node where main-street-1 already ends, and Jamieson's other
  // end (42.6654805,-81.2109452) is the exact node where Orchard St starts —
  // both mistagged pieces of the same real Main St. See mainStreetGapConnector
  // below for the real-but-OSM-absent stretch past Orchard's south end.
  'Jamieson Street': 'Main Street',
  'Orchard Street': 'Main Street',
  // Maple St's start node (42.665641,-81.2068849) is the exact end node of
  // Vimy Ridge's existing chain — one continuous real street.
  'Maple Street': 'Vimy Ridge',
  // Per Jason: the two "Spring"-family streets were swapped. The real
  // Spring St starts at Valley St's end (42.66455,-81.22903— confirmed
  // exact shared node with the OSM-tagged "Lower Spring Street" chain) and
  // continues past Bartholemew St (whose end node, 42.66354,-81.2316, is
  // already an interior point of that same chain). The OSM-tagged "Spring
  // Street" is a separate, geographically distinct road ~2km further west
  // (lon -81.236 vs -81.231) — that one is actually Upper Spring St, one of
  // the streets previously thought entirely absent from OSM.
  'Lower Spring Street': 'Spring Street',
  'Spring Street': 'Upper Spring Street',
  // Google Maps audit (session 6): our data lags Google's current naming on
  // these two. Applied per Jason's "correct to Google data" call — unlike
  // Spring St/Franklin Dr above, these have no prior direct local-knowledge
  // correction overriding Google, so Google wins.
  'Bostwick Street': 'Colonel Bostwick Street',
  '1st Street': 'First Street',
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
  997749168, // George St roundabout, tagged as a single 19-pt CLOSED loop
             // (start==end). Its junctions with George St's two chains are
             // at interior points (idx5, idx14 of the loop), not the loop's
             // own start/end, so endpoint-only chainSegments can't bridge
             // through it — replaced below by georgeRoundaboutConnector,
             // an open arc between those two exact junction points.
]);

// Per Jason: George St runs through the roundabout — currently split into
// two disconnected chains because chainSegments can't route through a
// closed-loop way (see excludeWayIds note above). Replace the loop with the
// shorter of its two arcs between the two real junction points, as a normal
// open way, so it chains like any other segment. Coordinates verified: idx5
// (42.665373,-81.2259571) is george-street-1's exact end node; idx14
// (42.6653439,-81.2256682) is george-street-0's exact start node.
const georgeRoundaboutConnector = {
  id: 'george-roundabout-connector',
  name: 'George Street',
  highway: 'residential',
  geometry: [
    [42.665373, -81.2259571], [42.6654064, -81.2259454], [42.6654353, -81.2259198],
    [42.6654568, -81.2258831], [42.6654686, -81.225839], [42.6654695, -81.225792],
    [42.6654393, -81.225709], [42.6654113, -81.2256814], [42.6653784, -81.2256674],
    [42.6653439, -81.2256682],
  ],
};

// Per Jason: Main St continues past Orchard St's south end (42.6643672,
// -81.2109075) down to the existing main-street-4 chain's north end
// (42.6630597,-81.2107865) — a real ~146m stretch with no OSM way at all
// (same known-gap pattern as The Prom / Breakwater / Sandcastle Key: OSM
// simply has nothing to pull there). Straight-line placeholder geometry
// between the two confirmed real endpoints, same as those other gaps would
// need if hand-digitized.
const mainStreetGapConnector = {
  id: 'main-street-orchard-gap-connector',
  name: 'Main Street',
  highway: 'residential',
  geometry: [[42.6643672, -81.2109075], [42.6630597, -81.2107865]],
};

// Streets confirmed real on Google Maps (session 6 audit) but with zero OSM
// coverage under any tag — hand-digitized from Google Maps satellite/road
// view since Overpass has nothing to pull. ~20-40m positional tolerance,
// fine for gameplay shape, not survey-grade. Unlike the two connectors
// above, these are standalone quiz entries in their own right, not merged
// into an existing chain.
const handDigitizedStreets = [
  // Mitchell Heights waterfront cluster, west end of town.
  {
    id: 'the-prom', name: 'The Prom', highway: 'residential',
    geometry: [[42.66630, -81.22511], [42.66682, -81.22643], [42.66787, -81.22522], [42.66765, -81.22466], [42.66727, -81.22496]],
  },
  {
    id: 'breakwater-blvd', name: 'Breakwater Blvd', highway: 'residential',
    geometry: [[42.66562, -81.22533], [42.66630, -81.22511], [42.66727, -81.22496]],
  },
  {
    id: 'regatta-way', name: 'Regatta Way', highway: 'residential',
    geometry: [[42.66630, -81.22511], [42.66603, -81.22309]],
  },
  {
    id: 'harbour-way', name: 'Harbour Way', highway: 'residential',
    geometry: [[42.66659, -81.22353], [42.66629, -81.22178]],
  },
  {
    id: 'sandcastle-key', name: 'Sandcastle Key', highway: 'residential',
    geometry: [[42.66727, -81.22496], [42.66659, -81.22353], [42.66524, -81.22289]],
  },
  {
    id: 'meek-street', name: 'Meek St', highway: 'residential',
    geometry: [[42.66470, -81.23329], [42.66390, -81.23360]],
  },
  {
    id: 'mckenzie-lane', name: 'McKenzie Lane', highway: 'residential',
    geometry: [[42.66484, -81.23524], [42.66434, -81.23524]],
  },
  // Downtown core / east side.
  {
    id: 'sailors-alley', name: "Sailor's Alley", highway: 'residential',
    geometry: [[42.66628, -81.21381], [42.66633, -81.21345], [42.66638, -81.21336]],
  },
  {
    id: 'briar-hill-street', name: 'Briar Hill Street', highway: 'residential',
    geometry: [[42.66611, -81.21680], [42.66627, -81.21622], [42.66629, -81.21610]],
  },
  {
    id: 'mcclary-ave', name: 'McClary Ave', highway: 'residential',
    geometry: [[42.66499, -81.19996], [42.66449, -81.19997]],
  },
  {
    id: 'spruce-street', name: 'Spruce St', highway: 'residential',
    geometry: [[42.66631, -81.19904], [42.66574, -81.19904]],
  },
];

const rawWithDupes = [
  ...JSON.parse(fs.readFileSync(path.join(__dirname, 'raw_main.json'))),
  ...JSON.parse(fs.readFileSync(path.join(__dirname, 'raw_residential.json'))),
  ...JSON.parse(fs.readFileSync(path.join(__dirname, 'raw_west.json'))),
  ...JSON.parse(fs.readFileSync(path.join(__dirname, 'raw_north.json'))),
  ...JSON.parse(fs.readFileSync(path.join(__dirname, 'raw_far_west.json'))),
  ...JSON.parse(fs.readFileSync(path.join(__dirname, 'raw_far_north.json'))),
]
  .filter(way => !excludeWayIds.has(way.id))
  .map(way => wayNameOverrides[way.id] ? { ...way, name: wayNameOverrides[way.id] } : way)
  .map(way => nameOverrides[way.name] ? { ...way, name: nameOverrides[way.name] } : way)
  .concat([georgeRoundaboutConnector, mainStreetGapConnector], handDigitizedStreets);

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

// Separate from the quiz list: every individual deduped raw way's geometry,
// unchained and untouched by the loop-dropping step above. That step drops
// tiny cul-de-sac turnaround loops as redundant *quiz* entries, but the
// pavement is still real — a road-outline layer drawn only from streets[]
// would show gaps at every dropped loop and every place chainSegments
// couldn't resolve a branch. This is for drawing the road network, not for
// gameplay, so raw individual segments (rather than merged per-name chains)
// are exactly what's needed.
const roadSegments = raw.map(way => way.geometry);
fs.writeFileSync(path.join(__dirname, 'road_segments.json'), JSON.stringify(roadSegments));
console.log(`Wrote ${roadSegments.length} road segments to road_segments.json`);
