import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createPassengerCabin } from './train-cabin.ts';

await test('passenger cabin leaves the window and panoramic roof open from the seated view', () => {
  const cabin = createPassengerCabin(),
    eye = new THREE.Vector3(-0.65, 2.95, 4.2);
  cabin.group.updateMatrixWorld(true);
  for (const direction of [
    [1, 0, 0.65],
    [1, 0.2, 0.65],
    [1, -0.2, 0.65],
    [1, 0, 0.25],
    [0.2, 1, 0.45],
  ]) {
    const ray = new THREE.Raycaster(
      eye,
      new THREE.Vector3(...direction).normalize(),
      0,
      12,
    );
    assert.equal(
      ray.intersectObject(cabin.group, true).length,
      0,
      `landscape sightline ${direction.join(', ')} stays open`,
    );
  }
  const tableRay = new THREE.Raycaster(
    eye,
    new THREE.Vector3(0.8, 2.08, 4.9).sub(eye).normalize(),
    0,
    2,
  );
  assert.ok(
    tableRay.intersectObject(cabin.group, true).length > 0,
    'the table grounds the view below the landscape',
  );
  cabin.dispose();
});

await test('passenger cabin fits the coach, batches its detail and releases GPU resources', () => {
  const cabin = createPassengerCabin(),
    meshes: THREE.Mesh[] = [];
  cabin.group.traverse((object) => {
    if (object instanceof THREE.Mesh) meshes.push(object);
  });
  assert.ok(meshes.length <= 8, 'the complete cabin uses at most eight draws');
  const triangles = meshes.reduce(
    (count, mesh) => count + mesh.geometry.getAttribute('position').count / 3,
    0,
  );
  assert.ok(
    triangles < 12000,
    'interior detail stays within its geometry budget',
  );
  const bounds = new THREE.Box3().setFromObject(cabin.group);
  assert.ok(bounds.min.x >= -1.3 && bounds.max.x <= 1.3);
  assert.ok(bounds.min.y >= 1.15 && bounds.max.y <= 4.05);
  assert.ok(bounds.min.z >= -8.7 && bounds.max.z <= 8.7);
  let disposedGeometries = 0,
    disposedMaterials = 0;
  const materials = new Set<THREE.Material>();
  for (const mesh of meshes) {
    mesh.geometry.addEventListener('dispose', () => disposedGeometries++);
    for (const material of Array.isArray(mesh.material)
      ? mesh.material
      : [mesh.material])
      materials.add(material);
  }
  for (const material of materials)
    material.addEventListener('dispose', () => disposedMaterials++);
  cabin.dispose();
  assert.equal(disposedGeometries, meshes.length);
  assert.equal(disposedMaterials, materials.size);
  assert.equal(cabin.group.children.length, 0);
});
