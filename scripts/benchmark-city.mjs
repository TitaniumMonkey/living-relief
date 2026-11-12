// CPU construction benchmark only: flat projection isolates geometry work from terrain sampling.
import fs from 'node:fs';
import * as THREE from 'three';
import { createWorldObjectsAsync } from '../lib/world-objects.ts';
const features = JSON.parse(
  fs.readFileSync('public/world/grid/g8_13-features.json'),
).features;
const context = {
  area: 'cusco',
  project: (lon, lat) =>
    new THREE.Vector3((lon + 71.98) * 108000, 0, -(lat + 13.52) * 111000),
  elevation: () => 3400,
};
let last = performance.now(),
  maxGap = 0,
  turns = 0;
const timer = setInterval(() => {
  const now = performance.now();
  maxGap = Math.max(maxGap, now - last);
  last = now;
  turns++;
}, 1);
const start = performance.now();
try {
  const objects = await createWorldObjectsAsync(
    features,
    context,
    new AbortController().signal,
  );
  let vertices = 0;
  objects.group.traverse((object) => {
    if (object instanceof THREE.Mesh)
      vertices += object.geometry.attributes.position.count;
  });
  console.log(
    JSON.stringify(
      {
        features: features.length,
        buildMs: Math.round(performance.now() - start),
        maxEventLoopGapMs: Math.round(maxGap),
        inputTurns: turns,
        vertices,
      },
      null,
      2,
    ),
  );
  objects.dispose();
} finally {
  clearInterval(timer);
}
