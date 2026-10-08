import { createCityStreet } from './cityStreet.js';


// One environment factory per level. Each returns
// { group, collidables, dispose() }.
//
// Stage A: every level still gets the city street (what the
// shared world looked like before). Levels 2 and 3 get
// their own factories in the next stages.
const FACTORIES = {
  1: createCityStreet,
  2: createCityStreet,
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
