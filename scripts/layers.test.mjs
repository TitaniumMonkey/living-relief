import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const readJSON = async (path) =>
  JSON.parse(await readFile(`public${path}`, 'utf8'));
function positions(coordinates) {
  return typeof coordinates[0] === 'number'
    ? [coordinates]
    : coordinates.flatMap(positions);
}
test('offline land-cover cells share the DEM bounds, contain only ESA classes and cross the source tile seam without gaps', async () => {
  for (const id of ['valley', 'machu']) {
    const manifest = await readJSON(`/layers/${id}.json`);
    const terrain = await readJSON(`/terrain/${id}.json`);
    const meta = await readJSON(manifest.landcover);
    const bytes = await readFile(`public${meta.dataUrl}`);
    assert.deepEqual(meta.bounds, terrain.bounds);
    assert.equal(meta.year, 2021);
    assert.equal(bytes.length, meta.n ** 2);
    const valid = new Set(meta.classes.map(({ value }) => value));
    assert.ok(
      bytes.every((value) => valid.has(value)),
      `${id}: uncovered or invalid categorical cells`,
    );
    assert.ok(
      new Set(bytes).size > 4,
      `${id}: categorical diversity must survive resampling`,
    );
  }
});
test('clipped water and settlement geometry stays inside its DEM footprint and retains source provenance', async () => {
  for (const id of ['valley', 'machu']) {
    const manifest = await readJSON(`/layers/${id}.json`);
    const terrain = await readJSON(`/terrain/${id}.json`);
    const collection = await readJSON(manifest.features);
    const original = await readJSON(manifest.sourceExtract);
    const originalIds = new Set(original.features.map(({ id }) => id));
    const [west, south, east, north] = terrain.bounds;
    assert.ok(collection.features.some((f) => f.properties.kind === 'river'));
    assert.ok(
      collection.features.some((f) => f.properties.kind === 'settlement'),
    );
    for (const feature of collection.features) {
      assert.ok(
        originalIds.has(feature.id),
        'Rendered geometry requires a corresponding original source',
      );
      for (const [lon, lat] of positions(feature.geometry.coordinates)) {
        assert.ok(
          lon >= west - 1e-8 &&
            lon <= east + 1e-8 &&
            lat >= south - 1e-8 &&
            lat <= north + 1e-8,
          `${feature.id}: coordinate outside terrain bounds`,
        );
      }
    }
  }
});
