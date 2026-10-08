// A MaterialLibrary stand-in for headless tests: same create*Material()
// contract as the real one (new material, cloned maps), no renderer or images.
import * as THREE from 'three';

export function makeLibrary() {
  const set = () => ({
    color: new THREE.Texture(),
    normal: new THREE.Texture(),
    roughness: new THREE.Texture(),
    ao: new THREE.Texture()
  });

  const lib = {
    road: set(), pavement: set(), grass: set(),
    concreteBuilding: set(), brickBuilding: set(), roughConcrete: set()
  };

  const make = (s, rx, ry) => {
    const clone = (t) => { const c = t.clone(); c.repeat.set(rx, ry); return c; };
    return new THREE.MeshStandardMaterial({
      map: clone(s.color), normalMap: clone(s.normal),
      roughnessMap: clone(s.roughness), aoMap: clone(s.ao)
    });
  };

  lib.createRoadMaterial = () => make(lib.road, 1, 1);
  lib.createPavementMaterial = () => make(lib.pavement, 1, 1);
  lib.createGrassMaterial = () => make(lib.grass, 1, 1);
  lib.createConcreteBuildingMaterial = (ry) => make(lib.concreteBuilding, 1, ry);
  lib.createBrickBuildingMaterial = (ry) => make(lib.brickBuilding, 1, ry);
  lib.createRoughConcreteMaterial = (rx, ry) => make(lib.roughConcrete, rx, ry);

  return lib;
}
