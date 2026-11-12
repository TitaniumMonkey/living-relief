import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createAirportSurface } from './world-airport.ts';

await test('runway width and upward faces follow sampled terrain across a slope', () => {
  const terrain = (x: number, z: number) => x * 0.05 + z * 0.025;
  const surface = createAirportSurface(
    {
      type: 'Feature',
      id: 'way/123',
      geometry: {
        type: 'LineString',
        coordinates: [
          [0, 50],
          [100, 50],
        ],
      },
      properties: {
        kind: 'aeroway',
        source: 'osm',
        aeroway: 'runway',
        width: 40,
      },
    },
    {
      area: 'synthetic',
      bounds: [0, 0, 100, 100],
      project: (lon, lat) => new THREE.Vector3(lon, terrain(lon, -lat), -lat),
      elevation: (lon, lat) => terrain(lon, -lat),
    },
  );
  const mesh = surface.mesh as THREE.Mesh;
  const positions = mesh.geometry.getAttribute('position');
  const normals = mesh.geometry.getAttribute('normal');
  let minZ = Infinity,
    maxZ = -Infinity;
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i),
      y = positions.getY(i),
      z = positions.getZ(i);
    minZ = Math.min(minZ, z);
    maxZ = Math.max(maxZ, z);
    assert.ok(y - terrain(x, z) >= 0.159 && y - terrain(x, z) <= 0.191);
    assert.ok(normals.getY(i) > 0.99);
  }
  assert.equal(maxZ - minZ, 40);
  surface.dispose();
});
