import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sampleTiles, globalPixel, extrema } from './terrain-grid.mjs';
test('bilinear Terrarium extraction crosses both horizontal and vertical tile edges', () => {
  const tiles = new Map();
  for (let ty = 0; ty < 2; ty++)
    for (let tx = 0; tx < 2; tx++) {
      const data = new Uint8Array(16);
      for (let y = 0; y < 2; y++)
        for (let x = 0; x < 2; x++) {
          const height = (tx * 2 + x) * 100 + (ty * 2 + y) * 10;
          const encoded = height + 32768,
            i = (y * 2 + x) * 4;
          data[i] = Math.floor(encoded / 256);
          data[i + 1] = encoded % 256;
          data[i + 3] = 255;
        }
      tiles.set(`${tx}/${ty}`, { data });
    }
  assert.equal(sampleTiles(tiles, 1.5, 1.5, 2), 165);
  assert.equal(sampleTiles(tiles, 1.25, 1.75, 2), 142.5);
  assert.equal(sampleTiles(tiles, 0, 0, 2), 0);
});
test('global pixels account for cell centres and dense extrema do not spread arrays', () => {
  assert.deepEqual(globalPixel(0, 0, 1), [255.5, 255.5]);
  const values = new Float32Array(1025 ** 2);
  values[0] = -4;
  values[values.length - 1] = 6100;
  assert.deepEqual(extrema(values), { min: -4, max: 6100 });
});
