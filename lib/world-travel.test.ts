import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createWorldTravel } from './world-travel.ts';
import type { Journey, TravelState } from './travel.ts';

const stationJourney: Journey = {
  from: { id: 'station-a', name: 'Station A', lon: 0, lat: 0 },
  to: { id: 'station-b', name: 'Station B', lon: 0.01, lat: 0 },
  distance: 1000,
  legs: [
    {
      mode: 'train',
      coordinates: [
        [0, 0],
        [0.01, 0],
      ],
      cumulative: [0, 1000],
      tunnels: [false, false],
      distance: 1000,
      startGap: 0,
      endGap: 0,
    },
  ],
};

await test('the train brakes into the endpoint and stays there until replay', () => {
  const scene = new THREE.Scene(),
    camera = new THREE.PerspectiveCamera(),
    target = new THREE.Vector3();
  const travel = createWorldTravel(
    scene,
    (x, z, lift = 0) => new THREE.Vector3(x * 100000, lift, z * 100000),
    () => {},
  );
  let state: TravelState | undefined;
  travel.api.load(stationJourney, (s) => {
    state = s;
  });
  travel.api.configure({ paused: false, speed: 60 });
  let previous = 0;
  for (let frame = 1; frame <= 1200; frame++) {
    travel.tick(1 / 60, (frame * 1000) / 60, camera, target, false, false);
    assert.ok(state!.progress >= previous && state!.progress <= 1);
    previous = state!.progress;
  }
  assert.equal(state!.phase, 'arrived');
  assert.equal(state!.progress, 1);
  assert.equal(state!.paused, true);
  const arrivedEye = camera.position.clone();
  travel.tick(1, 21000, camera, target, false, false);
  assert.ok(
    camera.position.distanceTo(arrivedEye) < 1e-8,
    'arrival does not loop or drift',
  );
  travel.dispose();
});

await test('boarding starts in the carriage and waits for an explicit departure', () => {
  const scene = new THREE.Scene(),
    camera = new THREE.PerspectiveCamera(),
    target = new THREE.Vector3();
  const travel = createWorldTravel(
    scene,
    (x, z, lift = 0) => new THREE.Vector3(x * 100000, lift, z * 100000),
    () => {},
  );
  let state: TravelState | undefined;
  travel.api.load(stationJourney, (s) => {
    state = s;
  });
  travel.tick(0, 0, camera, target, false, false);
  travel.tick(5, 5000, camera, target, false, false);
  assert.equal(state?.view, 'window');
  assert.equal(state?.phase, 'boarding');
  assert.equal(state?.progress, 0);
  assert.equal(state?.paused, true);
  assert.ok(camera.position.y > 2 && camera.position.y < 4);
  travel.dispose();
});

await test('departure accelerates gently, pause is immediate, and replay boards again', () => {
  const scene = new THREE.Scene(),
    camera = new THREE.PerspectiveCamera(),
    target = new THREE.Vector3();
  const travel = createWorldTravel(
    scene,
    (x, z, lift = 0) => new THREE.Vector3(x * 100000, lift, z * 100000),
    () => {},
  );
  let state: TravelState | undefined;
  travel.api.load(stationJourney, (s) => {
    state = s;
  });
  travel.tick(0, 0, camera, target, false, false);
  travel.api.configure({ paused: false });
  for (let frame = 1; frame <= 60; frame++)
    travel.tick(1 / 60, (frame * 1000) / 60, camera, target, false, false);
  assert.ok(
    state!.progress > 0 && state!.progress < 0.05,
    'the first second eases into the selected 10x pace',
  );
  travel.api.configure({ paused: true });
  const progress = state!.progress;
  travel.tick(1, 2100, camera, target, false, false);
  assert.equal(state!.progress, progress);
  travel.api.seek(1);
  assert.equal(state!.phase, 'arrived');
  travel.api.seek(0);
  assert.equal(state!.phase, 'boarding');
  assert.equal(state!.paused, true);
  travel.dispose();
});

await test('camera changes ease while paused and reduced motion uses an immediate view', () => {
  const scene = new THREE.Scene(),
    camera = new THREE.PerspectiveCamera(),
    target = new THREE.Vector3();
  const travel = createWorldTravel(
    scene,
    (x, z, lift = 0) => new THREE.Vector3(x * 100000, lift, z * 100000),
    () => {},
  );
  travel.api.load(stationJourney, () => {});
  travel.tick(0, 0, camera, target, false, false);
  const eye = camera.position.clone();
  travel.api.configure({ view: 'ride' });
  assert.equal(
    travel.tick(1 / 60, 16, camera, target, false, false),
    true,
    'a paused view transition keeps rendering',
  );
  assert.ok(camera.position.distanceTo(eye) < 1, 'no one-frame camera jump');
  for (let frame = 2; frame <= 90; frame++)
    travel.tick(1 / 60, (frame * 1000) / 60, camera, target, false, false);
  assert.ok(camera.position.y > 30);
  travel.tick(0, 1600, camera, target, false, true);
  travel.api.configure({ view: 'window' });
  travel.tick(0, 1601, camera, target, false, true);
  assert.ok(camera.position.y < 4);
  travel.dispose();
});
await test('ride playback, paused camera changes, skip, camera controls and cleanup remain independent of scenery', () => {
  const scene = new THREE.Scene(),
    camera = new THREE.PerspectiveCamera(),
    target = new THREE.Vector3();
  const travel = createWorldTravel(
    scene,
    (x, z, lift = 0) => new THREE.Vector3(x * 100000, lift, z * 100000),
    () => {},
  );
  const journey: Journey = {
    from: { id: 'a', name: 'A', lon: 0, lat: 0 },
    to: { id: 'b', name: 'B', lon: 0.01, lat: 0 },
    distance: 1000,
    legs: [
      {
        mode: 'train',
        coordinates: [
          [0, 0],
          [0.01, 0],
        ],
        cumulative: [0, 1000],
        distance: 1000,
        tunnels: [false, false],
        startGap: 0,
        endGap: 0,
      },
    ],
  };
  let state: TravelState | undefined;
  travel.api.load(journey, (s) => (state = s));
  travel.tick(0, 1, camera, target, false, false);
  const train = scene.getObjectByName('Travel train')!;
  assert.equal(
    train.children.filter((unit) => unit.visible).length,
    4,
    'the full train is present at departure',
  );
  const low = camera.position.y;
  travel.api.configure({ view: 'overview' });
  travel.tick(1.2, 2, camera, target, false, false);
  assert.ok(
    camera.position.y > low + 100,
    'camera mode reaches the selected view while paused',
  );
  travel.api.configure({ paused: false, speed: 2 });
  travel.tick(1, 300, camera, target, false, false);
  assert.ok(state!.progress > 0 && state!.progress < 0.02);
  const firstProgress = state!.progress;
  travel.useExternalCamera();
  travel.tick(1, 600, camera, target, false, false);
  assert.ok(state!.progress > firstProgress);
  travel.api.seek(1);
  assert.equal(state?.complete, true);
  assert.equal(state?.paused, true);
  travel.api.seek(0);
  travel.api.configure({ paused: false });
  travel.tick(1, 900, camera, target, false, true);
  assert.equal(state?.progress, 0);
  assert.equal(state?.reducedMotion, true);
  travel.dispose();
  assert.equal(scene.children.length, 0);
});

await test('onboard camera rides inside the locomotive instead of at aerial height', () => {
  const scene = new THREE.Scene(),
    camera = new THREE.PerspectiveCamera(),
    target = new THREE.Vector3();
  const travel = createWorldTravel(
    scene,
    (x, z, lift = 0) => new THREE.Vector3(x * 100000, lift, z * 100000),
    () => {},
  );
  const leg = {
    mode: 'train' as const,
    coordinates: [
      [0, 0],
      [0.01, 0],
    ] as [number, number][],
    cumulative: [0, 1000],
    distance: 1000,
    tunnels: [false, false],
    startGap: 0,
    endGap: 0,
  };
  travel.api.load(
    {
      from: { id: 'a', name: 'A', lon: 0, lat: 0 },
      to: { id: 'b', name: 'B', lon: 0.01, lat: 0 },
      legs: [leg],
      distance: 1000,
    },
    () => {},
  );
  travel.api.seek(0.2);
  travel.api.configure({ view: 'onboard' });
  travel.tick(0, 1, camera, target, false, false);
  assert.ok(
    camera.position.y > 2 && camera.position.y < 5,
    'camera is at cab eye height',
  );
  assert.ok(
    target.x > camera.position.x,
    'camera faces forward along the railway',
  );
  camera.position.y = 55;
  travel.tick(0, 1.5, camera, target, false, false);
  assert.ok(
    camera.position.y < 5,
    'paused onboard camera stays attached to the locomotive',
  );
  travel.api.configure({ view: 'ride' });
  travel.tick(1.2, 2, camera, target, false, false);
  assert.ok(camera.position.y > 30, 'external view restores the aerial camera');
  travel.dispose();
});

await test('external camera pan survives moving playback and the default pace is 10x', () => {
  const scene = new THREE.Scene(),
    camera = new THREE.PerspectiveCamera(),
    target = new THREE.Vector3();
  const travel = createWorldTravel(
    scene,
    (x, z, lift = 0) => new THREE.Vector3(x * 100000, lift, z * 100000),
    () => {},
  );
  const leg = {
    mode: 'train' as const,
    coordinates: [
      [0, 0],
      [0.01, 0],
    ] as [number, number][],
    cumulative: [0, 1000],
    distance: 1000,
    tunnels: [false, false],
    startGap: 0,
    endGap: 0,
  };
  let state: TravelState | undefined;
  travel.api.load(
    {
      from: { id: 'a', name: 'A', lon: 0, lat: 0 },
      to: { id: 'b', name: 'B', lon: 0.01, lat: 0 },
      legs: [leg],
      distance: 1000,
    },
    (s) => (state = s),
  );
  travel.api.configure({ paused: false, view: 'ride' });
  travel.tick(0, 1, camera, target, false, false);
  camera.position.add(new THREE.Vector3(15, 20, 30));
  target.add(new THREE.Vector3(7, 0, 5));
  const offset = camera.position.clone().sub(target),
    before = target.clone();
  travel.tick(1, 300, camera, target, false, false);
  assert.ok(
    camera.position.clone().sub(target).distanceTo(offset) < 1e-6,
    'moving playback must preserve manual camera adjustment',
  );
  assert.equal(state?.speed, 10);
  assert.equal(state?.paused, false);
  assert.ok(state!.progress > 0 && state!.progress < 0.1);
  assert.ok(
    camera.position.clone().sub(target).distanceTo(offset) < 1e-6,
    'orbit and pan are preserved while following',
  );
  assert.ok(target.x > before.x, 'camera follows the advancing train');
  travel.api.configure({ view: 'onboard' });
  travel.tick(1.2, 301, camera, target, false, false);
  const beforeLooking = state!.progress;
  const straight = target.clone().sub(camera.position).normalize();
  travel.lookAround(0.6, 0.2);
  travel.tick(1, 600, camera, target, false, false);
  const looking = target.clone().sub(camera.position).normalize();
  assert.ok(
    straight.angleTo(looking) > 0.5,
    'onboard look-around survives playback',
  );
  assert.equal(state?.view, 'onboard');
  assert.equal(state?.paused, false);
  assert.ok(state!.progress > beforeLooking);
  travel.dispose();
});
