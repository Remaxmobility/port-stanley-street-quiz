# Handoff — Port Stanley Street Quiz

## What we were doing
Building the v1 game per `port-stanley-street-quiz-PLAN.md` (steps 1-6 of the
plan's build order). Workflow used: local Ollama LLM drafted the game-logic
module, Claude QC'd/fixed/rewrote it, browser-tested the full loop end-to-end,
applied street-name corrections from local knowledge, then compared the full
street list against Google Maps (via Claude in Chrome) and expanded the OSM
pull to cover two neighborhoods the original bbox had cut off.

**Status: v1 playable and deployed, plus a server-backed top-10 leaderboard
(session 7). Dataset now 82 records / 82 unique names — every street name
maps to exactly one continuous chain, no fragments left.** Live on GitHub
(`github.com/Remaxmobility/port-stanley-street-quiz`, public) with Vercel
connected for auto-deploy on push. Step 7 (PWA export) not started. Step 8
(leaderboard) is now DONE for the core version (see session 7); difficulty
modes/other towns still not started.

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
(Counts below are as of session 6; superseded by "Status" at the top of
this doc if that's been updated more recently.)
- `index.html` — full single-file game: Leaflet map (CartoDB **light**, no
  labels — switched from dark in session 4 for outdoor daylight
  readability), a hand-drawn grey/dark-cased road-outline overlay (see
  session 4), glass-panel HUD (score, strikes, prompt banner), dismissible
  pinch/tap onboarding hint, tap-to-guess, hit/miss toast, end-screen
  breakdown, Play Again, a "Label streets" debug/learn toggle plus a
  `window.__psTest` hook for scripted backtesting (session 5), and
  (session 5) a miss-reveal that flies to the correct street and holds
  until a real user gesture (drag/wheel/pinch/double-click — not a fixed
  timer) instead of the old auto-advance. Loads `game-engine.js`,
  `data/streets_inline.js`, and `data/roads_inline.js`.
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
- `data/streets.json` — build output, the curated **quiz** dataset (87
  street records, 82 unique names as of session 6).
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
- `api/leaderboard.js` — session 7 addition. Vercel serverless function
  (CommonJS, zero npm dependencies), GET/POST backing the top-10
  leaderboard via a Vercel KV (Upstash Redis) sorted set. See session 7 in
  the log below for the full story, including why it's plain CommonJS with
  no `package.json` in the repo (adding one broke every other CommonJS
  script here).

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

## Session 5 continued — two more direct corrections, then a full Google Maps audit
Same session, after the write-up above: Jason gave two more direct
corrections (same "verify exact/near-exact shared coordinate before
applying" method as everything else): **Maple Street -> Vimy Ridge**
(start node exact match with Vimy Ridge's end node) and, in response to a
report that "George street... runs past the roundabout and all the way to
william," a **Spring/Lower Spring swap**: the OSM-tagged "Lower Spring
Street" chain already ran exactly Valley St -> (through Bartholemew St's
junction as an interior point) -> its own end, matching what Jason
described as the real "Spring Street." The OSM-tagged "Spring Street" was a
geographically separate road ~2km further west — renamed to "Upper Spring
Street" (one of the streets previously thought entirely absent from OSM;
turned out to just be mistagged). `nameOverrides`: `'Lower Spring Street':
'Spring Street'`, `'Spring Street': 'Upper Spring Street'`. (Also checked
Colborne St's extent against coordinates Jason gave — already correct,
no change needed; not every report is a bug.)

Also added a real UX feature: on a MISS, the map now flies to the missed
street's real location (bounds extended to include the guess point, for
"how far off was I" context) and shows a "pan or zoom to continue" hint,
holding indefinitely until the player makes a real gesture — no fixed
timer. Hits still auto-advance at 700ms, unaffected. The tricky part:
Leaflet's own `movestart`/`moveend` couldn't be used to detect "the user
moved it" — this map's `maxBounds`+`maxBoundsViscosity` fires its own extra
movestart/moveend correction cycles after the reveal's own `flyToBounds`,
which look identical to a real user gesture (confirmed by browser testing:
the reveal auto-advanced within ~1.5s with zero interaction using the first
implementation). Fixed by listening for raw DOM/Leaflet events that are
*only* ever fired by real input — `dragstart`, `wheel`, `dblclick`, and
multi-touch `touchmove` (pinch) — never by any programmatic map call.
Verified via `claude-in-chrome`: a real drag/wheel advances correctly, 3
seconds of no interaction does not, and a gameover-triggering miss still
reveals-and-waits before showing the end screen.

Then Jason asked for a full comparison against Google Maps. Split the
76-street list into 4 geographic bands (west/Mitchell Heights, downtown
core, north/east-core, east+north-rural-edge) and ran 4 parallel
research-only agents (no file edits), each driving `claude-in-chrome`
against Google Maps for its band, checking name + rough extent per street
and watching for anything Google shows that isn't in our data. Findings,
after manually filtering out band-boundary false-positives (an agent
flagging a street as "missing" just because it wasn't in *that agent's*
assigned list, when it's actually correctly present elsewhere in the full
76-street set — this happened for Main St, George St, Charlotte St,
Frances St, Charles St, Front St; not real gaps):
- **Genuine new conflict**: Google Maps still labels the road we just
  renamed to "Spring Street" as **"Lower Spring St"**, with Google's own
  "Spring St" label sitting ~80-100m away near Bartholemew St — directly
  contradicting Jason's fresh correction above. Presented to Jason
  alongside the pre-existing Hillcrest/Franklin conflict; **his call: keep
  both as originally corrected** (Spring Street = Valley->Bartholemew,
  Franklin Drive) — Google is stale/wrong in both cases, direct
  local knowledge wins. This is now the established policy for *future*
  conflicts too: prefer Google's current data **except** where it
  contradicts a direct correction Jason already gave from local knowledge.
- **11 real streets confirmed on Google Maps, zero OSM coverage under any
  tag** (added — see session 6 below for exact process): The Prom,
  Breakwater Blvd, Regatta Way, Harbour Way, Sandcastle Key, Meek St,
  McKenzie Lane (Mitchell Heights waterfront cluster), Sailor's Alley,
  Briar Hill Street (downtown core), McClary Ave, Spruce St (east side).
- **2 clean renames to match Google** (no prior local-knowledge override to
  conflict with): Bostwick Street -> Colonel Bostwick Street, 1st Street ->
  First Street.
- Minor/not-worth-touching: numbered-street spelling is otherwise
  consistent (2nd/3rd/4th match Google's numeral format, only "1st" itself
  didn't); East Road may split into "East St"(south)/"East Rd"(north) on
  Google with an unclear transition point, not investigated further; Edith
  St/Walnut St/River Road couldn't be confirmed either way on Google
  (short residential streets often aren't labeled at Google's own zoom
  levels — inconclusive, not evidence of an error).

## Session 6 — implementing the Google Maps audit findings
Continuation of the same audit. Two more parallel research-only agents
traced precise hand-digitizable geometry for the 11 confirmed-missing
streets (right-click "copy coordinates" on Google Maps per point, with
pixel-interpolation fallback where the right-click menu got flaky from
concurrent-agent tab contention in the shared browser session — ~20-40m
positional tolerance, fine for gameplay shape, not survey-grade). Then,
directly in `build_streets.js`:
- Added a `handDigitizedStreets` array (11 entries, each a synthetic "way"
  object like the existing `georgeRoundaboutConnector`/
  `mainStreetGapConnector`, but standalone quiz entries in their own right
  rather than merging into an existing chain) — concatenated into the raw
  way list alongside those two connectors.
- `nameOverrides`: `'Bostwick Street': 'Colonel Bostwick Street'`,
  `'1st Street': 'First Street'`.
- Verified the new streets' lat/lon extent still sits inside `index.html`'s
  existing `BOUNDS`/`CENTER` — no map viewport change needed this time.

Rebuilt, regenerated both inline files, re-ran `test_engine.js` and
`test_fuzz.js` (1931 checks) — all green. One commit pushed (`647ba69`).
Count went 76/71 -> 87/82 (net new real coverage, not consolidation this
time).

## Session 7 — Jamieson/Orchard merge reverted
Jason: "Jamieson and orchard need to be there the merge was wrong." Session
5's Jamieson/Orchard -> Main Street merge (plus the hand-invented 146m
gap-connector past Orchard's south end) was incorrect — reverted both:
- Removed `'Jamieson Street': 'Main Street'` and `'Orchard Street': 'Main
  Street'` from `nameOverrides` in `build_streets.js`.
- Removed `mainStreetGapConnector` (the straight-line placeholder) entirely
  — it only existed to bridge Main St through Orchard's old south end, no
  longer needed with the merge gone.
- Rebuilt: Jamieson Street (81m) and Orchard Street (124m) are separate
  quiz entries again; Main Street back to its original 4 chains
  (289m/48m/14m/71m). Regenerated both inline files, `test_engine.js` and
  `test_fuzz.js` (1941 checks) both green. Count: 90 records, 83 unique
  names.
- No note on what the *correct* Jamieson/Orchard extent should be — this
  was purely "undo the wrong merge," not a replacement correction. If
  Jason has a specific fix in mind for either street, get it next session.

## Session 7 continued — Edith Cavell connector, Edith St->McKenzie Lane, leaderboard
Same session, three more pieces of work.

**Edith Cavell Boulevard reconnected.** Jason: it's one real road, broken
into two OSM pieces — one off William St running west, one off Bartholemew
St running east — threading through two roundabout/loop shapes in between
that OSM has zero coverage of (confirmed: queried Overpass directly for that
bbox three times, all three 504'd; a general search of all raw files for
that bbox turned up nothing under any street name either). Confirmed the gap
is real and continuous via Google Maps walking directions (William St ->
Bartholemew end: "via Edith Cavell Blvd", 1.3km, no detour through another
named street) plus close-up satellite/road tracing of the loop shapes.
Added `edithCavellConnector` in `build_streets.js` (9-pt hand-digitized
placeholder, same ~20-40m tolerance standard as the other hand-digitized
geometry, anchored exactly on both real chain endpoints). Merged
`edith-cavell-boulevard-1` (800m) + `-2` (525m) into one 1499m chain.

**"Edith Street" was a stale-OSM duplicate of McKenzie Lane, not a separate
street.** Jason: the Municipality of Central Elgin officially renamed this
lane to McKenzie Lane specifically to avoid emergency-dispatch confusion
with Edith Cavell Blvd (same road this session started with — direct
follow-on). Checked coordinates: OSM way 126454240 ("Edith Street", 2-pt,
61m) and the session-6 hand-digitized `mckenzie-lane` entry trace the same
physical road (endpoints within ~5m of each other) — OSM just hadn't picked
up the rename, and session 6's Google Maps audit added McKenzie Lane as a
new hand-digitized street without realizing it already existed under the
old OSM name. Excluded way 126454240 via `excludeWayIds` (not a
`nameOverrides` rename, since that would've created a second overlapping
"McKenzie Lane" entry rather than removing the duplicate). Count: 88 -> 88
records but 83 -> 82 unique names (net: one fewer duplicate street name).

Both fixes rebuilt `streets.json`/`road_segments.json`, regenerated both
inline files, `test_engine.js` + `test_fuzz.js` (1947 checks) green.

**Server-backed top-10 leaderboard added** (plan §6/§8, previously deferred).
Jason wanted it shared across players, not per-browser — built as a Vercel
serverless function rather than `localStorage`.
- `api/leaderboard.js` (new): CommonJS, zero npm dependencies (uses global
  `fetch`, available in Vercel's Node runtime). GET returns the top 10, POST
  validates `{name, score}` (name trimmed/capped at 20 chars; score must be
  an integer 0-3000 — real max is 2780 given the current 88-street dataset,
  capped a bit higher so it doesn't need re-syncing on every dataset
  change) and stores into a Redis sorted set (`ps-leaderboard`) via Vercel
  KV's REST API, trimming to the top 10 after every write
  (`ZREMRANGEBYRANK ... 0 -11`).
- **First attempt used `export default` + a `"type": "module"`
  `package.json`, which broke every existing CommonJS build/test script**
  (`data/build_streets.js`, `test_engine.js`, `test_fuzz.js` all use
  `require`/`module.exports`) — Node applies `"type": "module"` project-wide,
  not just to the new file. Caught by re-running the test suite before
  committing. Fixed by deleting `package.json` entirely and rewriting the
  function as CommonJS (`module.exports = async function handler...`) —
  Vercel's default Node runtime handles plain CommonJS `.js` files in `api/`
  with no `package.json` needed at all.
- `index.html`: leaderboard functions now call `/api/leaderboard` instead of
  `localStorage`. Game-over screen shows a loading state, then either a
  name-entry form (if the score qualifies for top 10) or just the list.
  Degrades gracefully to an inline "Couldn't load leaderboard." message if
  the API is unreachable — verified this doesn't affect the rest of the game.
- **Real bug caught during browser testing, not code review**: the
  "just-saved" row highlight compared the returned entry to the list by
  object identity (`e === highlightEntry`). That works with an in-memory
  mock but silently fails against any real API, because `fetch`/`res.json()`
  deserializes the response into new objects — nothing is ever
  reference-equal after an HTTP round-trip. Fixed by comparing on the
  entry's `date` field (ISO timestamp, effectively unique) instead.
- Tested via a local mock server matching `api/leaderboard.js`'s exact
  request/response contract (real Vercel KV can't be exercised from this
  sandbox — needs Jason's one-time dashboard action, see below) — verified
  via `claude-in-chrome`: empty state, saving a score, the top-10 sort/trim,
  the highlight (after the fix above), and the network-failure fallback.
- **Database linked and verified live, same session.** Vercel's native "KV"
  product has been folded into their Marketplace — created an "Upstash for
  Redis" resource instead (`port-stanley-leaderboard`, Free plan, region
  iad1) via Storage -> Create Database -> Upstash -> Upstash for Redis,
  through the dashboard with Jason's explicit go-ahead (including a
  separate confirmation before accepting Upstash's ToS/data-sharing terms,
  since that's a distinct consent from "link the database"). Its
  auto-injected env vars (`KV_REST_API_URL`, `KV_REST_API_TOKEN`, plus
  `_READ_ONLY_TOKEN`/`KV_URL`/`REDIS_URL` variants) matched
  `api/leaderboard.js`'s expected names exactly — no code changes needed.
  Redeployed the existing commit (Deployments -> ... -> Redeploy) to pick up
  the new env vars, then verified the full round-trip against the live site
  (`port-stanley-street-quiz.vercel.app`): GET returned `{"list":[]}`,
  played a real game to game-over, saved a test score, confirmed it
  appeared correctly sorted/highlighted. Cleaned up the test entry via
  Upstash's REPL (`DEL ps-leaderboard` — had to briefly toggle the REPL's
  Safe Mode off, since it blocks `DEL` by default; toggled back on after).
  Live leaderboard is empty and ready for real play now, not blocked on
  anything further.

## Session 7 continued — Bridge Street reconnected across the lift bridge
Jason: "Fix bridge street, it goes from Carlow Road to colbourne." Checked
topology first: both existing Bridge Street chains already reached those
exact junctions (`bridge-street-2`'s end is an exact interior-node match on
Carlow Road; `bridge-street-1`'s end is an exact interior-node match on
Colborne Street) — so per-chain, nothing was wrong. The two chains just
didn't connect to *each other*, split by a real ~55m gap at the King George
VI Lift Bridge (this was already known and accepted as real per session 3).

Unlike every other gap fixed so far, this one didn't need hand-digitizing:
searched the raw OSM files for any way near the gap's two endpoints and
found way `126454128`, tagged **"King George VI Lift Bridge"** (its own
distinct OSM name, not "Bridge Street") — real surveyed geometry, and its
two endpoints are an *exact* zero-distance match for both chains' gap-facing
ends. It simply never got included in the "Bridge Street" quiz entry because
`byName` grouping only looks at the name string. Added `'King George VI Lift
Bridge': 'Bridge Street'` to `nameOverrides`; the three ways now chain
cleanly into one continuous 271m Bridge Street, Carlow Rd -> Colborne St.
Rebuilt, regenerated both inline files, `test_engine.js` + `test_fuzz.js`
(1937 checks) green. Count: 88 -> 86 records, 82 unique names unchanged
(pure consolidation, Bridge Street was already counted once in the name
total either way).

Worth remembering as a new variant of the "OSM split one street" bug class:
this time the missing piece wasn't absent from OSM or mistagged as a
*different real street's* name — it was tagged with the **feature's own
proper name** (the bridge itself). Worth checking whether any other
gap/gap-adjacent street in this dataset has a similarly separately-named
bridge, causeway, or named connector sitting in the raw data unmerged.

## Session 7 continued — Main St's real extent: Bridge/Colborne/Joseph to the roundabout
Jason: "main st is still wrong it should start at bridge, Colbourne, joseph
intersection and go straigh south to round about." (The Jamieson/Orchard
merge reverted earlier this session was wrong, but that revert alone didn't
fix Main St's actual north end — it just went back to being short of the
real intersection.)

Traced it and found a genuinely new variant of the "collateral damage from
an earlier fix" pattern: **session 3's Colborne Street duplicate-triangle
fix accidentally orphaned part of Main Street.** The exact junction node
[42.6656116,-81.2119315] sits between Main St's old north end and the real
Bridge/Colborne/Joseph intersection at [42.6660264,-81.2117931] — but the
*only* OSM ways reaching that junction (126454147, 126454230) were tagged
"Colborne Street" and got excluded back in session 3 as duplicates of
Colborne's own through-route (126454125, which bypasses that junction
entirely). Excluding them was correct *for Colborne St* — but it also cut
off Main St's only path to the intersection, since nothing else in OSM
covers that stretch under any name.

Fix: pulled `126454147` back out of `excludeWayIds` (its sibling
`126454230` stays excluded, still a genuine Colborne St duplicate — 147
alone already reaches the full intersection) and re-tagged both it and the
small connecting stub `1106642061` to "Main Street" via `wayNameOverrides`,
keyed by way id since this is real geometry misattributed to the wrong
street name, not missing/mistagged Main St data.

**Also found a second, independent bug while verifying the south end**: a
real roundabout (way `1106642053`, 22-pt closed loop, ~73m) sits where Main
St meets it — same "closed loop breaks endpoint chaining" issue as the
George St roundabout (session 5), except here nothing needed to *continue
through* it (Main St dead-ends into it per Jason's description), so no
connector was needed. But two short connectors linked the same north-arm
junction to two rim points ~11m apart on the circle (`1106642057`, already
part of the chain, and `1106642058`, stranding itself as a spurious extra
14m "Main Street" record) — same duplicate-parallel-path pattern as
Colborne/Selbourne/Frances. Excluded `1106642058`.

Result: Main St is now one 347m chain, exactly
Bridge/Colborne/Joseph -> roundabout rim, matching what Jason described.
Colborne Street also consolidated from 2 records to 1 (its stray 10m stub
was the same way now correctly reassigned to Main St). Two other small Main
St fragments remain untouched and unmerged — `main-street-2` (48m, an odd
chord through an external point) and `main-street-3` (71m, continuing south
past the roundabout, this used to be the far end of the reverted
Jamieson/Orchard merge) — deliberately left alone since Jason's description
stopped at the roundabout; didn't want to repeat the over-reach that made
the original Jamieson/Orchard merge wrong. Worth asking him directly if
those should merge in or stay separate.

Rebuilt, regenerated both inline files, `test_engine.js` + `test_fuzz.js`
(1935 checks) green. Count: 86 -> 84 records, 82 unique names unchanged.

## Session 7 continued — merged the two roundabout fragments into Main St
Jason: "Merge those" (the `main-street-2`/`main-street-3` fragments flagged
above). Same closed-loop-breaks-chaining problem as George St's roundabout:
way `1106642053` (Main St's roundabout, 22-pt closed loop, ~73m) connects
`main-street-1`'s south end (rim point idx5) to where the south arm
reattaches (rim point idx14, ~15m from a third rim point idx19) — but
`chainSegments` can't route through a closed loop, and can't represent a
3-way branch (idx14 / idx19 / continuing south) as one polyline either.

Added `mainStreetRoundaboutConnector` — the shorter of the loop's two arcs
(29m, idx5 through idx6-idx13 to idx14), extracted directly from the
roundabout's own real geometry, same technique as `georgeRoundaboutConnector`.
Excluded way `1106642054` (the branch's redundant loop-back to rim point
idx19 — same roundabout, ~15m from idx14, no new coverage) so the chain
picks the through-path instead: roundabout -> arc -> idx14 -> branch point
-> south to the previous `main-street-3` terminus.

Result: **Main Street is now one continuous 477m chain**, start to finish —
zero fragments left anywhere in the dataset (82 records = 82 unique names,
first time every street name maps to exactly one record). Rebuilt,
regenerated both inline files, `test_engine.js` + `test_fuzz.js`
(1943 checks) green. Count: 84 -> 82 records, 82 unique names unchanged.

## Session 8 — Label-streets toggle: guesses don't score
Jason: guesses while "Label streets" debug toggle on shouldn't count.
`index.html` `handleTap` now checks `debugLabelsOn` at guess time. If on:
round still uses a real turn — strikes/`roundStatus`/gameover all flow
normally from the engine (a miss still costs a strike) — only `score` is
frozen at its pre-guess value, `pointsAwarded` shown as 0, toast appends
"(practice, not scored)". First version also froze strikes; Jason corrected
that a miss should still cost a strike, only the score should be exempt.
`game-engine.js` untouched (pure, no toggle awareness) — override done
entirely in `index.html` by re-deriving state from the engine's raw result.
No rebuild/test-suite step needed (no data/engine change).

## Pending issues
- **Oak Street extent/connectivity** — Jason confirmed something's wrong
  but the specific correct extent hasn't been provided yet. Ask him for
  the same kind of fact as the Bridge St fix (e.g. "Oak St runs between X
  and Y") next session.
- Otherwise none known-broken. 82 records / 82 unique names as of session
  7 (every street name now maps to exactly one continuous chain — first
  time that's been true). The self-loop/duplicate-id/graph-cycle sweep
  itself hasn't been re-run since session 5/6's changes, though — worth
  doing once more corrections land rather than after every single one,
  given how much topology changed this session (Bridge St, Main St x2).
- Unresolved (Jason's explicit call: keep local knowledge over Google in
  both cases, see session 5 continued above):
  - Hillcrest Dr vs Franklin Drive (kept Franklin Drive)
  - Lower Spring St vs Spring St (kept Spring St = Valley->Bartholemew)
- The 11 newly-added streets are hand-digitized placeholders (~20-40m
  tolerance, 2-5 points each) — good enough for gameplay hit-testing given
  the existing tolerance radii (20-45m), but worth a precision pass later
  if Jason walks/drives them and can give exact corrections, same as any
  other street.
- East Road/Sunset Road/Dexter Line's further rural extensions were found
  but deliberately not added (see session 4) — revisit if the game's
  intended area should reach that far out. Possibly related: session 5's
  audit flagged East Road may split into "East St"/"East Rd" on Google with
  an unclear transition point — not investigated.
- Worth a proactive check (per [[feedback_full_sweep_after_pattern_repeats]] —
  this is now 6+ instances of the same "OSM split one real street into
  multiple names" bug class across sessions 3-6): scan the full dataset for
  any other street whose name has unusually few/short chains for its
  apparent length, the same smell that led to the Colborne/Selbourne/
  Frances/Merville/Main St/Vimy Ridge/Spring St/Edith Cavell fixes.
- Now that McKenzie Lane turned out to be a renamed OSM street rather than a
  true OSM gap (session 7), worth a second look at the rest of the
  session-6 `handDigitizedStreets` list (The Prom, Breakwater Blvd, Regatta
  Way, Harbour Way, Meek St, Sandcastle Key, Sailor's Alley, Briar Hill
  Street, McClary Ave, Spruce St) in case any of *those* are also stale OSM
  names elsewhere in the raw data rather than genuine gaps — not checked
  yet, McKenzie Lane was only caught because Jason happened to mention the
  rename unprompted.

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
3. Jason to review the full 82-name street list for any further
   corrections (found and fixed so far: Hillcrest->Franklin,
   Fairview/Fernie->Brayside, Victoria->Harrison Place, Bridge St's west
   stub->George Street, Merville->Brayside, George St roundabout topology,
   Jamieson/Orchard->Main St + gap [session 5, then reverted session 7 as
   wrong], Maple->Vimy Ridge, Lower Spring St->Spring St (+old Spring
   St->Upper Spring St), Bostwick->Colonel Bostwick, 1st->First Street,
   Edith Cavell Blvd reconnected across two roundabouts, Edith St->McKenzie
   Lane dedupe, Bridge St reconnected across the lift bridge, Main St's
   real extent fixed (Bridge/Colborne/Joseph -> roundabout, collateral
   damage from session 3's Colborne St fix) and its two roundabout
   fragments merged in). Add any more to `nameOverrides`/`wayNameOverrides`
   in `build_streets.js`. The "Label streets" toggle in-app (session 5) is
   built for exactly this review.
4. The 7 originally-known OSM-absent streets plus 4 more found in session
   5/6's full Google Maps audit (11 total: The Prom, Breakwater Blvd,
   Regatta Way, Harbour Way, Meek St, McKenzie Lane, Sandcastle Key,
   Sailor's Alley, Briar Hill Street, McClary Ave, Spruce St) were all
   hand-digitized and added in session 6 (`handDigitizedStreets` in
   `build_streets.js`, ~20-40m positional tolerance). Nothing left on this
   list unless a future audit finds more.
5. Open questions from the plan (§8), still unanswered:
   - Point spread: keep 10/20/30/40 (obscurity x1-4) or go steeper?
   - Whole town in-bounds, or core-only? This got more pointed this
     session — the north cluster (Hill St, High St, Gentry Lane, Compass
     Trail, Old Field Lane, Lincoln's Cove) reads as a distinct
     newer/fringe subdivision, exactly the case the plan flagged. Jason
     approved including it, but worth confirming it still feels like
     "Port Stanley" gameplay-wise once he's played it.
   - Any streets to exclude entirely (private lanes, unnamed access roads)?
6. Step 8's leaderboard is done (session 7 — server-backed via Vercel KV/
   Upstash Redis, see above). Once gameplay/data are otherwise locked in:
   step 7 (manifest.json + service worker for installable PWA) and the
   rest of step 8 (difficulty select, other towns) per plan — still not
   started.
