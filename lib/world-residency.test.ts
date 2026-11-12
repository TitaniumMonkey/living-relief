import { test } from 'node:test';
import assert from 'node:assert/strict';
import { keepTileObjects } from './world-math.ts';

await test('city tiles around the camera survive looking toward a distant target', () => {
  assert.equal(keepTileObjects(5000, 500, 6000, false, true), true);
  assert.equal(keepTileObjects(4500, 4500, 2000, false, false), true);
});
await test('loaded city tiles remain across the load boundary but release after leaving', () => {
  assert.equal(keepTileObjects(5800, 5800, 3000, false, true), true);
  assert.equal(keepTileObjects(5800, 5800, 3000, false, false), false);
  assert.equal(keepTileObjects(12000, 12000, 3000, false, true), false);
});
