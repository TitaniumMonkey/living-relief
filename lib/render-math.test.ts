import assert from 'node:assert/strict';
import test from 'node:test';
import {
  sampleSurface,
  labelOverlapsUI,
  surfaceNormal,
  geographicPoint,
  insideBounds,
} from './render-math.ts';

void test('source-grid normals retain east and south slopes with correct orientation', () => {
  const grid = new Float32Array([0, 1, 2, 2, 3, 4, 4, 5, 6]);
  const normal = surfaceNormal(grid, 3, 1, 1, 2, 2, 1);
  const length = Math.sqrt(6);
  assert.ok(Math.abs(normal[0] + 1 / length) < 1e-6);
  assert.ok(Math.abs(normal[1] - 1 / length) < 1e-6);
  assert.ok(Math.abs(normal[2] + 2 / length) < 1e-6);
  assert.deepEqual(
    surfaceNormal(new Float32Array(9), 3, 0, 0, 2, 2, 1),
    [-0, 1, -0],
  );
});

void test('draped overlays follow actual mesh triangles rather than bilinear heights', () => {
  const saddle = new Float32Array([0, 0, 0, 100]);
  const bounds = [0, 0, 1, 1];
  assert.equal(sampleSurface(saddle, 2, bounds, 0.75, 0.25), 50);
  assert.equal(sampleSurface(saddle, 2, bounds, 0.25, 0.75), 0);
  assert.equal(sampleSurface(saddle, 2, bounds, 1, 0), 100);
  assert.equal(sampleSurface(saddle, 2, bounds, 0.5, 0.5), 0);
});

void test('overlays use the same west-east and north-south frame as terrain', () => {
  const bounds = [-4, -2, 4, 2];
  assert.deepEqual(geographicPoint(bounds, -4, 2, 12, 6), [-6, -3]);
  assert.deepEqual(geographicPoint(bounds, 4, -2, 12, 6), [6, 3]);
  assert.deepEqual(geographicPoint(bounds, 0, 0, 12, 6), [0, 0]);
  assert.equal(insideBounds(bounds, 0, 0), true);
  assert.equal(insideBounds(bounds, 5, 0), false);
});

void test('map labels cannot overlap heading or card rectangles at their translated screen anchor', () => {
  const panels = [{ left: 20, top: 20, right: 300, bottom: 160 }];
  assert.equal(labelOverlapsUI(150, 175, 80, 25, panels), true);
  assert.equal(labelOverlapsUI(150, 220, 80, 25, panels), false);
  assert.equal(labelOverlapsUI(340, 100, 80, 25, panels), true);
});
