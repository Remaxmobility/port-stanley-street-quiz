# Handoff — Port Stanley Street Quiz

## What we were doing
Building the v1 game per `port-stanley-street-quiz-PLAN.md` (steps 1-6 of the
plan's build order). Workflow used: local Ollama LLM drafted the game-logic
module, Claude QC'd/fixed/rewrote it, browser-tested the full loop end-to-end,
applied street-name corrections from local knowledge, then compared the full
street list against Google Maps (via Claude in Chrome) and expanded the OSM
pull to cover two neighborhoods the original bbox had cut off.

**Status: v1 playable and browser-verified, dataset expanded to 87 streets**
(was 57). Open `index.html` directly, no server needed. Steps 7 (PWA export)
and 8 (leaderboard/difficulty modes) not started — plan explicitly marks
those as later/future phases.

## Session 2 — Google Maps comparison and dataset expansion
Compared the 57-street list against Google Maps by driving Chrome across
every quadrant of town (Claude in Chrome). Findings:
- **Hillcrest Dr vs Franklin Drive conflict**: Google Maps still labels the
  road "Hillcrest Dr" — contradicts the local-knowledge correction from
  earlier in this session. Jason chose to keep `Franklin Drive` (trusting
  local/on-the-ground knowledge over Google/OSM lag). The override in
  `nameOverrides` (`build_streets.js`) is unchanged; flagged here in case it
  needs revisiting.
- **Original Overpass bbox was too small** — missed two populated
  neighborhoods entirely: west (Mitchell Heights: Valley St, Spring St,
  Lower Spring St, River Rd, Mitchell St, Charles St, Frederick St, Walnut
  St, Bartholemew St, Dover Pl, plus extensions of Front St/Tower Heights
  Dr/Edith Cavell Blvd/George St) and north (Stanley St, Selbourne Dr,
  Ensley Pl, Erie Heights Way, Old Field Lane, Lincoln's Cove, Compass
  Trail, Gentry Lane, Hill Street, High Street, plus extensions of Colborne
  St/Frances St/East Road). Re-pulled via `data/raw_west.json` and
  `data/raw_north.json`, added to `build_streets.js`'s raw-file list, rebuilt.
- **Known OSM coverage gaps, NOT added** (confirmed on Google Maps but absent
  from OSM under every highway tag tried — primary/secondary/tertiary/
  unclassified/residential/service/living_street/pedestrian/track/footway/
  path/cycleway): **The Prom, Breakwater Blvd, Regatta Way, Harbour Way,
  Meek St, Upper Spring St** (all in the west Mitchell Heights waterfront
  pocket), and **Spruce St** (short dead-end near Brayside St). These would
  need to be hand-digitized (manually added to a raw JSON file with
  estimated geometry) if Jason wants them in the quiz — OSM simply has no
  way for them yet.
- Map bounds/zoom in `index.html` (`BOUNDS`, `CENTER`, `minZoom`) widened to
  fit the larger extent (was minZoom 15 for a ~1.2x2.7km area; now minZoom
  14 for a larger area including both new neighborhoods).
- Re-verified hit-test correctness on the expanded dataset via a scripted
  precise tap (same Leaflet-projection technique as session 1) — exact
  score match, no regressions.

## Files changed / created
- `index.html` — full single-file game: Leaflet map (CartoDB dark, no labels),
  glass-panel HUD (score, strikes, prompt banner), tap-to-guess, hit/miss
  toast, end-screen breakdown, Play Again. Loads `game-engine.js` and
  `data/streets_inline.js`.
- `game-engine.js` — pure state-machine (init/submitGuess/nextRound), correct
  point-to-segment distance-to-line hit test. Claude-written after the local
  LLM's draft was rejected (see Key decisions).
- `data/build_streets.js` — merges raw OSM ways into `streets.json`: chains
  segments sharing endpoints into one polyline per street name, computes
  length, seeds `obscurityWeight` via plan §3.3 formula, applies
  `manualWeight` and `nameOverrides` maps (both hand-maintained, see below).
- `data/raw_main.json`, `data/raw_residential.json` — raw Overpass API pulls
  (primary/secondary/tertiary/unclassified, and residential, respectively)
  for the original Port Stanley bbox. Source of truth; never hand-edited.
- `data/raw_west.json`, `data/raw_north.json` — session-2 pulls covering the
  two neighborhoods the original bbox missed (Mitchell Heights and the
  north end). Same rules: source of truth, never hand-edited.
- `data/streets.json` — build output, 87 street records (71 unique names).
- `data/streets_inline.js` — `streets.json` wrapped as `const STREET_DATA = [...]`
  for direct `<script>` embedding (avoids `fetch()`/CORS issues on `file://`).
  **Must be regenerated any time `streets.json` changes** — see Next steps.
- `data/test_engine.js` — 21 node-run unit tests for `game-engine.js`
  (distance math, tolerance table, purity, strike/gameover transitions).

## Key decisions
- **Overpass API is reachable via `WebFetch` but not via `Bash`/`curl`** in
  this sandbox (curl gets a fake 406 page; WebFetch succeeds). Large bbox
  queries also hit WebFetch's 32k-token output cap and Overpass's own 504s
  under load — worked around by querying per highway-class subset
  (primary/secondary/tertiary/unclassified, then residential, then
  service/living_street/pedestrian) and asking WebFetch to emit compact
  minified JSON only.
- **Local LLM (deepseek-coder:6.7b) draft was unusable**: garbled terminal
  artifacts in output, and the core `distanceToLineMeters` function ignored
  the actual guess point entirely (wrong algorithm), plus direct state
  mutation despite the pure-function spec. Claude rewrote the engine from
  scratch rather than patching it. Confirms the existing CLAUDE.md guidance
  to avoid local models for code generation.
- **Street-name corrections use a `nameOverrides` map in `build_streets.js`**,
  applied to raw OSM data before grouping — not hand-edited into
  `streets.json` — so a future Overpass re-pull won't silently revert them.
  Current overrides: `Hillcrest Drive -> Franklin Drive`,
  `Fairview Street -> Brayside Street`, `Fernie Street -> Brayside Street`
  (the latter two both fold into one continuous 357m Brayside Street — OSM
  had split one real road into three named segments; Fernie Street was the
  geometric connector between the other two).
- **A real bug was found via browser QC, not code review**: `render()` was
  unlocking tap input immediately after a guess, before the 700-1400ms
  result-transition delay finished. A second tap in that window scored
  again against the street that was about to be replaced. Fixed by
  splitting `render()` (full: HUD + new prompt + unlock) from a
  `renderHud()` (score/strikes only, called mid-transition, does not
  unlock). Verified via scripted precise taps computed from Leaflet's own
  `latLngToContainerPoint`, since screenshot pixel space (1568x704) and the
  actual CSS viewport (1920x863) differ in this sandbox's browser tool.
  **Refinement from session 2**: the viewport's reported height fluctuated
  between calls (863 vs 919) within the same tab, which produced one stale
  click-coordinate read and a missed test click. Always re-read
  `window.innerWidth`/`innerHeight` and recompute `latLngToContainerPoint`
  immediately before the click that uses them — don't reuse a value read
  even a call or two earlier.
- **Google Maps comparison workflow**: driving Chrome to Google Maps and
  reading street labels off screenshots (zoomed with the `zoom` action for
  small text) is a workable way to spot-check an OSM-derived dataset for
  gaps/renames — but Google Maps and OSM are independent datasets that can
  each be right where the other is wrong or stale (see the Hillcrest/
  Franklin conflict above). Treat disagreements as "flag for the human,"
  not "OSM/Google is authoritative."

## Session 3 — duplicate-way bug from overlapping Overpass queries
Jason reported East Road meets Joseph St/Prospect St/Currie Blvd at a
junction south of where it appeared to end. Checking `streets.json` showed
East Road as a self-looping 940m chain (start == end) instead of a normal
open path — the junction point itself was correct (Joseph/Prospect/Currie
all already shared that exact node), but East Road's own geometry was
corrupted.

**Root cause**: OSM way id 126454100 (East Road's southern segment) was
returned by *both* the original bbox query and the session-2 north bbox
query, because the way physically crosses both boxes. It ended up in both
`raw_main.json` and `raw_north.json`, so `build_streets.js` fed the same
segment into the chain-merge twice, which chained it into a loop back onto
itself. Auditing all four raw files found this had happened **5 times
total**: East Road, Front Street, Edith Cavell Boulevard, Little Creek
Place, Frances Street.

**Fix**: `build_streets.js` now dedupes the combined raw way list by OSM
`id` (first occurrence wins) before grouping/chaining — see the
`seenIds`/`rawWithDupes` block near the top of the file. This is a
permanent fix: any future overlapping-bbox re-pull will hit the same dedupe
step automatically. Street count went 87 -> 84 records (71 unique names,
unchanged) after the fix; East Road is now one clean 1330m chain from the
Joseph/Prospect/Currie junction north to the Sparta-direction end.

Asked to audit the rest of the dataset for similar issues and found one
more, more minor: **4 streets had a cul-de-sac turnaround loop stranded as
its own tiny separate quiz entry** instead of merging with the real street
(Ensley Place, George Street, Little Creek Place, Main Street). Cause: the
loop way's connecting road attaches at an *interior* node of the circular
way, not at the way's own start/end point — `chainSegments` only matches on
endpoints, so it can't see that connection and leaves the loop as its own
68-75m closed chain. Not wrong data (both pieces are real, correctly
located), just redundant — each affected name already had a substantial
sibling chain covering the actual street. Fixed by dropping closed-loop
chains under 100m whenever a non-loop sibling chain exists for the same
name (`isClosedLoop` check in `build_streets.js`, right before the
per-chain `streets.push` loop). Verified street-by-street that no coverage
was lost. Count went 84 -> 80 records (71 unique names, still unchanged).

Full re-scan after both fixes confirmed clean: zero remaining self-loops,
zero duplicate ids, zero `points !== 10*obscurityWeight` mismatches, zero
degenerate (<2-point) geometries, lengths all in a plausible 10m-1372m
range.

## Session 3 continued — Victoria Street -> Harrison Place
Jason: "Victoria is actually Harrison Place, Harrison starts where Vimy and
Currie blvd meet." Checked coordinates: Victoria Street's west end
(`[42.6657859,-81.203249]`) is the exact node where the existing Harrison
Place chain already stopped, and Victoria's east end
(`[42.6658517,-81.206727]`) is exactly where Currie Boulevard starts and
Maple Street (the short connector to Vimy Ridge) ends — i.e. the
Vimy/Currie junction Jason described. Same pattern as the earlier
Fairview/Fernie -> Brayside fix: one real street, OSM had it in two
differently-named pieces. Added `'Victoria Street': 'Harrison Place'` to
`nameOverrides`; merged cleanly into one continuous 572m Harrison Place
chain. Rebuilt, regenerated inline data, engine tests pass. Count: 79
records (70 unique names).

## Session 3 continued — Colborne Street didn't reach Joseph Street
Jason: "Check Colborne st as well, it meets Bridge and Joseph." Colborne
already met Bridge Street correctly (exact shared node). It did NOT reach
Joseph Street — stopped ~15-20m short at `[42.6659136,-81.212024]` instead
of continuing to Joseph's start `[42.6660264,-81.211793]`.

Root cause, different from the earlier two fixes: OSM has **10 raw ways**
named Colborne Street, 8 tagged "secondary" (the real through-route) and 2
tagged "residential" (`126454147`, `126454230`) that closely parallel a
short stretch of the secondary route between the same two junction nodes —
a duplicate/redundant OSM tracing, not a real second road. This created a
branching triangle (3 nodes, both a direct secondary edge and two
residential edges between them) that endpoint-only chaining can't resolve
into one path — it greedily picked a path that happened to stop at the
wrong vertex of the triangle. Fixed with a new `excludeWayIds` set in
`build_streets.js` (distinct from `nameOverrides`/`manualWeight` — this one
drops specific duplicate way ids, each with a coordinate-checked comment
explaining what it duplicates), which lets the secondary through-route
chain cleanly to Joseph Street's exact start node. Verified the merged
chain still passes through the Bridge Street junction as an interior
point. Count unchanged: 79 records, 70 unique names (the fix changed
`colborne-street-1`'s endpoint, not its record count).

This is a new bug class worth watching for on any future street: **when a
named street has unexpectedly many raw ways for its visible length,
suspect a duplicate/parallel OSM tracing**, not just missing connections.

## Session 3 continued — Selbourne Drive, plus a proactive full-dataset sweep
Jason: "Selbourne drive has an issue" (no detail given). Same duplicate-way
bug class as Colborne, but a worse manifestation: `126454134` (2-pt
straight) and `126454226` (13-pt curve) both connected the exact same two
junction nodes. The chainer merged *both* sequentially instead of picking
one, producing a polyline that went out to the far node and doubled back
through the same stretch before continuing on — a real out-and-back visual
glitch, not just a truncation. Also stranded the far segment (toward
Frances St's other end) as a disconnected second chain. Excluded
`126454134` (kept the more detailed way); Selbourne Drive is now one clean
421m chain, `[42.6713788,-81.2129693]` to `[42.6731314,-81.2142146]`.

Given this was now three separate reports of the same underlying bug class
(Colborne, Selbourne, and this pattern likely elsewhere unreported), ran a
**proactive full-dataset sweep** rather than waiting for more reports:
1. Pairwise scan for any two ways under the same street name sharing an
   identical start/end node pair — found one more: **Frances Street**
   (`126454107`, a direct 15m connector, vs `126454266`, a 95m detour
   between the *same* two points only 15m apart in a straight line).
   Verified the direct way already bridged that gap cleanly in the main
   769m chain, so the 95m detour was purely a redundant, spurious second
   "Frances Street" quiz entry with no connectivity value — excluded it.
2. Full graph-cycle check (union-find per street name, flagging any name
   whose way-graph has more edges than a tree needs) across the *entire*
   dataset, not just names Jason flagged — came back **empty** after the 4
   exclusions (Colborne x2, Selbourne x1, Frances x1). No further
   duplicate/branching issues remain anywhere in the dataset.
3. Re-ran the >150m single-segment-jump scan — same 11 results as before
   (already verified as natural OSM sparse-node sampling within single
   original ways, e.g. Bessie St's whole 306m length is just 2 nodes). No
   new jumps introduced by the fixes.

`excludeWayIds` in `build_streets.js` now has 4 entries, each with a
coordinate-checked comment. Count: 77 records, 70 unique names (unchanged
from before this round — none of these fixes removed real street coverage,
only redundant duplicate entries).

## Session 3 continued — Oak St/Bridge St: real extent, not a data bug
Jason flagged Oak Street and Bridge Street as having "the issue" too.
Investigated both thoroughly (topology, cross-checked against a fresh
Overpass query with no highway-tag restriction, checked Google Maps
directly) and found **no bug** in either — Oak Street's chain is clean and
matches OSM/Google exactly, and Bridge Street's two-piece split around the
King George VI Lift Bridge is real. Asked Jason directly what was wrong
rather than guessing further; both turned out to be real-world
extent/connectivity facts, not chaining bugs:

- **Oak Street**: no fix applied yet — still waiting on the specific detail
  (asked what the correct extent/connection is, not yet answered as of
  this write-up).
- **Bridge Street**: "Bridge street is between Carlow Rd and Colborne."
  Checked the raw way list — Bridge Street's westernmost way
  (`126454105`, `[42.6641853,-81.2156913]` to `[42.6646400,-81.2147455]`)
  sits entirely *west* of the Carlow Rd junction, and its far west end is
  the exact node where George Street (`126454194`) ends. So that stretch
  was mistagged "Bridge Street" in OSM when it's really a continuation of
  George Street. Fixed with a new **`wayNameOverrides`** map in
  `build_streets.js` (keyed by specific OSM way id, not by name like
  `nameOverrides` — needed here because only part of Bridge Street's OSM
  extent was wrong, renaming the whole name would have been wrong).
  Bridge Street is now two clean pieces spanning exactly
  Carlow Rd -> (lift bridge) -> Colborne St; George Street absorbed the
  stub and still passes through its original terminus as an interior
  point. Verified with the same self-loop/duplicate-id re-scan as before —
  clean. Count unchanged: 77 records, 70 unique names.

## Pending issues
- **Oak Street extent/connectivity** — Jason confirmed something's wrong
  but the specific correct extent hasn't been provided yet. Ask him for
  the same kind of fact as the Bridge St fix (e.g. "Oak St runs between X
  and Y") next session.
- Otherwise none known-broken. 77 streets (70 unique names) is the full
  set, re-scanned clean (self-loops, duplicate ids, graph cycles) as of
  the last full sweep.
- Six streets confirmed real (visible on Google Maps) but absent from OSM
  entirely — see "Known OSM coverage gaps" above. Not in the quiz yet.
- Unresolved: Hillcrest Dr vs Franklin Drive naming (kept as Franklin Drive
  per Jason's call this session, but Google Maps still disagrees — worth a
  sign-check next time he's in the area).

## Next steps
1. **If any `data/raw_*.json` file is ever re-pulled from Overpass, or
   `build_streets.js` is edited**: re-run `node data/build_streets.js`, then
   regenerate the inline file:
   ```
   node -e "const fs=require('fs');const s=JSON.parse(fs.readFileSync('data/streets.json'));fs.writeFileSync('data/streets_inline.js','const STREET_DATA = ' + JSON.stringify(s) + ';');"
   ```
   then `node data/test_engine.js` to confirm the engine still passes.
2. Jason to review the full 71-name street list for any further corrections
   (found and fixed so far: Hillcrest->Franklin, Fairview/Fernie folded into
   Brayside). Add any more to `nameOverrides` in `build_streets.js`.
3. Decide whether to hand-digitize the six OSM-absent streets (The Prom,
   Breakwater Blvd, Regatta Way, Harbour Way, Meek St, Upper Spring St,
   Spruce St — estimate geometry from Google Maps satellite/road view,
   add as a manually-authored raw JSON file since Overpass has nothing to
   pull).
4. Open questions from the plan (§8), still unanswered:
   - Point spread: keep 10/20/30/40 (obscurity x1-4) or go steeper?
   - Whole town in-bounds, or core-only? This got more pointed this
     session — the north cluster (Hill St, High St, Gentry Lane, Compass
     Trail, Old Field Lane, Lincoln's Cove) reads as a distinct
     newer/fringe subdivision, exactly the case the plan flagged. Jason
     approved including it, but worth confirming it still feels like
     "Port Stanley" gameplay-wise once he's played it.
   - Any streets to exclude entirely (private lanes, unnamed access roads)?
5. Once gameplay/data are locked in: step 7 (manifest.json + service worker
   for installable PWA) and step 8 (leaderboard, difficulty select, other
   towns) per plan — both explicitly deferred, not started.
