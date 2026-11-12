import test from 'node:test';
import assert from 'node:assert/strict';
import {
  worldProjection,
  cameraClearance,
  tileDistance,
  coverPixels,
  sampleRectilinearSurface,
  geographicPixel,
  exposedTileEdges,
} from './world-math.ts';

void test('adjacent detailed tiles retain source elevations across internal edges', () => {
  const tile = [0, 0, 1, 1];
  assert.deepEqual(
    exposedTileEdges(tile, [
      [1, 0, 2, 1],
      [0, 1, 1, 2],
    ]),
    {
      west: true,
      east: false,
      north: false,
      south: true,
    },
  );
  assert.deepEqual(exposedTileEdges(tile, []), {
    west: true,
    east: true,
    north: true,
    south: true,
  });
  assert.equal(exposedTileEdges(tile, [[1, 1, 2, 2]]).east, true);
});
import { sampleGrid } from './geo.ts';

void test('region-centred metres retain east and south orientation and geographic round trips', () => {
  const projection = worldProjection([-2, -1, 2, 1]);
  const westNorth = projection.project(-1, 0.5);
  const eastSouth = projection.project(1, -0.5);
  assert.equal(eastSouth[0] - westNorth[0], 222640);
  assert.equal(eastSouth[1] - westNorth[1], 111320);
  assert.deepEqual(projection.geographic(...westNorth), [-1, 0.5]);
  assert.deepEqual(projection.geographic(...eastSouth), [1, -0.5]);
  assert.equal(tileDistance(2, 2, 0, 0, 1, 1), Math.SQRT2);
  assert.equal(tileDistance(0.5, 0.5, 0, 0, 1, 1), 0);
});

void test('low aerial camera clears terrain and structures without changing source measurement', () => {
  const heights = new Float32Array([100, 120, 140, 160]);
  const value = sampleGrid(heights, 2, [0, 0, 1, 1], 0.5, 0.5);
  assert.equal(value, 130);
  assert.equal(cameraClearance(140, value, 155), 185);
  assert.equal(cameraClearance(300, value, 155), 300);
  assert.equal(sampleGrid(heights, 2, [0, 0, 1, 1], 0.5, 0.5), value);
});

void test('natural ground softens boundaries while classification preserves source categories', () => {
  const classes = new Uint8Array([10, 10, 40, 10, 40, 40, 10, 40, 40]);
  const before = classes.slice();
  const natural = coverPixels(classes, 3);
  const classification = coverPixels(classes, 3, true);
  assert.notEqual(natural[4], natural[8]);
  assert.equal(classification[0], classification[4]);
  assert.notEqual(classification[4], classification[8]);
  assert.deepEqual(classes, before);
});

void test('terrain anchors follow actual triangles on an irregular tile seam grid', () => {
  const xs = [0, 0.25, 1],
    ys = [1, 0.5, 0];
  const elevations = new Float32Array([0, 0, 0, 0, 100, 0, 0, 0, 0]);
  assert.equal(sampleRectilinearSurface(xs, ys, elevations, 0.25, 0.5), 100);
  assert.equal(sampleRectilinearSurface(xs, ys, elevations, 0.125, 0.75), 0);
  assert.equal(sampleRectilinearSurface(xs, ys, elevations, 0.625, 0.25), 0);
});

void test('draped water masks align north-west, south-east and adjacent tile edges', () => {
  const westTile = [0, 0, 1, 1],
    eastTile = [1, 0, 2, 1];
  assert.deepEqual(geographicPixel(westTile, 1024, 0, 1), [0, 0]);
  assert.deepEqual(geographicPixel(westTile, 1024, 1, 0), [1024, 1024]);
  assert.deepEqual(geographicPixel(westTile, 1024, 1, 0.25), [1024, 768]);
  assert.deepEqual(geographicPixel(eastTile, 1024, 1, 0.25), [0, 768]);
});
