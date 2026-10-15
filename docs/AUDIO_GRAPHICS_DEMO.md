# Audio and graphics demonstration

Baseline: `origin/main` at `83a2492` (2026-10-15).
Branch: `audio-and-graphics`.
Worktree: `C:\Sharp-Sharp\.worktrees\audio-and-graphics`.
The original `feature/member5-remaining-work` checkout remains in place with its existing edits.

## Audit and scope

Latest main already supplies the Joburg menu/HUD/loading design, level select,
three-level progression, pause/retry/end screens, credits, and Level 3 lighting,
headlight stealth and patrol/reaction fixes. These implementations are retained.
Main has no audio module or sound/resolution settings panel.

The original uncommitted Member 5 work supplies `src/audio/GameAudio.js` and
`src/game/preferences.js`. Those modules were selectively reused. Its old
`main.js`, scoring, menus and gameplay changes were not copied.

New integration adds recorded engine layers, a continuous pursuit siren,
instrumental background music, a true collision notification, explicit mute, and a settings panel using
the current menu components. Existing cargo-loss events trigger cargo audio.
The only vehicle-controller change is an optional collision notification;
collision response and stress calculations are unchanged.

## Presenting the work

1. Open Settings from the main menu. Adjust master volume, mute and resolution.
   Refresh and show that values persist. Low caps pixel ratio at 0.75, medium
   at 1 and high at 2, limited by the display's device pixel ratio. This changes
   the actual drawing-buffer resolution; shaders, HDR lighting and cameras remain.
2. Start a level using the normal Start Level button. Browser interaction unlocks
   one Web Audio context. Engine pitch and volume respond to vehicle speed;
   braking lowers engine volume and can trigger a brake cue.
3. Demonstrate pursuit: the siren sweeps continuously while the pursuer is
   reacting, chasing or catching, and fades out when the pursuit is lost or idle.
   Level 3's existing headlight detection rules still control pursuit.
4. Hit an obstacle and lose cargo to demonstrate distinct crash and cargo cues.
   Crash audio uses the actual collision event above 1 m/s, rather than guessing
   from deceleration. Cargo audio uses `CargoSystem.onCargoLost`.
5. Pause, change settings, resume, retry, and return to the menu. Engine, siren,
   music and transient voices are silenced outside active gameplay. Recorded music
   uses one loop source, retains its position across pauses, and adds no scheduling timer.
6. Open the existing Credits screen and point out the sound/music entries,
   including the recording creators, original URLs, CC0 licences and processing details.

The soundtrack is a 64-bar, approximately 122-second excerpt of gonpulvo's
126 BPM afro-house/IDM instrumental `precipitate`, filtered, level adjusted and
crossfaded for looping. The original 112 BPM procedural score and synthesized
effects remain as fallbacks when recordings cannot load. Final listening on the
demo speakers is still needed; these recordings are not a claim of musical or
vehicle-model authenticity.

## Files to explain

- `src/audio/GameAudio.js`: shared context/master gain, engine, siren, bounded cues and music.
- `src/game/preferences.js`: defensive saved preferences and applied pixel ratio.
- `src/ui/settings.js`: current-style sound and graphics settings.
- `src/main.js`: existing lifecycle/input/render-loop integrations.
- `src/vehicle/VehicleController.js`: optional collision notification.
- `src/ui/screens.js`: Settings menu entry; existing menus retained.
- `src/ui/credits.js`: original procedural-audio acknowledgement plus recording attribution.
- `public/assets/audio/`: six compressed, locally served recordings listed below.
- `tests/audio-settings.test.mjs`: audio lifecycle, scheduling, mute, persistence,
  renderer quality and collision regression tests.
- `tests/tools/audio-settings-smoke.mjs`: headless Edge integration checks using
  inspection hooks only in a temporary served test bundle.
- `package.json`: focused test commands and inclusion in the existing test suite.
- `.gitignore`: excludes temporary audio/settings smoke artifacts.

## Assets and attribution

Demonstrate the Sesfikile taxi, cargo, procedural pursuer/traffic/people/props,
Poly Haven road/building/grass textures, and the three HDR environments.
Current `credits.js` already lists these and the fonts/libraries/adapted code.
Its taxi entry records SketchUp 3D Warehouse as the download source and Blender
modification/export; the original author remains unknown. Obtain the exact model
page URL, original creator, applicable licence/usage terms, and modification
record from the teammate who sourced it. Do not claim these details are verified.
Exact Poly Haven HDR asset page identities also remain absent from the credits.
The following recordings were added as local MP3 derivatives. All source pages
declare CC0; `credits.js` records the original URLs, creators, licences and edits.
The game makes no live requests to these third-party sources.

| Local audio file | Original recording and creator |
| --- | --- |
| `engine-idle.mp3` | [Bus Engine Idling — bikesnbassboi](https://freesound.org/people/bikesnbassboi/sounds/540398/) |
| `engine-drive.mp3` | [Diesel drive in Belgium — gecop](https://freesound.org/people/gecop/sounds/521768/) |
| `police-wail.mp3` | [Police Siren Wailer — conleec](https://freesound.org/people/conleec/sounds/159753/) |
| `body-impact.mp3` | [Car Crash — squareal](https://freesound.org/people/squareal/sounds/237375/) |
| `cargo-thud.mp3` | [Heavy Metal Thud on Ground — 7of9Designs](https://freesound.org/people/7of9Designs/sounds/640204/) |
| `township-drive.mp3` | [precipitate — gonpulvo](https://weeklybeats.com/gonpulvo/music/precipitate) |

Total added audio size: 2,273,336 bytes (2.17 MiB). Engine recordings represent
a bus at idle and an interior turbo-diesel car while driving, rather than a
verified Sesfikile. The siren is an American police wail. The collision is
recorded metal-cabinet and grit/glass foley, rather than an actual vehicle crash.

## Suggested trailer footage (about 30 seconds)

- 0–5 s: taxi pulls away; engine pitch rises over quiet backing music.
- 5–12 s: pursuit and siren, then a short Level 3 headlights/stealth shot.
- 12–17 s: obstacle impact and a cargo drop with clear sound feedback.
- 17–24 s: pause, master-volume/mute demonstration and resolution selection.
- 24–30 s: resume driving and end on the existing credits/audio acknowledgement.

Record a clean game-audio capture and confirm the final mix on the demo speakers.
Automated checks cannot judge audible quality or cultural fit. A separate offline
render of all layers and eight simultaneous impacts at maximum volume stayed
below clipping (peak 0.592); this does not replace listening to the final mix.

## Validation

Baseline existing Node tests passed. Baseline production build failed because
the four Fontsource packages newly required by main were absent from the existing
dependency directory. After explicit approval, `npm ci` installed the locked
dependencies in this worktree. The production build now passes, with the existing
large JavaScript chunk warning (about 785 kB before gzip).

`npm test` passed with six audio/settings regression tests plus all existing
budget, environments, people, traffic and pursuit suites. A subsequent rapid-transition
cleanup fix passed all seven focused audio/settings tests and a new production build.
`git diff --check` passed.
The initial headless Edge smoke passed settings/mute persistence, driving audio
activation, pause/resume, retry, failure, all three scripted delivery transitions,
replay and credits, with 38 resources and no runtime errors or missing files.
Zero-voice assertions on failure and completion screens also passed, including
rapid transitions before the first gameplay frame. The 390×844 settings screenshot
was inspected and its controls/text fit the viewport.
Browser deliveries are scripted transition tests,
not physical route playthroughs. Manual listening, full routes (including both
Level 2 routes), real target-browser/device performance and trailer capture remain.

### Final publication verification (2026-10-15)

- Fetched `origin`; `origin/main` remained at
  `83a24924d2f4509cf0db819afbd6d14aa5a1f358`, the starting commit. No new main
  changes needed integration, and the remote feature branch did not yet exist.
- `npm test` passed all seven audio/settings tests and the existing budget,
  environment, people, traffic and pursuit suites.
- `npm run build` passed. The existing large-chunk warning remains
  (approximately 791 kB before gzip).
- `npm run test:audio:smoke` passed with 44 resources, no missing files or
  runtime errors, and all three scripted delivery transitions.
- All six audio files are attributed in credits and match the production copies.
  Generated build output, caches and temporary comparison/smoke artifacts are
  excluded from the commit. The candidate-file secret-pattern scan found no hits.
- The project owner reports manual verification of graphics resolution and
  persistence. This automated publication pass did not assess audible quality,
  full driving routes or hosted LAMP behaviour.

An earlier `npm audit --json` snapshot reported one high-severity advisory in the existing locked
`source-map-js` dependency: GHSA-68fv-2mgg-jv7q (indexed source-map section offsets
can cause event-loop denial of service). Dependency versions and the lockfile
were left unchanged; a dependency update needs separate review. That audit is
historical evidence and was not refreshed as part of the final publish checks.

Deployment and university submission remain separate steps.
