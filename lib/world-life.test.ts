import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createWorldLife } from './world-life.ts';
import { initialWorldOptions, type WorldFeature } from './world-types.ts';

await test('nearby routes receive moving people and traffic even after distant routes in the extract', () => {
  const features: WorldFeature[] = [];
  for (const kind of ['path', 'road'] as const)
    for (let i = 0; i < 15; i++) {
      const x = i === 14 ? 0 : 10000 + i * 100;
      features.push({
        type: 'Feature',
        id: `synthetic-${kind}-${i}`,
        properties: {
          kind,
          source: 'synthetic',
          highway: kind === 'road' ? 'residential' : 'footway',
        },
        geometry: {
          type: 'LineString',
          coordinates: [
            [x, 0],
            [x, 100],
          ],
        },
      });
    }
  const life = createWorldLife(features, {
    area: 'synthetic',
    project: (x, z) => new THREE.Vector3(x, 0, z),
    elevation: () => 0,
  });
  const camera = new THREE.PerspectiveCamera();
  camera.position.set(0, 100, 50);
  life.update(initialWorldOptions, 0, camera);
  const visible = life.group.children.filter((o) => o.visible);
  assert.equal(visible.length, 2);
  const before = visible.map((o) => o.position.clone());
  life.update(initialWorldOptions, 0.1, camera);
  assert.ok(visible.every((o, i) => o.position.distanceTo(before[i]) > 0.01));
  const paused = visible.map((o) => o.position.clone());
  life.update({ ...initialWorldOptions, worldPaused: true }, 0.2, camera);
  assert.ok(visible.every((o, i) => o.position.equals(paused[i])));
  life.update(
    { ...initialWorldOptions, people: false, vehicles: false },
    0.3,
    camera,
  );
  assert.ok(life.group.children.every((o) => !o.visible));
  life.dispose();
});

await test('activity follows accelerated world time without silently capping the requested speed', () => {
  const life = createWorldLife(
    [
      {
        type: 'Feature',
        id: 'synthetic-speed-route',
        properties: { kind: 'path', source: 'synthetic', highway: 'footway' },
        geometry: {
          type: 'LineString',
          coordinates: [
            [0, 0],
            [0, 100],
          ],
        },
      },
    ],
    {
      area: 'synthetic',
      project: (x, z) => new THREE.Vector3(x, 0, z),
      elevation: () => 0,
    },
  );
  const camera = new THREE.PerspectiveCamera();
  camera.position.set(0, 20, 50);
  life.update(initialWorldOptions, 0, camera);
  const actor = life.group.children[0],
    before = actor.position.clone();
  life.update(initialWorldOptions, 0.4, camera);
  assert.ok(
    Math.abs(Math.abs(actor.position.z - before.z) - 1.15 * 0.4) < 0.001,
  );
  life.dispose();
});
