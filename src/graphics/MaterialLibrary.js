import * as THREE from 'three';


export class MaterialLibrary {

  constructor(renderer) {

    this.renderer =
      renderer;


    this.loader =
      new THREE.TextureLoader();


    this.maxAnisotropy =
      Math.min(
        renderer.capabilities.getMaxAnisotropy(),
        8
      );


    // ==================================================
    // ROAD
    // ==================================================

    this.road =
      this.loadSet({

        color:
          './assets/textures/road/asphalt_pit_lane_diff_2k.jpg',

        normal:
          './assets/textures/road/asphalt_pit_lane_nor_gl_2k.png',

        roughness:
          './assets/textures/road/asphalt_pit_lane_rough_2k.jpg',

        ao:
          './assets/textures/road/asphalt_pit_lane_ao_2k.jpg'
      });


    // ==================================================
    // PAVEMENT
    // ==================================================

    this.pavement =
      this.loadSet({

        color:
          './assets/textures/pavement/cracked_concrete_02_diff_2k.jpg',

        normal:
          './assets/textures/pavement/cracked_concrete_02_nor_gl_2k.png',

        roughness:
          './assets/textures/pavement/cracked_concrete_02_rough_2k.jpg',

        ao:
          './assets/textures/pavement/cracked_concrete_02_ao_2k.jpg'
      });


    // ==================================================
    // GRASS
    // ==================================================

    this.grass =
      this.loadSet({

        color:
          './assets/textures/grass/leafy_grass_diff_2k.jpg',

        normal:
          './assets/textures/grass/leafy_grass_nor_gl_2k.png',

        roughness:
          './assets/textures/grass/leafy_grass_rough_2k.jpg',

        ao:
          './assets/textures/grass/leafy_grass_ao_2k.jpg'
      });


    // ==================================================
    // CONCRETE BUILDING
    // ==================================================

    this.concreteBuilding =
      this.loadSet({

        color:
          './assets/textures/concrete-building/concrete_layers_diff_2k.jpg',

        normal:
          './assets/textures/concrete-building/concrete_layers_nor_gl_2k.png',

        roughness:
          './assets/textures/concrete-building/concrete_layers_rough_2k.jpg',

        ao:
          './assets/textures/concrete-building/concrete_layers_ao_2k.jpg'
      });


    // ==================================================
    // BRICK
    // ==================================================

    this.brickBuilding =
      this.loadSet({

        color:
          './assets/textures/brick-building/red_brick_diff_2k.jpg',

        normal:
          './assets/textures/brick-building/red_brick_nor_gl_2k.png',

        roughness:
          './assets/textures/brick-building/red_brick_rough_2k.jpg',

        ao:
          './assets/textures/brick-building/red_brick_ao_2k.jpg'
      });


    // ==================================================
    // ROUGH CONCRETE
    // ==================================================

    this.roughConcrete =
      this.loadSet({

        color:
          './assets/textures/concrete-rough/rough_concrete_diff_2k.jpg',

        normal:
          './assets/textures/concrete-rough/rough_concrete_nor_gl_2k.png',

        roughness:
          './assets/textures/concrete-rough/rough_concrete_rough_2k.jpg',

        ao:
          './assets/textures/concrete-rough/rough_concrete_ao_2k.jpg'
      });
  }


  // ==================================================
  // LOAD SET
  // ==================================================

  loadSet(paths) {

    return {

      color:
        this.loadTexture(
          paths.color,
          true
        ),

      normal:
        this.loadTexture(
          paths.normal,
          false
        ),

      roughness:
        this.loadTexture(
          paths.roughness,
          false
        ),

      ao:
        this.loadTexture(
          paths.ao,
          false
        )
    };
  }


  // ==================================================
  // LOAD TEXTURE
  // ==================================================

  loadTexture(
    path,
    colorTexture
  ) {

    const texture =
      this.loader.load(
        path
      );


    texture.wrapS =
      THREE.RepeatWrapping;


    texture.wrapT =
      THREE.RepeatWrapping;


    texture.anisotropy =
      this.maxAnisotropy;


    if (
      colorTexture
    ) {

      texture.colorSpace =
        THREE.SRGBColorSpace;
    }


    return texture;
  }


  // ==================================================
  // MAP CLONE
  // ==================================================

  cloneMap(
    texture,
    repeatX,
    repeatY
  ) {

    const map =
      texture.clone();


    map.wrapS =
      THREE.RepeatWrapping;


    map.wrapT =
      THREE.RepeatWrapping;


    map.repeat.set(
      repeatX,
      repeatY
    );


    map.anisotropy =
      this.maxAnisotropy;


    map.needsUpdate =
      true;


    return map;
  }


  // ==================================================
  // MATERIAL
  // ==================================================

  createMaterial(
    set,
    repeatX,
    repeatY,
    options = {}
  ) {

    const material =
      new THREE.MeshStandardMaterial({

        map:
          this.cloneMap(
            set.color,
            repeatX,
            repeatY
          ),

        normalMap:
          this.cloneMap(
            set.normal,
            repeatX,
            repeatY
          ),

        roughnessMap:
          this.cloneMap(
            set.roughness,
            repeatX,
            repeatY
          ),

        aoMap:
          this.cloneMap(
            set.ao,
            repeatX,
            repeatY
          ),

        roughness:
          options.roughness ??
          1,

        metalness:
          options.metalness ??
          0,

        color:
          options.color ??
          0xffffff
      });


    material.normalScale.set(

      options.normalStrength ??
      1,

      options.normalStrength ??
      1
    );


    material.envMapIntensity =
      options.envMapIntensity ??
      1;


    return material;
  }


  // ==================================================
  // ROAD
  // ==================================================

  createRoadMaterial() {

    return this.createMaterial(

      this.road,

      5,

      95,

      {
        roughness:
          0.97,

        normalStrength:
          0.55,

        envMapIntensity:
          0.35
      }
    );
  }


  // ==================================================
  // PAVEMENT
  // ==================================================

  createPavementMaterial() {

    return this.createMaterial(

      this.pavement,

      5,

      13,

      {
        roughness:
          0.95,

        normalStrength:
          0.65,

        envMapIntensity:
          0.3
      }
    );
  }


  // ==================================================
  // GRASS
  // ==================================================

  createGrassMaterial() {

    return this.createMaterial(

      this.grass,

      65,

      65,

      {
        roughness:
          1,

        normalStrength:
          0.7,

        envMapIntensity:
          0.15
      }
    );
  }


  // ==================================================
  // CONCRETE BUILDING
  // ==================================================

  createConcreteBuildingMaterial(
    repeatY = 8,
    tint = 0xffffff
  ) {

    return this.createMaterial(

      this.concreteBuilding,

      5,

      repeatY,

      {
        roughness:
          0.88,

        normalStrength:
          0.62,

        envMapIntensity:
          0.4,

        color:
          tint
      }
    );
  }


  // ==================================================
  // BRICK BUILDING
  // ==================================================

  createBrickBuildingMaterial(
    repeatY = 8
  ) {

    return this.createMaterial(

      this.brickBuilding,

      7,

      repeatY,

      {
        roughness:
          0.9,

        normalStrength:
          0.8,

        envMapIntensity:
          0.3
      }
    );
  }


  // ==================================================
  // ROUGH CONCRETE
  // ==================================================

  createRoughConcreteMaterial(
    repeatX = 3,
    repeatY = 8
  ) {

    return this.createMaterial(

      this.roughConcrete,

      repeatX,

      repeatY,

      {
        roughness:
          0.98,

        normalStrength:
          0.72,

        envMapIntensity:
          0.25
      }
    );
  }
}