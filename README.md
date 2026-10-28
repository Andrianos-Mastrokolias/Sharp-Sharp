# Sharp-Sharp

A 3D taxi game for the browser, built with Three.js. You drive a
Johannesburg minibus taxi with a family's belongings strapped to the roof:
you race out of a taxi rank, run the CBD, take the highway at midday and
cross a pitch-black township at night, with the police chasing you.

Built for COMS3006A / COMS3025A (Computer Graphics and Visualisation) at the
University of the Witwatersrand.

**Play it:** <https://wmc.ms.wits.ac.za/students/sgroup3884/>
(Chrome recommended. Keep the trailing slash. Sound starts after your first
click.)

## The game

You win a level by stopping (4 m/s or less) in the goal zone with at least
2 of your 5 roof items. You lose if fewer than 2 remain, or if the police
catch you.

| Level | What it adds |
| --- | --- |
| **1. Rank to CBD** (about 900 m) | You start in a taxi rank among 8 rival taxis. After a 3-2-1 countdown you race out: +100 points for every rival you beat and +300 for leaving the rank first. The police join the chase later, and the more rivals you beat, the bigger your head start. The CBD has traffic, pedestrians and runners who dash across the road. |
| **2. The Highway** (about 1,100 m) | A fast motorway with a route choice in 3D: the ground lane with its bump and potholes, or the flyover. Driving fast for too long loosens your straps. |
| **3. Load Shedding** (about 900 m) | A township at night. Your headlights show the potholes but also give you away: the police patrol the road and spot you from far away with your lights on, but only from close up with them off. Slow night traffic and runners make the dark dangerous. |

Hitting a pedestrian slows the taxi and, on Level 1, costs 50 points.

## Controls

| Key | Action |
| --- | --- |
| W / S | Drive and brake or reverse |
| A / D | Steer |
| Space | Handbrake |
| C | Change camera (chase, bumper, interior) |
| L | Headlights |
| R | Retry the level |
| Esc / P | Pause |
| M | Mouse drive: left button throttle, right button brake, move the mouse to steer |
| Mouse drag, mouse wheel | Look around and zoom (chase camera) |

## Features

- **Vehicle physics:** acceleration, speed-sensitive grip, drifting with the
  handbrake, a spring suspension, gravity, collisions, and a cargo model with
  straps and loads that can fly off.
- **Custom shaders:** a headlight beam, a heat haze, a procedural sky dome
  and a vertex shader that animates the pedestrians.
- **Lighting and effects:** a lighting preset for each level, HDRI lighting
  and reflections, soft shadows, fog, dust, and a skyline backdrop.
- **Police pursuit AI:** patrol, spot, react, chase and capture, tuned per
  level, with a head start that depends on how you did in the rank.
- **A living world:** moving traffic, rival taxis with different driving
  personalities, hundreds of pedestrians, and runners.
- **Three cameras:** chase, bumper and interior.
- **Interface:** a loading screen, menus, level select, HUD with score and
  countdown, pause, settings (volume, mute, graphics resolution) and credits.
- **Audio:** recorded engine, siren and impact sounds, plus synthesised
  race cues.
- **Performance:** merged and instanced meshes, nothing allocated per frame,
  and draw-call budgets checked by tests.

## Run it locally

You need Node 24 (the version CI uses).

```bash
npm install
npm run dev       # play at http://localhost:5173/
npm test          # run the test suites
npm run build     # production build into dist/
npm run preview   # serve the build at http://localhost:4173/
```

On Windows PowerShell, if `npm` is blocked by the script policy, use
`npm.cmd` instead.

## Deploying to the department server

The server only serves static files. `vite.config.js` sets `base: './'`, so
every path is relative and the game works from a subfolder.

1. `npm run build`, then `npm run preview` and play it once.
2. Zip the **contents** of `dist/`, so that `index.html` is at the top of the
   archive and not inside a folder.
3. In the group's File Manager, delete the old `assets/` folder and
   `index.html` (the build gives files new names each time), upload the zip,
   and choose the plain UnZip. Delete the zip afterwards.
4. Open the live address in Chrome and check the console for errors.

Asset file names are lowercase, because the server's file names are
case-sensitive.

## Project structure

```text
src/
  main.js         game loop, screens flow and wiring
  vehicle/        taxi, vehicle physics and cargo
  world/          levels, pursuit AI, traffic, rival taxis, environments
  graphics/       lighting, sky, materials, effects, skyline, dust
  shaders/        headlight beam and heat haze shaders
  cameras/        the three camera modes
  audio/          sound, volume and the race cues
  input/          optional mouse driving
  ui/             menus, HUD, countdown, loading screen, credits
  game/           saved preferences
public/assets/    models, textures, HDRIs and audio
tests/            test suites and tools
docs/             demo walkthroughs
```

## Tests and tools

`npm test` runs the audio, budget, environment, pedestrian, traffic,
pursuit, rank-race and HUD suites. The vehicle physics tests run with:

```bash
node --test tests/vehicle-physics.test.mjs tests/vehicle-hit.test.mjs tests/vehicle-moving-collision.test.mjs tests/level2-strap-pressure.test.mjs
```

`tests/tools/` holds analysis tools: a headless rendering harness, a pursuit
balance simulation, and scripted runs of the rank race, the pedestrians and
the runners. See `tests/tools/README.md`.

Some tests check that nothing is allocated per frame, and they are sensitive
to the Node version, so use Node 24.

## More documentation

- `docs/LEVELS_DEMO.md`: a walkthrough of each level, what to explain, and
  the performance numbers.
- `docs/AUDIO_GRAPHICS_DEMO.md`: the audio and graphics demo notes.

## Team

| Member | Area |
| --- | --- |
| Kayura Govindsammy | Vehicle physics, cargo and rival taxis |
| Andrianos Mastrokolias | Graphics, lighting, shaders, cameras, the taxi model and the rank scenery |
| Abdur-Rahman Perin | Audio and settings |
| Leah Ramdeen | Levels, environments, pursuit AI, traffic and pedestrians |
| Suhail Seedat | Interface, HUD, game flow, build and hosting |

Parts of the code and tests were written with AI coding assistants (Claude
Code and Codex). AI co-authors are recorded in the commit history.

## Credits

Everything we did not make ourselves is listed, with its source and licence,
on the in-game Credits screen. In short: three.js and Vite; the Bungee, Alfa
Slab One, Rye and Barlow fonts (SIL Open Font Licence, through Fontsource);
Poly Haven textures and HDRIs (CC0); recorded sounds from Freesound (CC0); and
the taxi model by googlenaut on SketchUp 3D Warehouse. The police car, traffic
cars, pedestrians and street props are built in code.
