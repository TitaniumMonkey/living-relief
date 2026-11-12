import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/** A scenic passenger interior in coach-local metres, with open panoramic windows. */
export function createPassengerCabin() {
  const group = new THREE.Group();
  group.name = 'Panoramic passenger cabin';
  const materials = [
    new THREE.MeshStandardMaterial({ color: '#29383c', roughness: 0.96 }),
    new THREE.MeshStandardMaterial({ color: '#76513a', roughness: 0.78 }),
    new THREE.MeshStandardMaterial({
      color: '#dedbc9',
      roughness: 0.62,
      metalness: 0.12,
    }),
    new THREE.MeshStandardMaterial({ color: '#254a62', roughness: 0.98 }),
    new THREE.MeshStandardMaterial({ color: '#577c8b', roughness: 0.94 }),
    new THREE.MeshStandardMaterial({
      color: '#b5a073',
      metalness: 0.5,
      roughness: 0.46,
    }),
    new THREE.MeshStandardMaterial({ color: '#ba9770', roughness: 0.7 }),
    new THREE.MeshStandardMaterial({
      color: '#ffedc9',
      emissive: '#ffd392',
      emissiveIntensity: 0.6,
    }),
  ];
  const names = [
      'Floor and seat supports',
      'Walnut panels',
      'Ivory window frames',
      'Blue upholstery',
      'Upholstery piping',
      'Brass fittings',
      'Wood tables',
      'Warm reading lights',
    ],
    batches: THREE.BufferGeometry[][] = materials.map(() => []),
    geometries: THREE.BufferGeometry[] = [];
  function box(
    material: number,
    width: number,
    height: number,
    depth: number,
    x: number,
    y: number,
    z: number,
    radius = 0,
    rotation = 0,
  ) {
    const geometry = radius
      ? new RoundedBoxGeometry(width, height, depth, 1, radius)
      : new THREE.BoxGeometry(width, height, depth);
    geometry.deleteAttribute('uv');
    geometry.rotateZ(rotation);
    geometry.translate(x, y, z);
    batches[material].push(geometry.index ? geometry.toNonIndexed() : geometry);
    if (geometry.index) geometry.dispose();
  }

  const bays = Array.from({ length: 8 }, (_, index) => -6.8 + index * 1.95),
    frames = Array.from({ length: 9 }, (_, index) => -7.775 + index * 1.95);

  box(0, 2.48, 0.07, 17.1, 0, 1.205, 0);
  box(3, 0.5, 0.012, 16.5, 0, 1.247, 0);
  // A narrow spine and individual ribs leave the panoramic roof transparent.
  box(2, 0.48, 0.08, 17, 0, 3.97, 0);
  for (const side of [-1, 1]) {
    box(1, 0.075, 1.04, 17, side * 1.245, 1.755, 0);
    box(1, 0.19, 0.065, 16.8, side * 1.19, 2.285, 0);
    box(5, 0.025, 0.025, 16.8, side * 1.11, 2.326, 0);
    box(2, 0.085, 0.12, 17, side * 1.245, 3.54, 0);
    box(7, 0.025, 0.025, 16.6, side * 0.225, 3.915, 0);
    for (const z of frames) {
      box(2, 0.085, 1.3, 0.07, side * 1.245, 2.93, z);
      box(2, 1, 0.065, 0.07, side * 0.74, 3.75, z, 0, -side * 0.424);
    }
    for (const z of bays) {
      // Facing seats share a small table; the centre aisle remains clear.
      box(6, 0.76, 0.085, 0.6, side * 0.8, 2.11, z, 0.035);
      box(5, 0.075, 0.835, 0.075, side * 0.85, 1.65, z);
      box(0, 0.4, 0.055, 0.32, side * 0.85, 1.267, z);
      for (const facing of [-1, 1]) {
        const seatZ = z + facing * 0.63,
          backZ = seatZ + facing * 0.26;
        box(0, 0.13, 0.48, 0.13, side * 0.74, 1.5, seatZ);
        box(0, 0.56, 0.055, 0.42, side * 0.74, 1.267, seatZ);
        box(3, 0.8, 0.17, 0.55, side * 0.74, 1.8, seatZ, 0.06);
        box(3, 0.8, 1.1, 0.15, side * 0.74, 2.33, backZ, 0.065);
        box(4, 0.69, 0.028, 0.018, side * 0.74, 2.72, backZ - facing * 0.079);
        for (const edge of [-1, 1]) {
          const armX = side * 0.74 + edge * 0.405;
          box(1, 0.07, 0.075, 0.52, armX, 2.075, seatZ);
        }
      }
    }
  }

  // Open vestibules give the aisle depth without a solid wall in the view.
  for (const z of [-8.4, 8.4]) {
    for (const side of [-1, 1]) {
      box(1, 0.62, 2.22, 0.08, side * 0.915, 2.35, z);
      box(2, 0.07, 2.22, 0.13, side * 0.58, 2.35, z);
      box(5, 0.028, 0.65, 0.045, side * 0.7, 2.3, z - Math.sign(z) * 0.07);
    }
    box(2, 2.48, 0.24, 0.13, 0, 3.58, z);
    box(7, 0.36, 0.065, 0.025, 0, 3.54, z - Math.sign(z) * 0.08);
  }

  batches.forEach((batch, index) => {
    const geometry = mergeGeometries(batch);
    batch.forEach((part) => part.dispose());
    geometries.push(geometry);
    const mesh = new THREE.Mesh(geometry, materials[index]);
    mesh.name = `Cabin · ${names[index]}`;
    mesh.receiveShadow = true;
    group.add(mesh);
  });

  return {
    group,
    dispose() {
      group.clear();
      geometries.forEach((geometry) => geometry.dispose());
      materials.forEach((material) => material.dispose());
    },
  };
}
