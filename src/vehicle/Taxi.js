import * as THREE from 'three';

export function createTaxi(createBox) {
  const taxi = new THREE.Group();

  // --------------------------------------------------
  // Chassis
  // --------------------------------------------------

  const chassis = new THREE.Group();
  taxi.add(chassis);

  // --------------------------------------------------
  // Main body
  // --------------------------------------------------

  const body = createBox(
    2.2,
    1.1,
    4.4,
    0xe8c547
  );

  body.position.y = 1.1;
  chassis.add(body);

  // --------------------------------------------------
  // Cabin
  // --------------------------------------------------

  const cabin = createBox(
    2.05,
    1.0,
    2.8,
    0xe8c547
  );

  cabin.position.set(
    0,
    2.05,
    -0.15
  );

  chassis.add(cabin);

  // --------------------------------------------------
  // Windscreen
  // --------------------------------------------------

  const windscreen = createBox(
    1.85,
    0.65,
    0.04,
    0x28485c
  );

  windscreen.position.set(
    0,
    2.1,
    -1.57
  );

  chassis.add(windscreen);

  // --------------------------------------------------
  // Rear window
  // --------------------------------------------------

  const rearWindow = createBox(
    1.85,
    0.65,
    0.04,
    0x28485c
  );

  rearWindow.position.set(
    0,
    2.1,
    1.27
  );

  chassis.add(rearWindow);

  // --------------------------------------------------
  // Headlights
  // --------------------------------------------------

  for (const x of [-0.75, 0.75]) {
    const light = createBox(
      0.4,
      0.25,
      0.05,
      0xfff4c2
    );

    light.position.set(
      x,
      0.95,
      -2.23
    );

    chassis.add(light);
  }

  // --------------------------------------------------
  // Wheels
  // --------------------------------------------------

  const wheels = [];
  const frontWheelPivots = [];

  function createWheel(
    x,
    z,
    isFront = false
  ) {
    const pivot =
      new THREE.Group();

    pivot.position.set(
      x,
      0.45,
      z
    );

    taxi.add(pivot);

    const wheel =
      new THREE.Mesh(
        new THREE.CylinderGeometry(
          0.45,
          0.45,
          0.25,
          16
        ),

        new THREE.MeshStandardMaterial({
          color: 0x202124
        })
      );

    wheel.rotation.z =
      Math.PI / 2;

    wheel.castShadow = true;

    pivot.add(wheel);

    wheels.push(wheel);

    if (isFront) {
      frontWheelPivots.push(
        pivot
      );
    }
  }

  // Front wheels
  createWheel(
    -1.15,
    -1.45,
    true
  );

  createWheel(
    1.15,
    -1.45,
    true
  );

  // Rear wheels
  createWheel(
    -1.15,
    1.45
  );

  createWheel(
    1.15,
    1.45
  );

  // --------------------------------------------------
  // Roof rack
  // --------------------------------------------------

  const rack = createBox(
    1.9,
    0.1,
    3.1,
    0x333333
  );

  rack.position.set(
    0,
    2.65,
    -0.1
  );

  chassis.add(rack);

  // --------------------------------------------------
  // Cargo
  // --------------------------------------------------

  const suitcase = createBox(
    0.8,
    0.55,
    0.9,
    0x9b5c3c
  );

  suitcase.position.set(
    -0.55,
    3.0,
    -0.75
  );

  chassis.add(suitcase);


  const travelBag = createBox(
    0.7,
    0.55,
    0.75,
    0x596b75
  );

  travelBag.position.set(
    0.45,
    3.0,
    -0.75
  );

  chassis.add(travelBag);


  const crate = createBox(
    0.85,
    0.7,
    0.85,
    0x8b6a45
  );

  crate.position.set(
    -0.45,
    3.1,
    0.25
  );

  chassis.add(crate);


  const mattress = createBox(
    1.65,
    0.22,
    1.15,
    0xd6d0b8
  );

  mattress.position.set(
    0,
    3.0,
    0.95
  );

  chassis.add(mattress);


  const fridge = createBox(
    0.75,
    1.25,
    0.7,
    0xd8dde0
  );

  fridge.position.set(
    0.5,
    3.42,
    0.15
  );

  chassis.add(fridge);

  // --------------------------------------------------
  // Cargo definitions
  // --------------------------------------------------

  const cargoItems = [
    {
      name: 'Suitcase',
      mesh: suitcase,
      vulnerability: 1.0
    },

    {
      name: 'Travel Bag',
      mesh: travelBag,
      vulnerability: 0.9
    },

    {
      name: 'Crate',
      mesh: crate,
      vulnerability: 0.75
    },

    {
      name: 'Mattress',
      mesh: mattress,
      vulnerability: 1.35
    },

    {
      name: 'Fridge',
      mesh: fridge,
      vulnerability: 1.15
    }
  ];

  return {
    taxi,
    chassis,
    wheels,
    frontWheelPivots,
    cargoItems
  };
}