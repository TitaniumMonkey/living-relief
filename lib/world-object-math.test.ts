import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  foundation,
  buildingHeight,
  insideRing,
  canDrive,
  routePosition,
  supportsPitchedRoof,
  grazingSlope,
  terraceSection,
} from './world-object-math.ts';

await test('a flat building foundation meets the highest sampled ground and embeds its base below every corner', () => {
  const result = foundation([2120, 2124, 2122, 2121], 7);
  assert.equal(result.base, 2124);
  assert.equal(result.bottom, 2119.6);
  assert.equal(result.top, 2131);
  assert.equal(buildingHeight({ height: 11, levels: 2 }), 11);
  assert.equal(buildingHeight({ levels: 3 }), 9);
  assert.equal(buildingHeight({}), 6);
});
await test('activity stays on mapped road classes and sanctuary vehicles remain excluded', () => {
  assert.equal(canDrive('residential', 'urubamba'), true);
  assert.equal(canDrive('footway', 'urubamba'), false);
  assert.equal(canDrive('path', 'urubamba'), false);
  assert.equal(canDrive('service', 'machu'), false);
  assert.equal(canDrive(undefined, 'urubamba'), false);
});
await test('polyline actors follow segment geometry instead of cutting through corners', () => {
  const route = [
    [0, 0],
    [1, 0],
    [1, 1],
  ] as [number, number][];
  assert.deepEqual(routePosition(route, [0, 100, 200], 50), [0.5, 0]);
  assert.deepEqual(routePosition(route, [0, 100, 200], 150), [1, 0.5]);
  assert.deepEqual(routePosition(route, [0, 100, 200], 200), [1, 1]);
  const field = [
    [0, 0],
    [2, 0],
    [2, 2],
    [0, 2],
    [0, 0],
  ] as [number, number][];
  assert.equal(insideRing([1, 1], field), true);
  assert.equal(insideRing([3, 1], field), false);
});

await test('concave roofs preserve the source footprint instead of using a centroid fan', () => {
  const lShape: [number, number][] = [
    [0, 0],
    [3, 0],
    [3, 1],
    [1, 1],
    [1, 3],
    [0, 3],
    [0, 0],
  ];
  assert.equal(supportsPitchedRoof(lShape), false);
  assert.equal(
    supportsPitchedRoof([
      [0, 0],
      [3, 0],
      [3, 2],
      [0, 2],
      [0, 0],
    ]),
    true,
  );
  assert.equal(
    supportsPitchedRoof([
      [0, 0],
      [3, 0],
      [1, 1],
      [0, 3],
      [0, 0],
    ]),
    false,
  );
});

await test('grazing slope distinguishes a gentle mapped field from a steep field edge', () => {
  assert.ok(grazingSlope([0, 100, 0], [1, 100.1, 0], [0, 100.1, 1]) < 0.45);
  assert.ok(grazingSlope([0, 100, 0], [1, 101, 0], [0, 100, 1]) > 0.45);
});

await test('illustrative terrace treads stay on the terrain-upslope side of the mapped wall', () => {
  const section = terraceSection(
    [0, 100, 0],
    [6, 100, 0],
    (_x, z) => 100 + z * 0.2,
    1.6,
  );
  assert.equal(section.frontA[0], 0);
  assert.equal(section.frontB[0], 6);
  assert.ok(section.frontA[2] > 0 && section.backA[2] > section.frontA[2]);
  assert.equal(section.frontA[1], 101.6);
  assert.equal(section.groundA[1], 100 + section.groundA[2] * 0.2);
  assert.equal(
    Math.round((section.backA[2] - section.frontA[2]) * 10) / 10,
    2.4,
  );
  const reversed = terraceSection(
    [6, 100, 0],
    [0, 100, 0],
    (_x, z) => 100 + z * 0.2,
    1.6,
  );
  assert.ok(
    reversed.backA[2] > 0,
    'upslope side does not depend on OSM line direction',
  );
});
