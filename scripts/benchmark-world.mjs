// CPU and geometry storage only; no WebGL or frame-rate claim. An optional
// module path compares a saved source snapshot against the same local assets.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import * as THREE from 'three';
import { initialWorldOptions } from '../lib/world-types.ts';

const { createWorldObjects, createWorldObjectsAsync } = await import(
  pathToFileURL(path.resolve(process.argv[2] ?? 'lib/world-objects.ts')).href
);
const features = JSON.parse(
  fs.readFileSync('public/world/grid/g8_13-features.json'),
).features;
const context = {
  area: 'cusco',
  project: (lon, lat) =>
    new THREE.Vector3((lon + 71.98) * 108000, 0, -(lat + 13.52) * 111000),
  elevation: () => 3400,
};
const geometryBytes = (geometry) =>
  Object.values(geometry.attributes).reduce(
    (sum, attribute) => sum + attribute.array.byteLength,
    geometry.index?.array.byteLength ?? 0,
  );
const builds = [];
for (let run = 0; run < 4; run++) {
  globalThis.gc?.();
  let last = performance.now(),
    maxGap = 0;
  const timer = setInterval(() => {
    const now = performance.now();
    maxGap = Math.max(maxGap, now - last);
    last = now;
  }, 1);
  const start = performance.now();
  const objects = await createWorldObjectsAsync(
    features,
    context,
    new AbortController().signal,
  );
  clearInterval(timer);
  const buildMs = performance.now() - start;
  let vertices = 0,
    triangles = 0,
    bytes = 0,
    windowBytes = 0;
  objects.group.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    const geometry = object.geometry;
    vertices += geometry.attributes.position.count;
    triangles +=
      (geometry.index?.count ?? geometry.attributes.position.count) / 3;
    bytes += geometryBytes(geometry);
    if (
      object.material instanceof THREE.MeshStandardMaterial &&
      object.material.emissive.getHexString() === 'ffc66d'
    )
      windowBytes += geometryBytes(geometry);
  });
  if (run > 0)
    builds.push({ buildMs, maxGap, vertices, triangles, bytes, windowBytes });
  objects.dispose();
}

const objects = [];
for (let x = -2; x <= 2; x++)
  for (let z = -2; z <= 2; z++)
    objects.push(
      createWorldObjects([], {
        area: 'synthetic',
        bounds: [x * 0.02, z * 0.02, (x + 1) * 0.02, (z + 1) * 0.02],
        landcover: () => 30,
        project: (lon, lat) =>
          new THREE.Vector3(lon * 100000, 0, -lat * 100000),
        elevation: () => 0,
      }),
    );
const camera = new THREE.PerspectiveCamera();
camera.position.set(400, 20, -500);
const updates = [];
let instances = 0;
for (let i = 0; i < 100; i++) {
  camera.position.x += 16;
  const start = performance.now();
  for (const object of objects)
    object.update(initialWorldOptions, i / 60, camera);
  updates.push(performance.now() - start);
  for (const object of objects)
    instances += object.group.getObjectByName('WorldCover grass').count;
}
for (const object of objects) object.dispose();
builds.sort((a, b) => a.buildMs - b.buildMs);
updates.sort((a, b) => a - b);
console.log(
  JSON.stringify(
    {
      node: process.version,
      city: {
        features: features.length,
        runs: builds.length,
        median: builds[1],
      },
      groundcover: {
        tiles: 25,
        updates: 100,
        medianMs: updates[50],
        p95Ms: updates[95],
        instances,
      },
    },
    null,
    2,
  ),
);
