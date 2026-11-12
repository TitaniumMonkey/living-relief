import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../public/', import.meta.url);
const readAsset = (url) => readFile(new URL(url.slice(1), root));
const manifest = JSON.parse(await readAsset('/world/manifest.json'));
const tiles = [
  ...new Map(
    manifest.areas
      .flatMap((area) => area.tiles)
      .map((tile) => [tile.terrain.url, tile]),
  ).values(),
];
const near = (a, b) => Math.abs(a - b) < 1e-8;

test('world tiles retain native-resolution categories, shared elevations, and seamless material halos', async () => {
  const classes = new Set([10, 20, 30, 40, 50, 60, 70, 80, 90, 95, 100]);
  const grids = new Map();
  for (const tile of tiles) {
    const bytes = await readAsset(tile.terrain.url);
    const grid = new Float32Array(
      bytes.buffer,
      bytes.byteOffset,
      bytes.byteLength / 4,
    );
    assert.equal(grid.length, tile.terrain.n ** 2);
    assert.ok(grid.every(Number.isFinite));
    grids.set(tile.terrain.url, grid);
    const cover = await readAsset(tile.landcover.url);
    assert.equal(cover.length, tile.landcover.n ** 2);
    assert.ok(cover.every((value) => classes.has(value)));
    const meters =
      (tile.bounds[2] - tile.bounds[0]) *
      111320 *
      Math.cos((((tile.bounds[1] + tile.bounds[3]) / 2) * Math.PI) / 180);
    if (tile.grid === 'rail-fringe')
      assert.ok(
        meters / tile.landcover.n > 0 && meters / tile.landcover.n <= 10.03,
      );
    else assert.ok(Math.abs(meters / tile.landcover.n - 10) < 0.03);
    const halo = await readAsset(tile.landcover.haloUrl);
    const haloN = Math.sqrt(halo.length),
      margin = (haloN - tile.landcover.n) / 2;
    assert.equal(margin, 8);
    for (let y = 0; y < tile.landcover.n; y++)
      assert.deepEqual(
        halo.subarray(
          (y + margin) * haloN + margin,
          (y + margin) * haloN + margin + tile.landcover.n,
        ),
        cover.subarray(y * tile.landcover.n, (y + 1) * tile.landcover.n),
      );
  }
  for (const a of tiles)
    for (const b of tiles) {
      if (a === b) continue;
      const ga = grids.get(a.terrain.url),
        gb = grids.get(b.terrain.url),
        n = a.terrain.n;
      if (
        near(a.bounds[2], b.bounds[0]) &&
        near(a.bounds[1], b.bounds[1]) &&
        near(a.bounds[3], b.bounds[3])
      )
        for (let i = 0; i < n; i++) assert.equal(ga[i * n + n - 1], gb[i * n]);
      if (
        near(a.bounds[1], b.bounds[3]) &&
        near(a.bounds[0], b.bounds[0]) &&
        near(a.bounds[2], b.bounds[2])
      )
        for (let i = 0; i < n; i++) assert.equal(ga[(n - 1) * n + i], gb[i]);
      const overlapWidth =
        Math.min(a.bounds[2], b.bounds[2]) - Math.max(a.bounds[0], b.bounds[0]);
      const overlapHeight =
        Math.min(a.bounds[3], b.bounds[3]) - Math.max(a.bounds[1], b.bounds[1]);
      assert.ok(
        overlapWidth < 1e-8 || overlapHeight < 1e-8,
        'unique terrain tiles must not overlap',
      );
    }
});

test('expanded manifest keeps local provenance, shared tiles, and uniquely assigned geographic objects', async () => {
  for (const required of [
    'urubamba',
    'machu',
    'cusco',
    'maras',
    'chinchero',
    'ollanta',
    'pisac',
    'rail-corridor',
  ])
    assert.ok(
      manifest.areas.some((area) => area.id === required),
      `missing ${required}`,
    );
  for (const name of [
    'Mapzen Terrain Tiles / USGS and NOAA',
    'ESA WorldCover 2021 v200',
    'OpenStreetMap / Geofabrik Peru extract',
    'Microsoft Global ML Building Footprints',
    'Meta and WRI CHMv2',
    'Railway corridor processing and coverage',
  ])
    assert.ok(manifest.sources.some((source) => source.name === name));
  const ids = new Set();
  for (const tile of tiles) {
    assert.ok(tile.features.startsWith('/world/'));
    const collection = JSON.parse(await readAsset(tile.features));
    for (const feature of collection.features) {
      assert.ok(
        ['osm', 'microsoft', 'chmv2'].includes(feature.properties.source),
      );
      if (feature.properties.height !== undefined)
        assert.ok(feature.properties.height > 0);
      if (['building', 'tree', 'ruin'].includes(feature.properties.kind)) {
        assert.ok(
          !ids.has(feature.id),
          `duplicate assigned feature ${feature.id}`,
        );
        ids.add(feature.id);
      }
      if (feature.properties.source === 'chmv2') {
        assert.equal(feature.properties.kind, 'tree');
        assert.equal(feature.properties.inferred, true);
      }
      if (feature.surfaceGrid) {
        assert.equal(feature.surfaceGrid.indices.length % 3, 0);
        assert.ok(feature.surfaceGrid.vertices.flat().every(Number.isFinite));
        assert.ok(
          feature.surfaceGrid.indices.every(
            (i) =>
              Number.isInteger(i) &&
              i >= 0 &&
              i < feature.surfaceGrid.vertices.length,
          ),
        );
      }
    }
  }
  assert.ok(ids.size > 1000);
});
