import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createRailway } from './railway.ts';
import { createTrainModel } from './train-model.ts';
import type { TravelLeg } from './travel.ts';

await test('tracks use narrow gauge, stay bounded, refresh terrain and exclude road and tunnel segments', () => {
  let height = 5;
  const railway = createRailway(
    (x, z, lift = 0) => new THREE.Vector3(x, height + lift, z),
  );
  const leg: TravelLeg = {
    mode: 'train',
    coordinates: [
      [0, 0],
      [1000, 0],
      [2000, 0],
    ],
    cumulative: [0, 1000, 2000],
    distance: 2000,
    tunnels: [false, false, true],
    startGap: 0,
    endGap: 0,
  };
  railway.update(leg, 500);
  const rails = railway.group.getObjectByName(
    'Steel rails',
  ) as THREE.InstancedMesh;
  const ties = railway.group.getObjectByName('Sleepers') as THREE.InstancedMesh;
  assert.ok(ties.count > 500 && ties.count <= 1200);
  const a = new THREE.Matrix4(),
    b = new THREE.Matrix4();
  rails.getMatrixAt(0, a);
  rails.getMatrixAt(1, b);
  assert.ok(
    Math.abs(
      new THREE.Vector3()
        .setFromMatrixPosition(a)
        .distanceTo(new THREE.Vector3().setFromMatrixPosition(b)) - 0.979,
    ) < 0.001,
  );
  height = 8;
  railway.update(leg, 500, true);
  rails.getMatrixAt(0, b);
  assert.ok(Math.abs(b.elements[13] - a.elements[13] - 3) < 0.001);
  railway.update(leg, 1600);
  assert.equal(rails.count, 0);
  railway.update({ ...leg, mode: 'drive' }, 500);
  assert.equal(railway.group.visible, false);
  railway.dispose();
});
await test('train has a distinct locomotive and long coaches with finite batched geometry', () => {
  const model = createTrainModel();
  assert.equal(model.units.length, 4);
  assert.match(model.units[0].group.name, /locomotive/);
  for (const unit of model.units) {
    assert.ok(
      unit.group.children.length <= 8,
      'draw calls are batched by material',
    );
    const bounds = new THREE.Box3().setFromObject(unit.group),
      size = bounds.getSize(new THREE.Vector3());
    assert.ok(size.x > 2.5 && size.x < 3);
    assert.ok(size.y > 3.5 && size.y < 4.5);
    assert.ok(size.z > 12 && size.z < 20);
    unit.group.traverse((o) => {
      if (o instanceof THREE.Mesh)
        assert.ok(o.geometry.attributes.position.array.every(Number.isFinite));
    });
  }
  model.dispose();
});
