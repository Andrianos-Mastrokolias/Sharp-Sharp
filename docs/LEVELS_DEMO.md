# Levels, traffic and pursuit demonstration

Baseline: `origin/main` at `18f4470` plus the Level 1 rank race. Member 2 scope: worlds, levels, traffic, pursuit, capture.

Numbers below come from `LEVELS` in `src/world/LevelManager.js` and the passing
tests (`npm test`). Anything marked **(check live)** has not been timed in-game.

## Level 1 - Rank to CBD (city street)

**Goal:** race out of the taxi rank (z 170 to the exit line at z -60), then drive
the 900 m to the CBD drop-off (z -730) and stop inside the 8 m zone at 4 m/s or
slower.

1. **The rank race.** The taxi starts in the middle of a bunched 3 x 3 grid with
   8 rival minibuses (columns x -6, 0, 6; rows z 158, 170, 182, 12 m apart; the
   taxi at 0, 170; the car straight ahead is a racer). A 3 s countdown holds the taxi, the rivals, traffic, pursuit and the
   clock (`inputLocked`); then the rivals launch. They mix four personalities
   (racer, weaver, brake-checker, cutter) at 17 to 22 m/s and are solid.
2. **Points** (`getState().score`, pop-ups through `onScore`): +100 for each
   rival beaten (once each), +300 for being the first car over the exit line,
   -50 per pedestrian hit (hook only, nothing calls it yet). Points are a
   bonus; the level is won by delivering.
3. **Phases** (`getState().race.phase`): countdown, racing, cbd (over the exit
   line), chase (the police have appeared). After z -140 a rival is removed
   once it is 25 m behind the taxi, and all are removed when the taxi passes
   z -250, so nobody vanishes in view ahead.
4. Past the rank: two traffic lanes (7 cars each), one same direction, one
   oncoming; they start after the exit line. Cars are seeded, so the layout is
   identical on every load. A same-direction car does not wrap in while the
   taxi is within 40 m of the entry point.
5. Drive into the back of a car. The whole lane stops together, waits 1.0 s,
   resumes after 0.5 s, and keeps at least an 8 m gap. The taxi takes one cargo
   stress hit, not several.
6. At 55% of the route (z -325) a pursuer appears behind the taxi, at
   25 m + 10 m for each rival beaten (up to 105 m), read at that moment, and
   chases at 1.15x the taxi's top speed. After a stumble (a drop of 8 m/s or
   more) it stays tight for 1.4 s (Level 2: 1.25 s), and it only starts to
   close in on a taxi slower than 0.8 of top speed, at 0.3 per second (the
   defaults, still used on Level 3, are 2 s, 0.9 and 0.5).
7. Show both outcomes: stay near top speed and it never closes in; slow down and
   it holds position in capture range, then catches you after 1.5 s of
   continuous contact (fails the level).
8. Reach the zone. Traffic inside 18 m of the destination goes ghost so it can
   never block the delivery.
9. **Pedestrians can be hit.** Drive onto a sidewalk or a side street and run
   into someone at 1 m/s or more: they are knocked aside in a puff of dust, the
   taxi loses 30% of its speed (`vehicle.applyHit`), the cargo takes a little
   stress, and the race score loses 50 points. The police do not care. Each
   person can be hit once per load, there is a 0.5 s cooldown between hits, and
   a retry puts everyone back. The people are animated in a shader, so
   `life.js` keeps a CPU copy of their paths for the hit test.
10. **Runners.** Six people on the CBD stretch (z -130 to -640, after the exit
    gantry, clear of side streets and shopfronts) wait at the kerb and dash
    across at 5 m/s when the taxi is about to reach them. A runner starts about
    1.9 s before the taxi arrives (the time it needs to reach the taxi's line),
    or when the taxi is 35 m away if it is slower than about 18 m/s, so a
    driver who holds a straight line hits one (-50 points, 30% of the speed)
    and one who brakes after it starts, or drives 2.5 m or more to one side,
    misses. Each runner goes once per load, is removed on the far side, and a
    retry puts them all back. Data: `LEVELS[1].runners`.

**Say:** the world is data (a level config), traffic, rivals and pursuit are
separate systems that read it, and all are deterministic so they can be tested.
The race is a layer on top: beat rivals, win a bigger head start on the police.

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
6. **Runners.** Eight people (z -540 to 240, none in the first or last 60 m)
   wait on the shoulder and dash across when the taxi is about to reach them,
   the same rule as Level 1 (they aim at the route's x at that z, so on the
   wander they start from the side that gives them about 2.5 s). No lights are
   added: they only show in the headlights, in light clothes. A hit costs the
   usual speed and cargo stress and no points. Data: `LEVELS[3].runners`.

**Say:** the same pursuit system, configured differently, produces a different
game: stealth instead of a straight chase.

## Files to explain

- `src/world/LevelManager.js`: `LEVELS` configs (spawn, route, destination, hazards, pursuit, traffic, elevated sections); level load/reset.
- `src/world/roads.js`: per-level road length and bounds shared by the world, traffic and vehicle limits.
- `src/world/environments/cityStreet.js`, `motorway.js`, `township.js`: scenery for Levels 1, 2 and 3.
- `src/world/environments/life.js` and `props/people.js`: the pedestrians (shader walk, `personPosition` CPU copy, `createPedestrianField` hit test and dust) and the runners (`createRunners`, `planRunnerZs`, the trigger in the field's `update`).
- `src/world/TrafficSystem.js`: seeded lanes, lane hold, wrap hold, zone ghosting, no per-frame allocation.
- `src/world/RivalTaxis.js`: the rival taxis (Level 1 rank race); `LevelManager` owns the countdown, points, releasing and the police head start.
- `src/world/PursuitSystem.js`: chase, patrol/reaction, flyover keep-out, capture and catch lunge.
- `src/main.js`: `onCaptured` hooks capture to the fail screen; the vehicle is given no keys while `levelManager.inputLocked` (the countdown).
- `tests/traffic.test.mjs`, `tests/pursuit.test.mjs`, `tests/rank-race.test.mjs`, `tests/pedestrians.test.mjs`, `tests/environments.test.mjs`, `tests/budget.mjs`: what each guarantees.

## Performance (from `tests/budget.mjs`)

Worst-case view with overhead (rivals counted all in view, the runners included): Level 1 about 415 draws and 60k triangles,
Level 2 about 161 draws and 49k, Level 3 about 175 draws and 33k.
Level 1 is the heaviest because of buildings and street life. **(check live)**
frame rate on the demo machine at Low, Medium and High quality.
