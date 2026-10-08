import { createCityStreet } from './cityStreet.js';
import { createMotorway } from './motorway.js';
import { createTownship } from './township.js';


// ==================================================
// LEVEL ENVIRONMENTS
// --------------------------------------------------
// One factory per level, each in its own file:
//
//   1  cityStreet.js  city street
//   2  motorway.js    motorway
//   3  township.js    township back road ("Load Shedding")
//
// Contract (for the 3D model team):
//
//   factory({ materials }) -> { group, collidables, dispose }
//
//   materials    the shared MaterialLibrary. Its create*Material()
//                calls return new materials with cloned textures
//                that belong to the environment; never dispose
//                the library's own base textures.
//   group        THREE.Group holding everything the level draws.
//                LevelManager adds it to the scene on load() and
//                dispose() removes it.
//   collidables  plain, childless THREE.Mesh objects the taxi
//                hits. LevelManager registers them in the shared
//                array VehicleController reads (it box-tests each
//                one every frame), so keep the count small and
//                never use an InstancedMesh here. Everything
//                else is non-collidable: instance or merge it.
//   dispose()    frees every geometry, material and texture the
//                factory created (disposeObjectTree in
//                helpers.js does this for the whole group).
//
// Rules every level follows:
//   - The road runs along z at x = 0 (18 m wide, z -200..200).
//     The speed bump (z 25) and the three potholes (helpers.js:
//     SPEED_BUMP / MAIN_POTHOLES) feed the vehicle's physics and
//     must be drawn at exactly those positions; restyle only.
//   - The flyover, hazards, spawn and destination belong to
//     LevelManager, not to an environment.
//   - Repeated props come from one factory function each in
//     props.js: replace its body with a loaded model and the
//     rest of the level is unchanged.
//   - Nothing allocates per frame.
//
// Unknown level ids fall back to the city street.
// ==================================================

const FACTORIES = {
  1: createCityStreet,
  2: createMotorway,
  3: createTownship
};


export function buildEnvironment(
  levelId,
  context
) {

  const factory =
    FACTORIES[
      levelId
    ] ?? createCityStreet;


  return factory(
    context
  );
}
