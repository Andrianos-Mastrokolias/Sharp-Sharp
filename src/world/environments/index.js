import { createCityStreet } from './cityStreet.js';
import { createMotorway } from './motorway.js';


// One environment factory per level. Each returns
// { group, collidables, dispose() }.
//
// Level 3 still gets the city street (what the shared world
// looked like before) until its own factory lands.
const FACTORIES = {
  1: createCityStreet,
  2: createMotorway,
  3: createCityStreet
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
