import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { FontLoader } from 'three/addons/loaders/FontLoader.js';
import fontData from 'three/examples/fonts/helvetiker_regular.typeface.json' with { type: 'json' };

/** Photo-based PeruRail diesel and panoramic coaches; illustrative dimensions in metres. */
export function createTrainModel() {
  const font = new FontLoader().parse(fontData);
  const materials = [
    new THREE.MeshStandardMaterial({
      color: '#124b9e',
      metalness: 0.35,
      roughness: 0.33,
    }),
    new THREE.MeshStandardMaterial({
      color: '#ebbd25',
      metalness: 0.3,
      roughness: 0.42,
    }),
    new THREE.MeshStandardMaterial({
      color: '#919da1',
      metalness: 0.65,
      roughness: 0.45,
    }),
    new THREE.MeshStandardMaterial({
      color: '#202a30',
      metalness: 0.55,
      roughness: 0.65,
    }),
    new THREE.MeshStandardMaterial({
      color: '#274955',
      metalness: 0.5,
      roughness: 0.18,
    }),
    new THREE.MeshStandardMaterial({
      color: '#fff1c2',
      emissive: '#ffe6ab',
      emissiveIntensity: 0.6,
    }),
  ];
  materials.push(
    new THREE.MeshStandardMaterial({
      color: '#b4d0d6',
      transparent: true,
      opacity: 0.14,
      depthWrite: false,
      roughness: 0.15,
    }),
  );
  const geometries: THREE.BufferGeometry[] = [];
  const units = Array.from({ length: 4 }, (_, index) => {
    const loco = index === 0,
      unit = new THREE.Group();
    unit.name = loco
      ? 'PeruRail diesel locomotive'
      : `Panoramic coach ${index}`;
    const batches: THREE.BufferGeometry[][] = materials.map(() => []);
    function add(
      geo: THREE.BufferGeometry,
      material: number,
      x: number,
      y: number,
      z: number,
      rx = 0,
      ry = 0,
      rz = 0,
    ) {
      geo.deleteAttribute('uv');
      geo.applyMatrix4(
        new THREE.Matrix4().compose(
          new THREE.Vector3(x, y, z),
          new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)),
          new THREE.Vector3(1, 1, 1),
        ),
      );
      batches[material].push(geo.index ? geo.toNonIndexed() : geo);
      if (geo.index) geo.dispose();
    }
    const box = (
      m: number,
      w: number,
      h: number,
      d: number,
      x: number,
      y: number,
      z: number,
      r = 0,
    ) =>
      add(
        r
          ? new RoundedBoxGeometry(w, h, d, 2, r)
          : new THREE.BoxGeometry(w, h, d),
        m,
        x,
        y,
        z,
      );
    const length = loco ? 12 : 18;
    box(3, 2.45, 0.35, length, 0, 1, 0);
    for (const bz of loco ? [-3.8, 3.8] : [-6, 6]) {
      box(3, 1.5, 0.38, 2.8, 0, 0.6, bz);
      for (const dz of [-0.9, 0.9]) {
        add(
          new THREE.CylinderGeometry(0.1, 0.1, 1.15, 8),
          3,
          0,
          0.42,
          bz + dz,
          0,
          0,
          Math.PI / 2,
        );
        for (const side of [-1, 1]) {
          add(
            new THREE.CylinderGeometry(0.42, 0.42, 0.13, 16),
            3,
            side * 0.52,
            0.42,
            bz + dz,
            0,
            0,
            Math.PI / 2,
          );
          add(
            new THREE.CylinderGeometry(0.22, 0.22, 0.15, 12),
            2,
            side * 0.53,
            0.42,
            bz + dz,
            0,
            0,
            Math.PI / 2,
          );
        }
      }
    }
    for (const z of [-length / 2 - 0.25, length / 2 + 0.25])
      box(3, 0.32, 0.22, 0.8, 0, 0.9, z);
    if (loco) {
      box(0, 1.8, 2.25, 7.2, 0, 2.3, -1.8, 0.1);
      box(0, 2.65, 2.7, 2.8, 0, 2.6, 3.1, 0.12);
      box(0, 2.8, 0.22, 3, 0, 4.03, 3.1, 0.08);
      box(0, 1.8, 1.25, 1.3, 0, 1.85, 5.15, 0.1);
      box(1, 2.8, 0.16, 12.2, 0, 1.23, 0);
      // Cab glazing, engine ventilation and yellow safety rails.
      for (const side of [-1, 1]) {
        box(6, 1.04, 0.82, 0.06, side * 0.59, 3.35, 4.515, 0.02);
        box(6, 0.05, 0.92, 1.8, side * 1.335, 3.3, 3.1, 0.02);
        for (let z = -4.8; z < 1.2; z += 0.4)
          box(3, 0.025, 1.2, 0.11, side * 0.91, 2.45, z);
        box(1, 0.055, 0.055, 11.6, side * 1.31, 2.25, 0);
        for (const z of [-5.7, -3, -0.3, 2.1, 5.7])
          box(1, 0.055, 1, 0.055, side * 1.31, 1.75, z);
      }
      box(1, 2.65, 0.055, 0.055, 0, 2.25, 5.7);
      box(1, 2.65, 0.75, 0.18, 0, 0.65, 6.03);
      for (let x = -1.15; x < 1.2; x += 0.6)
        add(
          new THREE.BoxGeometry(0.2, 0.72, 0.025),
          3,
          x,
          0.65,
          6.13,
          0,
          0,
          -0.55,
        );
      for (const x of [-0.85, 0.85])
        add(
          new THREE.CylinderGeometry(0.14, 0.14, 0.1, 16),
          5,
          x,
          3.88,
          4.57,
          Math.PI / 2,
        );
      for (const x of [-0.3, 0.3])
        add(
          new THREE.CylinderGeometry(0.12, 0.12, 0.14, 12),
          5,
          x,
          1.95,
          5.83,
          Math.PI / 2,
        );
      add(new THREE.CylinderGeometry(0.16, 0.18, 0.45, 10), 3, 0, 3.65, -1.4);
      for (const z of [-4, -2.7])
        add(new THREE.CylinderGeometry(0.52, 0.52, 0.08, 16), 3, 0, 3.46, z);
    } else {
      box(0, 2.6, 2.35, 17.4, 0, 2.4, 0, 0.12);
      box(2, 2.7, 0.8, 17.6, 0, 3.65, 0, 0.35);
      for (const side of [-1, 1]) {
        for (const y of [1.35, 1.48, 2.15, 3.46])
          box(1, 0.025, 0.045, 17.3, side * 1.31, y, 0);
        for (let z = -6.8; z <= 6.8; z += 1.95) {
          box(2, 0.055, 1.19, 1.72, side * 1.315, 2.84, z, 0.1);
          box(4, 0.065, 1.06, 1.57, side * 1.345, 2.84, z, 0.08);
          box(2, 0.08, 0.025, 1.6, side * 1.36, 2.91, z);
          add(
            new RoundedBoxGeometry(0.73, 0.055, 1.57, 2, 0.02),
            4,
            side * 0.96,
            3.93,
            z,
            0,
            0,
            side * -0.47,
          );
        }
        box(3, 0.035, 1.8, 0.66, side * 1.32, 2.45, 8.08, 0.04);
        box(4, 0.05, 0.65, 0.46, side * 1.34, 2.9, 8.08, 0.03);
        // Raised lettering stays sharp at close range without remote textures.
        const text = new THREE.ShapeGeometry(
          font.generateShapes('P E R U R A I L', 0.28),
        );
        text.computeBoundingBox();
        text.translate(-text.boundingBox!.max.x / 2, 0, 0);
        add(text, 1, side * 1.325, 1.65, 0, 0, (side * Math.PI) / 2);
      }
      for (const z of [-8.85, 8.85]) box(3, 1.05, 1.9, 0.4, 0, 2.25, z, 0.08);
    }
    batches.forEach((batch, i) => {
      if (!batch.length) return;
      const geometry = mergeGeometries(batch);
      batch.forEach((g) => g.dispose());
      geometries.push(geometry);
      const mesh = new THREE.Mesh(geometry, materials[i]);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      unit.add(mesh);
    });
    return {
      group: unit,
      offset: loco ? 0 : 16 + (index - 1) * 19,
      wheelbase: loco ? 7.6 : 12,
    };
  });
  return {
    units,
    dispose() {
      geometries.forEach((g) => g.dispose());
      materials.forEach((m) => m.dispose());
    },
  };
}
