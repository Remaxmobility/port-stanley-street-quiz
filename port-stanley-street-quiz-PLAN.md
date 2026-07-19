# Port Stanley Street Name Quiz — Architecture Plan

Status: **Planning only** — no build yet. This doc is the spec to build from next session.

---

## 1. Concept

A tap-the-map quiz game for Port Stanley, ON. The game shows a street name; the
player taps where they think it is on a real map; correct/close taps score points,
misses cost a strike. 3 strikes = game over, final score shown.

Obscure, low-traffic streets are worth more points than Main St / Bridge St /
Colborne St, which everyone knows.

---

## 2. Platform decision

**Choice: Mobile web app (PWA), built with Leaflet.js + OpenStreetMap tiles.**

| Option | Verdict |
|---|---|
| **Web app / PWA (Leaflet + JS)** | ✅ Chosen. Works instantly on any phone browser, installable via "Add to Home Screen" (iOS + Android), no app store review, easiest to iterate on as a Claude artifact, free map tiles via OSM. |
| Native app (React Native / Swift) | ❌ Overkill. Only wins if you need offline GPS tracking, background location, or app store discoverability — none apply here. Adds a build pipeline and store review for no gameplay benefit. |
| Google My Maps / pre-built quiz tool | ❌ Not enough control over hit-testing, scoring, or strike logic. |

Build target: single-file HTML/JS artifact first (fast iteration in Claude), then
export to a standalone PWA (`manifest.json` + service worker) for real home-screen
installs once the gameplay is locked in.

---

## 3. Data architecture

### 3.1 Source of truth: OpenStreetMap
Pull actual street geometry (not guessed points) via the **Overpass API**, bounding
box around Port Stanley (~42.655–42.670 N, ~81.20–81.225 W):

```
[out:json];
way["highway"]["name"]
  (42.655,-81.225,42.670,-81.200);
out geom;
```

This returns each street as a **polyline** (list of lat/lng points), which is what
hit-testing needs — a player's tap should be checked against the whole line, not
one pin.

> Dev note: this sandbox's network allowlist doesn't currently include
> `overpass-api.de`. Pull this data from a normal dev machine/browser, or request
> the domain be added, then drop the resulting JSON into the data file below.

### 3.2 Street record schema

```json
{
  "id": "colborne-st",
  "name": "Colborne Street",
  "geometry": [[42.6642, -81.2118], [42.6651, -81.2109], ...],
  "highwayClass": "tertiary",
  "lengthMeters": 340,
  "obscurityWeight": 1,
  "points": 10
}
```

- `highwayClass` — from OSM tag (`primary`/`secondary`/`tertiary`/`residential`/
  `service`/`unclassified`). Rough proxy for how "main" a road is.
- `obscurityWeight` — 1 (everyone knows it) to 5 (nobody knows it). Seeded by rule,
  then **hand-tuned by Jason**, since local knowledge beats any heuristic:
  - 1: Main St, Bridge St, Colborne St, William St
  - 2: George St, Joseph St, Carlow Rd, Sunset Dr
  - 3: Warren St, East Rd, Lakeview St, Maud St
  - 4–5: short residential dead-ends, service lanes, courts with < ~100m length
- `points` — derived: `basePoints * obscurityWeight` (e.g. base 10 → 10/20/30/40/50).

### 3.3 Obscurity scoring heuristic (starting formula, then manual override)

```
weight = clamp(1, 5,
  round(
    (highwayClassScore) +          // primary=0, secondary=1, tertiary=2, residential=3, service=4
    (lengthMeters < 150 ? 1 : 0) + // short streets are less traveled
    (isDeadEnd ? 1 : 0)
  )
)
```
Run this once to seed data, then manually review every row against local knowledge —
this is the part only Jason can do accurately.

---

## 4. Game engine

**State:**
```
score: number
strikes: number (0-3)
streetPool: Street[]         // shuffled, not yet asked
currentStreet: Street | null
roundStatus: "prompting" | "correct" | "miss" | "gameover"
history: { street, guessLatLng, hit, pointsAwarded }[]
```

**Round flow:**
1. Pop a random street from `streetPool`, show its name as the prompt.
2. Player taps map → get `latlng`.
3. Compute distance from tap to nearest point on `currentStreet.geometry`
   (Turf.js `pointToLineDistance`).
4. **Hit test:** tolerance in meters, tighter for obscure streets (they're usually
   shorter/narrower, so this naturally raises difficulty too):
   - weight 1: 45m tolerance
   - weight 2: 35m
   - weight 3: 28m
   - weight 4–5: 20m
5. Hit → award `points`, brief success flash, next street.
   Miss → strike++, show correct location, next street (or game over at 3).
6. Game over → show final score, streets gotten right/wrong, "play again."

**Why distance-to-line instead of distance-to-centroid:** streets are long and
curved; a centroid point can sit far from where a player reasonably taps along the
actual road. Line distance is fairer and matches how people actually read maps.

---

## 5. UI layer (Leaflet)

- Base map: OSM tiles, centered on Port Stanley, zoom locked to a range that keeps
  the whole town in frame (roughly z15–z17) so players can't infinite-zoom to cheat
  via satellite landmarks.
- Prompt banner (top): street name + point value for this round.
- Strike indicator (3 icons, e.g. hearts/X's) — top corner.
- Score counter — top corner, opposite side.
- Tap feedback: green pulse circle on hit at the actual nearest-point location;
  red marker + correct street highlighted (polyline flash) on miss.
- End screen: score, breakdown table (street / points / hit or miss), "Play Again."
- No street labels visible on the base map during play (use a label-free tile style
  or a custom style suppressing road name labels — otherwise it's not a quiz).

---

## 6. Scoring & difficulty extensions (future, not v1)

- Streak multiplier for consecutive hits.
- Timed mode (bonus for fast correct taps).
- Difficulty select: "Main streets only" vs "Full town" vs "Obscure only" (hard mode).
- Local leaderboard using artifact `window.storage` (shared=true) so friends/family
  can compare scores.
- Expand beyond Port Stanley to Union, Belmont, or St. Thomas using the same
  Overpass + weighting pipeline — this architecture isn't Port-Stanley-specific.

---

## 7. Build order for next session

1. Pull real OSM street geometry for Port Stanley (Overpass query above).
2. Build the street dataset JSON with seeded `obscurityWeight`, hand-review with Jason.
3. Build static Leaflet map artifact, no game logic — confirm bounds/zoom/label-free tiles look right.
4. Add tap capture + Turf.js distance-to-line hit test against one hardcoded street.
5. Wire up full game loop: prompt → tap → score/strike → next → game over.
6. Polish UI (strike icons, score, end screen).
7. Export as installable PWA (manifest + service worker) for home-screen use.
8. Optional: leaderboard, difficulty modes, other towns.

---

## 8. Open questions for Jason

- Base point value: is 10/20/30/40/50 (obscurity ×1–5) the right spread, or should
  it be steeper (e.g. 10/25/50/75/100) to really reward obscure-street knowledge?
- Should the whole town be in-bounds, or restricted to "core" Port Stanley
  (excluding newer subdivisions on the fringe)?
- Any streets that should be **excluded** entirely (private lanes, unnamed access
  roads)?
