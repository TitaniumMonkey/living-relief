import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sampleGrid, distanceKm } from './geo.ts';
import { readFile } from 'node:fs/promises';
await test('north-west to south-east grid retains orientation and interpolates elevations', () => {
  const h = new Float32Array([100, 200, 300, 400]);
  const bounds = [-2, -1, 2, 1];
  assert.equal(sampleGrid(h, 2, bounds, -2, 1), 100);
  assert.equal(sampleGrid(h, 2, bounds, 2, -1), 400);
  assert.equal(sampleGrid(h, 2, bounds, 0, 0), 250);
  assert.equal(sampleGrid(h, 2, bounds, -1, 0.5), 175);
});
await test('geographic distances use kilometres, including across the date line', () => {
  assert.ok(
    Math.abs(distanceKm({ lat: 0, lon: 0 }, { lat: 0, lon: 1 }) - 111.195) <
      0.01,
  );
  assert.ok(
    Math.abs(distanceKm({ lat: 0, lon: 179 }, { lat: 0, lon: -179 }) - 222.39) <
      0.02,
  );
});
await test('bundled terrain is complete, finite, and metadata matches actual elevations', async () => {
  for (const id of ['valley', 'machu', 'utah', 'tristan']) {
    const m = JSON.parse(await readFile(`public/terrain/${id}.json`, 'utf8'));
    const bytes = await readFile(`public/terrain/${id}.bin`);
    const heights = new Float32Array(
      bytes.buffer,
      bytes.byteOffset,
      bytes.byteLength / 4,
    );
    assert.equal(heights.length, m.n * m.n);
    assert.ok(heights.every(Number.isFinite));
    let minimum = Infinity,
      maximum = -Infinity;
    for (const h of heights) {
      minimum = Math.min(minimum, h);
      maximum = Math.max(maximum, h);
    }
    assert.equal(minimum, m.min);
    assert.equal(maximum, m.max);
  }
  const m = JSON.parse(await readFile('public/terrain/valley.json', 'utf8'));
  const b = await readFile('public/terrain/valley.bin');
  const h = new Float32Array(b.buffer, b.byteOffset, b.byteLength / 4);
  const cusco = sampleGrid(h, m.n, m.bounds, -71.978694, -13.516689);
  const urubamba = sampleGrid(h, m.n, m.bounds, -72.116, -13.305);
  assert.ok(cusco > 3200 && cusco < 3700, `Cusco sample ${cusco}`);
  assert.ok(urubamba > 2700 && urubamba < 3100, `Urubamba sample ${urubamba}`);
  assert.ok(cusco > urubamba, 'Cusco must sit above Urubamba');
});
