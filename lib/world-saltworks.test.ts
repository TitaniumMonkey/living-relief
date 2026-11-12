import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createSaltworks } from './world-saltworks.ts';
import type { WorldFeature } from './world-types.ts';

await test('salt basins have level pools, raised rims and foundations anchored on sloping terrain', () => {
  const rectangle = (x: number, inset = 0): [number, number][][] => [
    [
      [x + inset, inset],
      [x + 7 - inset, inset],
      [x + 7 - inset, 5 - inset],
      [x + inset, 5 - inset],
      [x + inset, inset],
    ],
  ];
  const basins: NonNullable<WorldFeature['inferredBasins']> = [0, 8].map(
    (x) => ({
      footprint: rectangle(x),
      pools: [rectangle(x, 0.24)],
      rims: [[rectangle(x)[0], rectangle(x, 0.24)[0]]],
    }),
  );
  const terrain = (lon: number, lat: number) => lon * 0.2 - lat * 0.1;
  const site = createSaltworks(basins, {
    area: 'synthetic',
    project: (lon, lat) => new THREE.Vector3(lon, terrain(lon, lat), -lat),
    elevation: (lon, lat) => 2000 + terrain(lon, lat),
  });
  const pools = site.mesh.getObjectByName(
    'Salt evaporation basins',
  ) as THREE.Mesh;
  const positions = pools.geometry.getAttribute('position');
  const levels = new Set(
    Array.from({ length: positions.count }, (_, i) =>
      positions.getY(i).toFixed(2),
    ),
  );
  assert.deepEqual([...levels], ['1.56', '3.16']);
  const normals = pools.geometry.getAttribute('normal');
  assert.ok(
    Array.from({ length: normals.count }, (_, i) => normals.getY(i)).every(
      (y) => y > 0.99,
    ),
  );
  assert.ok(Math.abs(site.heightAt(3, 2) - 2001.72) < 0.001);
  assert.equal(site.heightAt(30, 30), 2003);
  const walls = site.mesh.getObjectByName(
    'Salt-crusted retaining walls',
  ) as THREE.Mesh;
  const wallPositions = walls.geometry.getAttribute('position');
  let anchored = 0;
  for (let i = 0; i < wallPositions.count; i++) {
    const ground = terrain(wallPositions.getX(i), -wallPositions.getZ(i));
    assert.ok(wallPositions.getY(i) >= ground - 0.081);
    if (Math.abs(wallPositions.getY(i) - ground + 0.08) < 0.001) anchored++;
  }
  assert.ok(anchored >= 24);
  let disposed = 0;
  site.mesh.traverse((object) => {
    if (object instanceof THREE.Mesh)
      object.geometry.addEventListener('dispose', () => disposed++);
  });
  site.dispose();
  assert.equal(disposed, 2);
});
