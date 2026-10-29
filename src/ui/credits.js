// ============================================================
// CREDITS DATA
// ============================================================

// Shown by the CREDITS screen (screens.js creditsHTML). Edit
// this list, not the screen code. Every file in public/assets
// must be listed here with its source and licence.

const POLY_HAVEN = 'Poly Haven (polyhaven.com) — CC0';
const POLY_HAVEN_HDRI = 'Poly Haven (polyhaven.com) — CC0 1.0';

export const CREDITS = [
  
{
  heading: 'Sound & music',
  entries: [
    {
      name: 'Abdur-Rahman Perin — audio system and integration',
      detail:
        'Original Web Audio synthesis, procedural sound effects, ' +
        'audio playback and mixing implemented for Sharp-Sharp ' +
        'with Codex assistance. The game also uses CC0-licensed ' +
        'recorded sound effects and music, credited individually below. ' +
        'Procedural audio provides fallback sounds when recordings ' +
        'are unavailable.',
      files: ['src/audio/GameAudio.js']
    }
  ]
},

  {
    heading: 'Recorded audio (CC0)',
    entries: [
      {
        name: 'Bus Engine Idling — bikesnbassboi',
        detail: 'https://freesound.org/people/bikesnbassboi/sounds/540398/ — CC0 1.0 (https://creativecommons.org/publicdomain/zero/1.0/). HQ MP3 recording excerpt, mono, filtered, level adjusted and crossfaded for looping. The original procedural integration credited above remains as a fallback.',
        files: ['audio/engine-idle.mp3']
      },
      {
        name: 'Diesel drive in Belgium — gecop',
        detail: 'https://freesound.org/people/gecop/sounds/521768/ — CC0 1.0 (https://creativecommons.org/publicdomain/zero/1.0/). Interior 1900 cc turbo-diesel recording; steady driving excerpt, mono, filtered, level adjusted and crossfaded for looping.',
        files: ['audio/engine-drive.mp3']
      },
      {
        name: 'MISC_Police_Siren_Wailer_Static_001.wav — conleec',
        detail: 'https://freesound.org/people/conleec/sounds/159753/ — CC0 1.0 (https://creativecommons.org/publicdomain/zero/1.0/). Recorded stationary American police wail; HQ MP3 excerpt, mono, filtered, level adjusted and crossfaded for looping.',
        files: ['audio/police-wail.mp3']
      },
      {
        name: 'Car Crash — squareal',
        detail: 'https://freesound.org/people/squareal/sounds/237375/ — CC0 1.0 (https://creativecommons.org/publicdomain/zero/1.0/). Recorded metal-cabinet and grit/glass foley, not an actual vehicle crash. HQ MP3 excerpt, mono, filtered, level adjusted and faded.',
        files: ['audio/body-impact.mp3']
      },
      {
        name: 'Heavy Metal Thud on Ground — 7of9Designs',
        detail: 'https://freesound.org/people/7of9Designs/sounds/640204/ — CC0 1.0 (https://creativecommons.org/publicdomain/zero/1.0/). Recorded heavy metal object hitting dirt; HQ MP3, mono, filtered, level adjusted and faded.',
        files: ['audio/cargo-thud.mp3']
      },
      {
        name: 'precipitate — gonpulvo',
        detail: 'https://weeklybeats.com/gonpulvo/music/precipitate — CC0, as published by the author (https://creativecommons.org/publicdomain/zero/1.0/). Afro-house/IDM instrumental made with the M8; 64-bar excerpt at 126 BPM, filtered, level adjusted and crossfaded for looping. All six local recordings are re-encoded MP3 derivatives; no live third-party audio requests are made by the game.',
        files: ['audio/township-drive.mp3']
      }
    ]
  },
  {
    heading: 'EagleStack',
    entries: [
      { name: 'Kayura Govindsammy' },
      { name: 'Andrianos Mastrokolias' },
      { name: 'Abdur-Rahman Perin' },
      { name: 'Leah Ramdeen' },
      { name: 'Suhail Seedat' }
    ]
  },

  {
    heading: 'Libraries',
    entries: [
      {
        name: 'three.js r185',
        detail: 'MIT'
      },
      {
        name: 'Vite 8',
        detail: 'MIT licence — build tool'
      }
    ]
  },

  {
    heading: 'Fonts',
    entries: [
      { name: 'Bungee', detail: 'SIL Open Font License 1.1 (via Fontsource)' },
      { name: 'Alfa Slab One', detail: 'SIL Open Font License 1.1 (via Fontsource)' },
      { name: 'Rye', detail: 'SIL Open Font License 1.1 (via Fontsource)' },
      { name: 'Barlow', detail: 'SIL Open Font License 1.1 (via Fontsource)' }
    ]
  },

  {
    heading: 'Textures',
    entries: [
      {
        name: 'Asphalt Pit Lane',
        detail: POLY_HAVEN,
        files: [
          'textures/road/asphalt_pit_lane_diff_2k.jpg',
          'textures/road/asphalt_pit_lane_nor_gl_2k.png',
          'textures/road/asphalt_pit_lane_rough_2k.jpg',
          'textures/road/asphalt_pit_lane_ao_2k.jpg'
        ]
      },
      {
        name: 'Cracked Concrete 02',
        detail: POLY_HAVEN,
        files: [
          'textures/pavement/cracked_concrete_02_diff_2k.jpg',
          'textures/pavement/cracked_concrete_02_nor_gl_2k.png',
          'textures/pavement/cracked_concrete_02_rough_2k.jpg',
          'textures/pavement/cracked_concrete_02_ao_2k.jpg'
        ]
      },
      {
        name: 'Leafy Grass',
        detail: POLY_HAVEN,
        files: [
          'textures/grass/leafy_grass_diff_2k.jpg',
          'textures/grass/leafy_grass_nor_gl_2k.png',
          'textures/grass/leafy_grass_rough_2k.jpg',
          'textures/grass/leafy_grass_ao_2k.jpg'
        ]
      },
      {
        name: 'Concrete Layers',
        detail: POLY_HAVEN,
        files: [
          'textures/concrete-building/concrete_layers_diff_2k.jpg',
          'textures/concrete-building/concrete_layers_nor_gl_2k.png',
          'textures/concrete-building/concrete_layers_rough_2k.jpg',
          'textures/concrete-building/concrete_layers_ao_2k.jpg'
        ]
      },
      {
        name: 'Red Brick',
        detail: POLY_HAVEN,
        files: [
          'textures/brick-building/red_brick_diff_2k.jpg',
          'textures/brick-building/red_brick_nor_gl_2k.png',
          'textures/brick-building/red_brick_rough_2k.jpg',
          'textures/brick-building/red_brick_ao_2k.jpg'
        ]
      },
      {
        name: 'Rough Concrete',
        detail: POLY_HAVEN,
        files: [
          'textures/concrete-rough/rough_concrete_diff_2k.jpg',
          'textures/concrete-rough/rough_concrete_nor_gl_2k.png',
          'textures/concrete-rough/rough_concrete_rough_2k.jpg',
          'textures/concrete-rough/rough_concrete_ao_2k.jpg'
        ]
      }
    ]
  },

  {
    heading: 'HDRI skies',
    entries: [
      { name: 'Level 1 day sky', detail: POLY_HAVEN_HDRI, files: ['hdri/level1_day.hdr'] },
      { name: 'Level 2 midday sky', detail: POLY_HAVEN_HDRI, files: ['hdri/level2_midday.hdr'] },
      { name: 'Level 3 night sky', detail: POLY_HAVEN_HDRI, files: ['hdri/level3_night.hdr'] }
    ]
  },

  {
    heading: 'Models',
    entries: [
      
{
  name: "Toyota Ses'fikile minibus taxi — googlenaut",
  detail:
    "Original 3D model uploaded by googlenaut to SketchUp 3D Warehouse. " +
    "Source: https://embed-3dwarehouse-classic.sketchup.com/model/93cd92b6-5bd0-421e-9d41-9e4952468c14/Toyota-Sesfikile. " +
    "Modified and exported in Blender for use in Sharp-Sharp.",
  files: ['models/sesfikile.glb']
},

      {
        name: 'Pursuer, traffic cars, pedestrians and street props',
        detail: 'Built in code by the team'
      }
    ]
  },

  {
    heading: 'Adapted code',
    entries: [
      {
        name: 'GLTFLoader',
        detail: 'three.js — MIT',
        files: ['src/vehicle/Taxi.js']
      },
      {
        name: 'RGBELoader',
        detail: 'three.js — MIT',
        files: ['src/graphics/LightingManager.js']
      },
      {
        name: 'RoundedBoxGeometry',
        detail: 'three.js — MIT',
        files: ['src/vehicle/Taxi.js']
      },
      {
        name: 'BufferGeometryUtils',
        detail: 'three.js — MIT',
        files: [
          'src/world/environments/helpers.js',
          'src/world/environments/props.js',
          'src/world/environments/props/people.js',
          'src/world/environments/props/vehicles.js'
        ]
      },
      {
        name: 'GLSL hash fract(sin(dot(...)) * 43758.5453)',
        detail:
          'Common GLSL pseudo-random hash snippet ' +
          '(widely used; popularised by The Book of Shaders)',
        files: [
          'src/shaders/HeadlightBeamShader.js',
          'src/shaders/HeatHazeShader.js'
        ]
      }
    ]
  }
];
