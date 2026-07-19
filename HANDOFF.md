# Handoff — Port Stanley Street Quiz

## What we were doing
Building the v1 game per `port-stanley-street-quiz-PLAN.md` (steps 1-6 of the
plan's build order). Workflow used: local Ollama LLM drafted the game-logic
module, Claude QC'd/fixed/rewrote it, browser-tested the full loop end-to-end,
applied street-name corrections from local knowledge, then compared the full
street list against Google Maps (via Claude in Chrome) and expanded the OSM
pull to cover two neighborhoods the original bbox had cut off.

**Status: v1 playable and deployed. Dataset now 76 records / 71 unique
names** (session 5 merged several mistagged/split streets down from the
82/75 count — see below; this is name-correction consolidation, not lost
coverage). Live on GitHub (`github.com/Remaxmobility/port-stanley-street-quiz`,
public) with Vercel connected for auto-deploy on push. Steps 7 (PWA export)
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
(Counts below are as of session 5; superseded by "Status" at the top of
this doc if that's been updated more recently.)
- `index.html` — full single-file game: Leaflet map (CartoDB **light**, no
  labels — switched from dark in session 4 for outdoor daylight
  readability), a hand-drawn grey/dark-cased road-outline overlay (see
  session 4), glass-panel HUD (score, strikes, prompt banner), dismissible
  pinch/tap onboarding hint, tap-to-guess, hit/miss toast, end-screen
  breakdown, Play Again, and (session 5) a "Label streets" debug/learn
  toggle plus a `window.__psTest` hook for scripted backtesting. Loads
  `game-engine.js`, `data/streets_inline.js`, and `data/roads_inline.js`.
- `game-engine.js` — pure state-machine (init/submitGuess/nextRound), correct
  point-to-segment distance-to-line hit test. Claude-written after the local
  LLM's draft was rejected (see Key decisions).
- `data/build_streets.js` — merges raw OSM ways into `streets.json` (the
  quiz dataset) AND `road_segments.json` (every individual deduped raw way,
  for visual display only — see session 4): chains segments sharing
  endpoints into one polyline per street name, computes length, seeds
  `obscurityWeight` via plan §3.3 formula, applies `manualWeight`,
  `nameOverrides`, `wayNameOverrides`, and `excludeWayIds` maps (all
  hand-maintained, see Key decisions below).
- `data/raw_main.json`, `data/raw_residential.json` — raw Overpass API pulls
  (primary/secondary/tertiary/unclassified, and residential, respectively)
  for the original Port Stanley bbox. Source of truth; never hand-edited.
- `data/raw_west.json`, `data/raw_north.json` — session-2 pulls covering the
  two neighborhoods the original bbox missed (Mitchell Heights and the
  north end).
- `data/raw_far_west.json`, `data/raw_far_north.json` — session-4 pulls:
  George Street's real western extent (+ Walter St, Edith St), and a
  subdivision north of the original data (Larry St, Emery St, Beamish St).
  All raw files: source of truth, never hand-edited.
- `data/streets.json` — build output, the curated **quiz** dataset (76
  street records, 71 unique names as of session 5).
- `data/road_segments.json` — build output, **every** individual deduped
  raw way's geometry (unnamed array of coordinate arrays) — for the visual
  road-outline layer, not gameplay. Session 4 addition.
- `data/streets_inline.js` / `data/roads_inline.js` — `streets.json` /
  `road_segments.json` wrapped as `const STREET_DATA = [...]` /
  `const ROAD_SEGMENTS = [...]` for direct `<script>` embedding (avoids
  `fetch()`/CORS issues on `file://`). **Both must be regenerated any time
  `streets.json`/`road_segments.json` change** — see Next steps.
- `data/test_engine.js` — 21 node-run unit tests for `game-engine.js`
  (distance math, tolerance table, purity, strike/gameover transitions).
- `data/test_fuzz.js` — session-5 addition, ~1850-check backtest suite
  against the live dataset (every vertex/segment midpoint, tolerance
  boundaries, shared junctions, malformed input, full-deck playthrough,
  double-submit purity). Re-run any time `streets.json` changes.
- `.gitignore` — excludes `.claude/` (session 4, before first git push).

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

## Session 4 — deployed to GitHub/Vercel, UI contrast fix, more street gaps
Jason asked to put the project on his GitHub and deploy via Vercel.
- Pushed to `github.com/Remaxmobility/port-stanley-street-quiz` (public repo,
  under the Remaxmobility gh account — matches his configured git identity,
  `gho auth switch` was needed since `luxuryfurnishedrentals` was gh's
  active account). `.gitignore` excludes `.claude/`.
- Vercel CLI wasn't installed and `vercel login` needs an interactive
  browser flow this sandbox can't complete — Jason imported the repo via
  the Vercel dashboard instead (vercel.com/new -> Import -> Deploy, auto-
  detected as a static site, no build config needed). Auto-deploys on
  every push to `master` from here on.

**Contrast complaint** ("too dark on my phone"): the whole game was on a
dark theme (dark tiles + dark UI), which reads badly outdoors in daylight —
which is when this game actually gets played. Switched the base map tiles
from CartoDB `dark_nolabels` to `light_nolabels`; kept the dark glass HUD
panels, which now have strong contrast against the lighter map instead of
blending into a dark one. Also added a dismissible "Pinch to zoom · Tap to
select" onboarding hint (found and fixed a bug where it was dismissing
itself instantly — Leaflet fires its own zoom/pan events during startup
bounds-snapping, which was triggering the same listener meant for the
player's first real tap).

**Road visibility complaint** ("road borders could be darker, make roads
grey"): the base tiles' own road rendering is too pale to fix with CSS
filters — tried several combinations (`contrast`, `brightness`,
`grayscale`), all either did nothing or blew the pale roads out to solid
white, because the source pixels don't have enough tonal separation for a
filter to manufacture real contrast from (filters can only stretch
*existing* contrast). Switched approach entirely: draw the road network
ourselves as Leaflet polylines (dark slate casing line under a grey fill
line, same technique real map renderers use), with `interactive: false` so
taps still pass through to the map's own tap-to-guess handler.

Drawing that overlay surfaced a real bug: it was built from `STREET_DATA`
(the curated 77-street quiz list), which deliberately excludes things like
the small cul-de-sac turnaround loops dropped earlier as redundant *quiz*
entries — the pavement is still real, just not a separate quiz record
anymore, so those loops rendered as gaps in an otherwise-grey network.
Fixed by adding a second, separate output from `build_streets.js`:
`road_segments.json` / `data/roads_inline.js` (`ROAD_SEGMENTS`), which is
every individual deduped raw way's geometry, unchained and un-filtered by
the loop-dropping logic — built for drawing the road network, not for
gameplay. `index.html` now loads both `STREET_DATA` (for `GameEngine`) and
`ROAD_SEGMENTS` (for the visual overlay) as separate scripts.

**More real gaps found while checking that fix**, confirmed via Overpass
and added:
- **George Street's real extent is much longer than we had** — it
  continues west along the shoreline past Mitchell Heights all the way to
  `[42.6647932,-81.2439557]` (confirmed as the true OSM terminus by
  re-querying an even wider bbox and getting the same single way back).
  Picked up two real cross streets along the way: **Walter Street** and
  **Edith Street** (`data/raw_far_west.json`).
- **Larry Street, Emery Street, Beamish Street** — a whole subdivision
  north of the existing data, off Hill Street/Sunset Road near the Port
  Stanley Water Tower. Found by retrying a Google Maps search for "Emery"
  that had originally appeared to return nothing (it just resolved slower
  than expected — worth waiting longer or re-checking a tab instead of
  concluding "not found" too quickly). All three connect cleanly: Beamish
  St's start node is an exact match for Hill Street's existing endpoint
  (`data/raw_far_north.json`).
- Deliberately **left out** two things found in the same Overpass pull to
  avoid scope creep beyond what was asked: a further extension of East
  Road and new segments of Sunset Road/Dexter Line that run well out into
  rural territory (Dexter Line reaches over 3km east, clearly a county
  road, not a Port Stanley street). Can revisit if Jason wants the game's
  area pushed that far out — see plan §8's "whole town vs core" question.
- **Sandcastle Key** confirmed absent from OSM entirely (same as the
  earlier Prom/Breakwater/Regatta/Harbour/Meek/Upper Spring cluster) —
  added to the known-gap list below, not fabricated.
- Map `BOUNDS`/`CENTER` in `index.html` widened again to fit the larger
  extent (lat now up to ~42.680, lon down to ~-81.244).

Full data-quality re-scan (self-loops, duplicate ids, graph-cycle check
across every street name) run again after all of this — clean. Engine
tests still pass. Count: 82 records, 75 unique names.

## Session 5 — debug/learn label toggle, backtest suite, more street-name corrections
Jason asked for: a test toggle labelling every street (troubleshoot + learn
street names), a Merville->Brayside correction, and a local-LLM +
multi-agent backtest of the tap/hit-test logic. Then, while playing,
reported three more real-world street-name corrections in follow-up
messages.

**Debug/learn label toggle**: `index.html` now has a "Label streets" button
(bottom-right pill) that toggles a `L.layerGroup` of `interactive: false`
markers, one per `STREET_DATA` entry, showing the street name at its
geometry midpoint (`.street-label` CSS class — dark text, white halo via
`text-shadow`, readable over both the light basemap and the drawn road
overlay). Also added `window.__psTest` (exposes `map`, `getState()`, and
`tapLatLng(lat, lon)`) — harmless in normal play, but lets automated tooling
drive real taps through the actual `handleTap` code path instead of
computing screen-pixel coordinates (which had caused viewport-mismatch
flakiness in earlier sessions' manual QC).

**Backtest**: two layers, since neither alone covers what "click different
places and see if it errors" needs.
1. `data/test_fuzz.js` (new, node-run, 1854-1869 checks depending on
   dataset size at the time) — exercises `GameEngine` directly across every
   street: every vertex, every segment midpoint, tolerance-boundary taps
   (using a proper meter-space equirectangular projection anchored per
   street, not a naive lat/lon perpendicular — the first draft of this test
   had ~60 false-positive failures from exactly that bug, see comments in
   the file), every shared-junction node, malformed/extreme inputs
   (NaN/Infinity/out-of-range), a full 81-round deck playthrough, and a
   double-submit purity check. All checks pass.
2. Two parallel `general-purpose` agents drove the *real* browser
   (`claude-in-chrome`, via `window.__psTest.tapLatLng`) — one hammering
   hit/miss/gameover/double-tap-timing/out-of-bounds/toggle edge cases, one
   playing through all 81 streets for coverage (short 2-3pt geometries,
   geographic extremes, shared junctions). Zero console errors from either.
   `file://` URLs aren't accepted by claude-in-chrome — one agent worked
   around it with `python -m http.server`. One tooling-only anomaly noted:
   a *stale reused* browser tab from an earlier session showed the score
   climbing with no active driver — traced to a leftover concurrent process
   still tapping that old tab, not anything in the app's own code (no
   timer/autoplay exists in `game-engine.js`/`index.html`) — avoid reusing
   long-lived tabs across sessions for this kind of scripted test.
3. Local LLM (`qwen2.5:14b` via Ollama) was used to brainstorm the edge-case
   *categories* worth testing (sharp turns at max tolerance, vertex
   junctions, map-boundary taps, etc.) before writing the fuzz script — a
   brainstorming/ideation role, not code generation, consistent with
   [[feedback_local_llm_code_gen]] (still don't trust local models to write
   the actual test code).

**Street-name corrections found this session** (each verified by exact or
near-exact shared-endpoint-coordinate match before applying, same method as
prior sessions):
- **Merville Street -> Brayside Street**: end node exact match with
  Brayside's start node.
- **George Street roundabout fix** (a real *topology* bug, not a naming
  one, found via data audit rather than a Jason report): OSM way
  `997749168` is George St's roundabout, pulled as a single 19-point
  *closed loop* (start==end). Its junctions with George St's two existing
  chains are at *interior* points of the loop (idx5, idx14), not the loop's
  own start/end — `chainSegments` only matches on a way's own endpoints, so
  it couldn't route through, leaving George St split into two disconnected
  pieces (933m + 1502m). Fixed by excluding the closed-loop way and adding
  `georgeRoundaboutConnector`, a hand-extracted open arc between the two
  real junction points (the shorter of the loop's two arcs, ~36m). George
  St is now one continuous 2474m chain. **This pattern (a roundabout pulled
  as a single closed way, breaking chaining at its non-endpoint junctions)
  is worth checking for at any other roundabout in the data — only this one
  has been checked so far.**
- **Jamieson Street + Orchard Street -> Main Street**: Jason gave the real
  extent as `(42.665539,-81.211904)` to `(42.663106,-81.210733)`. Traced
  it: that start point is the exact junction where Main St/Colborne
  St/Jamieson St meet; Jamieson's other end is Orchard St's exact start;
  Orchard's south end (`42.6643672,-81.2109075`) has **no OSM way at all**
  for the next ~146m, then Jason's given end point matches the existing
  `main-street-4` chain's start exactly. Renamed Jamieson+Orchard into Main
  St (their shared nodes with `main-street-1` let them auto-chain) and
  added `mainStreetGapConnector`, a straight-line placeholder for the real
  but OSM-absent ~146m stretch — same "known gap, hand-digitize" pattern as
  The Prom/Breakwater/Sandcastle Key (still not added themselves, see
  below), just applied here because Jason gave exact usable endpoints.
  Main St's core chain grew from 289m to 732m.
- **Maple Street -> Vimy Ridge**: start node exact match with Vimy Ridge's
  end node. Now one 95m chain.
- **Colborne Street checked, found already correct**: Jason gave
  `(42.675268,-81.216623)` to `(42.665925,-81.211992)` as one road. The
  existing `colborne-street-1` chain already spans within 15-20m of both
  points (consistent with hand-eyeballed GPS precision seen in his other
  corrections) — no change made. (A separate, unrelated 10m
  `colborne-street-2` stub sits ~50m away near the Main St/Jamieson
  junction — not part of what Jason described.)

Every fix rebuilt `streets.json`/`road_segments.json`, regenerated both
inline files, and re-ran both `test_engine.js` and `test_fuzz.js` before
being committed — all green throughout. Two commits pushed this session
(`0e906bb` roundabout+Merville+toggle+fuzz suite, `446ad5d`
Main St+Vimy Ridge). Count went 82/75 -> 76/71 (all consolidation of
mistagged splits, not lost real streets).

## Pending issues
- **Oak Street extent/connectivity** — Jason confirmed something's wrong
  but the specific correct extent hasn't been provided yet. Ask him for
  the same kind of fact as the Bridge St fix (e.g. "Oak St runs between X
  and Y") next session.
- Otherwise none known-broken. 76 streets (71 unique names) is the full
  set as of session 5's fixes; re-scanned clean (self-loops, duplicate ids,
  graph cycles) as of the session-3/4 full sweep — **that graph-cycle sweep
  has not been re-run since session 5's changes**, worth doing once more
  corrections land rather than after every single one.
- Seven streets confirmed real (visible on Google Maps) but absent from
  OSM entirely — The Prom, Breakwater Blvd, Regatta Way, Harbour Way,
  Meek St, Upper Spring St, Spruce St, **plus Sandcastle Key** (session 4).
  Not in the quiz yet — would need hand-digitized geometry (same technique
  now proven once, at small scale, by session 5's `mainStreetGapConnector`).
- Unresolved: Hillcrest Dr vs Franklin Drive naming (kept as Franklin Drive
  per Jason's call, but Google Maps still disagrees — worth a sign-check
  next time he's in the area).
- East Road/Sunset Road/Dexter Line's further rural extensions were found
  but deliberately not added (see session 4) — revisit if the game's
  intended area should reach that far out.
- Worth a proactive check (per [[feedback_full_sweep_after_pattern_repeats]] —
  this is now 5+ instances of the same "OSM split one real street into
  multiple names" bug class across sessions 3-5): scan the full dataset for
  any other street whose name has unusually few/short chains for its
  apparent length, the same smell that led to the Colborne/Selbourne/
  Frances/Merville/Main St/Vimy Ridge fixes.

## Next steps
1. **If any `data/raw_*.json` file is ever re-pulled from Overpass, or
   `build_streets.js` is edited**: re-run `node data/build_streets.js` (now
   writes both `streets.json` AND `road_segments.json`), then regenerate
   BOTH inline files:
   ```
   node -e "const fs=require('fs');const s=JSON.parse(fs.readFileSync('data/streets.json'));fs.writeFileSync('data/streets_inline.js','const STREET_DATA = ' + JSON.stringify(s) + ';');const r=JSON.parse(fs.readFileSync('data/road_segments.json'));fs.writeFileSync('data/roads_inline.js','const ROAD_SEGMENTS = ' + JSON.stringify(r) + ';');"
   ```
   then `node data/test_engine.js` to confirm the engine still passes. If
   the new data changes the lat/lon extent, also check/update `BOUNDS` and
   `CENTER` in `index.html` — this has been missed and caught late twice
   now (session 3 and 4 both needed a bounds fix after a data expansion).
2. Get the Oak Street correction from Jason (see Pending issues).
3. Jason to review the full 71-name street list for any further
   corrections (found and fixed so far: Hillcrest->Franklin,
   Fairview/Fernie->Brayside, Victoria->Harrison Place, Bridge St's west
   stub->George Street, Merville->Brayside, George St roundabout topology,
   Jamieson/Orchard->Main St + gap, Maple->Vimy Ridge). Add any more to
   `nameOverrides`/`wayNameOverrides` in `build_streets.js`. The "Label
   streets" toggle in-app (session 5) is built for exactly this review.
4. Decide whether to hand-digitize the seven OSM-absent streets (The Prom,
   Breakwater Blvd, Regatta Way, Harbour Way, Meek St, Upper Spring St,
   Spruce St, Sandcastle Key — estimate geometry from Google Maps
   satellite/road view, add as a manually-authored raw JSON file since
   Overpass has nothing to pull).
5. Open questions from the plan (§8), still unanswered:
   - Point spread: keep 10/20/30/40 (obscurity x1-4) or go steeper?
   - Whole town in-bounds, or core-only? This got more pointed this
     session — the north cluster (Hill St, High St, Gentry Lane, Compass
     Trail, Old Field Lane, Lincoln's Cove) reads as a distinct
     newer/fringe subdivision, exactly the case the plan flagged. Jason
     approved including it, but worth confirming it still feels like
     "Port Stanley" gameplay-wise once he's played it.
   - Any streets to exclude entirely (private lanes, unnamed access roads)?
6. Once gameplay/data are locked in: step 7 (manifest.json + service worker
   for installable PWA) and step 8 (leaderboard, difficulty select, other
   towns) per plan — both explicitly deferred, not started.
