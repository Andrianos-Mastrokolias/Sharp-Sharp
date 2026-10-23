# Levels, traffic and pursuit demonstration

Baseline: `origin/main` at `79be6c2`. Member 2 scope: worlds, levels, traffic, pursuit, capture.

Numbers below come from `LEVELS` in `src/world/LevelManager.js` and the passing
tests (`npm test`). Anything marked **(check live)** has not been timed in-game.

## Level 1 - Rank to CBD (city street)

**Goal:** drive the 900 m from the taxi rank (z 170) to the CBD drop-off (z -730)
and stop inside the 8 m zone at 4 m/s or slower.

1. Start at the rank. Point out the route is a straight road and the destination ring.
2. Drive the road. Two traffic lanes: one same direction, one oncoming. Cars are
   seeded, so the layout is identical on every load.
3. Drive into the back of a car. The whole lane stops together, waits 1.0 s,
   resumes after 0.5 s, and keeps at least an 8 m gap. The taxi takes one cargo
   stress hit, not several.
4. At 66% of the route a pursuer appears 30 m behind and chases at 1.15x the
   taxi's top speed.
5. Show both outcomes: stay near top speed and it never closes in; slow down and
   it holds position in capture range, then catches you after 1.5 s of
   continuous contact (fails the level).
6. Reach the zone. Traffic inside 18 m of the destination goes ghost so it can
   never block the delivery.

**Say:** the world is data (a level config), traffic and pursuit are separate
systems that read it, and both are deterministic so they can be tested.

## Level 2 - The Highway

**Goal:** 1100 m (z 170 to -930) with a route choice.

1. **Ground route:** a speed bump at z 25 and potholes at z 5, -20 and -50.
2. **Flyover route:** break right before z 40, climb the ramp, cross the deck
   (structure z 10 to -110: 30 m ramps at each end, flat deck z -20 to -80)
   over the hazards, rejoin the road. Elevation is real: the
   vehicle gets its ground height from the level, not from a visual-only mesh.
3. Rails on the deck are solid; traffic is kept clear of the flyover footprint,
   ramps, rails and pillars.
4. Pursuit starts after a 3 s delay at 1.1x speed. On the flyover the pursuer
   follows up the ramp, slows on the slope, and stays between the rails.
   A pursuer on the ground cannot capture a taxi on the deck.
5. Traffic runs in two same-direction lanes (x 0 and x -3.6).

**Say:** one level, two valid solutions with different risk. The flyover avoids
the hazards but the pursuer can follow, so neither route is strictly safer.

## Level 3 - Load Shedding (township back road, night)

**Goal:** 900 m from z -600 to z 300, driving +Z along a winding road.

1. No traffic. Night visuals: the road is dark.
2. Three hidden potholes (z -85, -10 and 70) are near-black and only visible in
   the headlight beam. Hitting one dips the taxi and stresses the cargo. The
   three shared main-road potholes (z 5, -20 and -50) are also drawn dark and
   physical here (check live).
3. **Headlight stealth:** lights on, the pursuer notices you from 120 m; lights
   off, only from 15 m. Lights on at the start, it wakes after 1 s already
   inside 120 m and goes straight to reacting; lights off, it patrols and
   only reacts within 15 m (check live).
4. Pursuer states: patrols along the road, then on sighting it brakes, holds
   still flashing for the reaction time (1.5 s), then chases. It loses you
   after the lose time (4 s) out of range: 170 m with lights on, 30 m with
   lights off.
5. Trade-off to point out: lights off hides you but hides the potholes too.

**Say:** the same pursuit system, configured differently, produces a different
game: stealth instead of a straight chase.

## Files to explain

- `src/world/LevelManager.js`: `LEVELS` configs (spawn, route, destination, hazards, pursuit, traffic, elevated sections); level load/reset.
- `src/world/roads.js`: per-level road length and bounds shared by the world, traffic and vehicle limits.
- `src/world/environments/cityStreet.js`, `motorway.js`, `township.js`: scenery for Levels 1, 2 and 3.
- `src/world/TrafficSystem.js`: seeded lanes, lane hold, zone ghosting, no per-frame allocation.
- `src/world/PursuitSystem.js`: chase, patrol/reaction, flyover keep-out, capture and catch lunge.
- `src/main.js`: `onCaptured` hooks capture to the fail screen.
- `tests/traffic.test.mjs`, `tests/pursuit.test.mjs`, `tests/environments.test.mjs`, `tests/budget.mjs`: what each guarantees.

## Performance (from `tests/budget.mjs`)

Worst-case view with overhead: Level 1 about 398 draws and 58k triangles,
Level 2 about 161 draws and 49k, Level 3 about 154 draws and 31k.
Level 1 is the heaviest because of buildings and street life. **(check live)**
frame rate on the demo machine at Low, Medium and High quality.
