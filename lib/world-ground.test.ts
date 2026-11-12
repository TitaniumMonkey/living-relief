import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGroundPatch } from './world-ground.ts';
import { exposedTileEdges, worldProjection } from './world-math.ts';
import type { GeoBounds } from './layers.ts';

await test('nonaligned tile edges match the regional displayed boundary at every detail level', () => {
  const previous = globalThis.document;
  globalThis.document = {
    createElement: () => ({
      getContext: () => ({
        fillRect() {},
        getImageData: () => ({ data: new Uint8Array(16) }),
      }),
    }),
  } as unknown as Document;
  const bounds: GeoBounds = [0, 0, 4, 4];
  const a: GeoBounds = [0, 0, 2, 2];
  const b: GeoBounds = [2, 0.45, 4, 2.45];
  const partitions = [a, b];
  const common = {
    cover: new Uint8Array(4).fill(30),
    coverN: 2,
    origin: worldProjection(bounds),
    baseline: 0,
    waterFeatures: [],
    waterResolution: 2,
  };
  const coarseHeights = Float32Array.from(
    { length: 81 },
    (_, i) => 400 + Math.sin(i * 1.8) * 200,
  );
  const coarse = createGroundPatch(
    { ...common, bounds, heights: coarseHeights, n: 9, partitions },
    9,
  );
  const source = new Float32Array(129 * 129).fill(600);
  try {
    for (const resolution of [33, 65, 129]) {
      const patch = (tile: GeoBounds) =>
        createGroundPatch(
          {
            ...common,
            bounds: tile,
            heights: source,
            n: 129,
            regionalSample: (lon, lat) => coarse.surface(lon, lat),
            regionalGrid: coarse.surfaceGrid(),
            outerEdges: exposedTileEdges(tile, partitions),
          },
          resolution,
        );
      const left = patch(a),
        right = patch(b);
      try {
        for (let i = 0; i <= 500; i++) {
          const lat = 0.45 + (1.55 * i) / 500;
          assert.ok(
            Math.abs(left.surface(2, lat) - right.surface(2, lat)) < 0.001,
          );
          assert.ok(
            Math.abs(left.surface(2, lat) - coarse.surface(2, lat)) < 0.001,
          );
        }
      } finally {
        left.dispose();
        right.dispose();
      }
    }
    assert.ok(source.every((height) => height === 600));
  } finally {
    coarse.dispose();
    globalThis.document = previous;
  }
});
