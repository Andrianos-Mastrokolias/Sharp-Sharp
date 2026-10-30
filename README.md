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
| V | Toggle rear-view mirror (not available on Low graphics quality) |
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
  and a vertex shader that animates the pedestrians. A screen overlay shader
  (`src/shaders/SpeedLinesShader.js`), drawn on one quad attached to the
  camera, adds speed lines and a police siren glow in a single draw call. The
  speed lines turn `vUv` into polar coordinates, cut the circle into slices,
  light a random set of them with a hash, and scroll the streaks outward with
  `uTime`; their strength follows `uSpeed`. The siren glows red on the left
  edge and blue on the right, swapping sides with `uTime`, and its strength
  follows `uPursuit`, the police pressure.
- **Lighting and effects:** a lighting preset for each level, HDRI lighting
  and reflections, soft shadows, fog, dust, and a skyline backdrop.
- **Police pursuit AI:** patrol, spot, react, chase and capture, tuned per
  level, with a head start that depends on how you did in the rank.
- **A living world:** moving traffic, rival taxis with different driving
  personalities, hundreds of pedestrians, and runners.
- **Three cameras:** chase, bumper and interior.
- **Interface:** a loading screen, menus, level select, HUD with score, a
  3-2-1 start countdown, score pop-ups, pause, settings (volume, mute,
  graphics resolution), credits, and restarting without reloading the page.
  Bra Sipho, the narrator character, introduces the game on the menu, briefs
  you before each level and reacts to your results.
- **Audio:** recorded engine, siren and impact sounds, plus synthesised
  race cues.
- **Performance:** merged and instanced meshes, nothing allocated per frame,
  and draw-call budgets checked by tests.
  - **Additional CGV effects:** a toggleable live rear-view mirror,
  procedurally generated height-map terrain in Level 1,
  and physically based glass refraction at the taxi marshal's booth.

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
  shaders/        headlight beam, heat haze, and speed-lines/siren overlay shaders
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
pursuit, rank-race, HUD and vehicle physics suites.

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
| Leah Ramdeen | Levels, environments, pursuit AI, traffic, pedestrians, build and hosting |
| Suhail Seedat | Interface, HUD, game state machine and restart, countdown and score pop-ups, Bra Sipho narrator, speed-lines and siren shader |

What each of us built:

- **Kayura Govindsammy:** vehicle and cargo physics, the vehicle level API and
  collision bounds, rival taxi AI with overtaking, the rival taxi scoring fix,
  the Level 2 roadworks, and the Level 3 police balance.
- **Leah Ramdeen:** level design and integration. The longer levels, the
  Level 1 taxi rank race (start grid, countdown, scoring and head start), the
  environments, police pursuit design and balancing, traffic on all three
  levels, pedestrians (hitting them and the runners), the story text, and the
  level demo docs and test tools.
- **Andrianos Mastrokolias:** the first driving prototype, the three camera
  modes, lighting, shaders, shadows and textures, the fix for the texture
  loading warnings, the taxi rank scenery, the rear-view mirror and its V
  toggle, height-map terrain and glass refraction, and the CI build check.
- **Abdur-Rahman Perin:** the audio system (recorded engine, siren and music)
  and the audio and graphics settings.
- **Suhail Seedat:** menus and game state, the HUD and scoring, the Level 1
  score and countdown overlay, mouse drive, the audio hookup, credits, and the
  HUD and countdown tests.

Parts of the code and tests were written with AI coding assistants (Claude
Code and Codex). AI co-authors are recorded in the commit history. Bra
Sipho's character art was generated with Gemini, using freely available
online images as inspiration.

## Credits

Everything we did not make ourselves is listed, with its source and licence,
on the in-game Credits screen. In short: three.js and Vite; the Bungee, Alfa
Slab One, Rye and Barlow fonts (SIL Open Font Licence, through Fontsource);
Poly Haven textures and HDRIs (CC0); recorded sounds from Freesound (CC0);
the taxi model by googlenaut on SketchUp 3D Warehouse; and Bra Sipho's
character art, generated with Gemini (Nano Banana) from a team-written prompt
and edited by the team. The police car, traffic
cars, pedestrians and street props are built in code.
