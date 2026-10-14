// ============================================================
// CREDITS DATA
// ============================================================

// Shown by the CREDITS screen (screens.js creditsHTML). Edit
// this list, not the screen code. Every file in public/assets
// must be listed here with its source and licence.
//
// Entries still marked 'Source: TODO' have no source recorded
// anywhere in the repo (code, commits or PRs). Replace them
// with the real source and licence before submission.

const POLY_HAVEN = 'Poly Haven (polyhaven.com) — CC0';
const TODO = 'Source: TODO';

export const CREDITS = [
  {
    heading: 'Team EagleStack',
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
        detail: 'MIT licence — includes the GLTFLoader and RGBELoader add-ons'
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
      { name: 'Level 1 day sky', detail: TODO, files: ['hdri/level1_day.hdr'] },
      { name: 'Level 2 midday sky', detail: TODO, files: ['hdri/level2_midday.hdr'] },
      { name: 'Level 3 night sky', detail: TODO, files: ['hdri/level3_night.hdr'] }
    ]
  },

  {
    heading: 'Models',
    entries: [
      {
        name: 'Sesfikile minibus taxi',
        detail: TODO,
        files: ['models/sesfikile.glb']
      },
      {
        name: 'Pursuer, traffic cars, pedestrians and street props',
        detail: 'Built in code by the team'
      }
    ]
  }
];
