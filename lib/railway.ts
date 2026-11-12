import * as THREE from 'three';
import { sampleLeg, type TravelLeg } from './travel.ts';

/** A bounded pool of 914 mm track follows mapped rail legs, excluding tunnels. */
export function createRailway(
  point: (lon: number, lat: number, lift?: number) => THREE.Vector3,
) {
  const group = new THREE.Group();
  group.name = 'Mapped railway tracks';
  const rail = new THREE.InstancedMesh(
    new THREE.BoxGeometry(0.065, 0.12, 1),
    new THREE.MeshStandardMaterial({
      color: '#767b7c',
      metalness: 0.8,
      roughness: 0.36,
    }),
    520,
  );
  const ties = new THREE.InstancedMesh(
    new THREE.BoxGeometry(1.8, 0.14, 0.22),
    new THREE.MeshStandardMaterial({ color: '#51473c', roughness: 0.96 }),
    1200,
  );
  const ballast = new THREE.InstancedMesh(
    new THREE.BoxGeometry(2.6, 0.1, 1),
    new THREE.MeshStandardMaterial({ color: '#777365', roughness: 1 }),
    260,
  );
  rail.name = 'Steel rails';
  ties.name = 'Sleepers';
  ballast.name = 'Ballast';
  group.add(ballast, ties, rail);
  const transform = new THREE.Object3D();
  let previousLeg: TravelLeg | undefined,
    previousBucket = -1;
  function place(
    mesh: THREE.InstancedMesh,
    index: number,
    p: THREE.Vector3,
    d: THREE.Vector3,
    length = 1,
  ) {
    transform.position.copy(p);
    transform.quaternion.setFromUnitVectors(
      new THREE.Vector3(0, 0, 1),
      d.clone().normalize(),
    );
    transform.scale.set(1, 1, length);
    transform.updateMatrix();
    mesh.setMatrixAt(index, transform.matrix);
  }
  return {
    group,
    update(leg: TravelLeg, offset: number, force = false) {
      group.visible = leg.mode === 'train';
      if (!group.visible) return;
      const bucket = Math.floor(offset / 40);
      if (!force && leg === previousLeg && bucket === previousBucket) return;
      previousLeg = leg;
      previousBucket = bucket;
      const start = Math.max(0, bucket * 40 - 500),
        end = Math.min(leg.distance, bucket * 40 + 500);
      let rails = 0,
        sleepers = 0,
        beds = 0;
      for (let d = Math.ceil(start / 4) * 4; d < end; d += 4) {
        const next = Math.min(d + 4, leg.distance),
          a = sampleLeg(leg, d),
          b = sampleLeg(leg, next),
          mid = sampleLeg(leg, (d + next) / 2);
        if (a.tunnel || b.tunnel || mid.tunnel) continue;
        const p = point(...a.coordinate, 0.05),
          q = point(...b.coordinate, 0.05),
          direction = q.clone().sub(p),
          center = p.clone().add(q).multiplyScalar(0.5);
        const right = new THREE.Vector3(
          direction.z,
          0,
          -direction.x,
        ).normalize();
        place(ballast, beds++, center, direction, direction.length() + 0.06);
        for (const side of [-1, 1])
          place(
            rail,
            rails++,
            center
              .clone()
              .addScaledVector(right, side * 0.4895)
              .add(new THREE.Vector3(0, 0.21, 0)),
            direction,
            direction.length() + 0.035,
          );
      }
      for (let d = Math.ceil(start / 0.9) * 0.9; d < end; d += 0.9) {
        const a = sampleLeg(leg, d),
          b = sampleLeg(leg, Math.min(leg.distance, d + 0.5));
        if (a.tunnel || b.tunnel) continue;
        const p = point(...a.coordinate, 0.12),
          q = point(...b.coordinate, 0.12);
        place(ties, sleepers++, p, q.sub(p));
      }
      rail.count = rails;
      ties.count = sleepers;
      ballast.count = beds;
      for (const mesh of [rail, ties, ballast]) {
        mesh.instanceMatrix.needsUpdate = true;
        mesh.computeBoundingSphere();
      }
    },
    dispose() {
      group.removeFromParent();
      for (const mesh of [rail, ties, ballast]) {
        mesh.geometry.dispose();
        (mesh.material as THREE.Material).dispose();
        mesh.dispose();
      }
    },
  };
}
