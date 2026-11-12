import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  createWorldObjects,
  createWorldObjectsAsync,
} from './world-objects.ts';
import { initialWorldOptions, type WorldFeature } from './world-types.ts';

await test('source objects build finite meshes, keep measured building tops and freeze illustrative activity', () => {
  const features: WorldFeature[] = [
    {
      type: 'Feature',
      id: 'synthetic-building',
      properties: { kind: 'building', source: 'synthetic', height: 7 },
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [0, 0],
            [0.01, 0],
            [0.01, 0.01],
            [0, 0.01],
            [0, 0],
          ],
        ],
      },
    },
    {
      type: 'Feature',
      id: 'synthetic-tree',
      properties: { kind: 'tree', source: 'synthetic', height: 12 },
      geometry: { type: 'Point', coordinates: [0.02, 0.02] },
    },
    {
      type: 'Feature',
      id: 'synthetic-path',
      properties: { kind: 'path', source: 'synthetic', highway: 'footway' },
      geometry: {
        type: 'LineString',
        coordinates: [
          [0.02, 0],
          [0.02, 0.1],
        ],
      },
    },
    {
      type: 'Feature',
      id: 'synthetic-ruin',
      properties: { kind: 'ruin', source: 'synthetic' },
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [0.05, 0.05],
            [0.06, 0.05],
            [0.06, 0.06],
            [0.05, 0.06],
            [0.05, 0.05],
          ],
        ],
      },
    },
  ];
  const objects = createWorldObjects(features, {
    area: 'urubamba',
    project: (lon, lat) => new THREE.Vector3(lon * 1000, lon * 100, lat * 1000),
    elevation: (lon) => 2000 + lon * 100,
  });
  const camera = new THREE.PerspectiveCamera();
  camera.position.set(20, 30, 40);
  assert.equal(objects.heightAt(0.005, 0.005), 2008);
  assert.equal(objects.heightAt(0.04, 0.04), 2004);
  assert.equal(
    objects.update({ ...initialWorldOptions, worldPaused: true }, 1, camera),
    false,
  );
  assert.equal(objects.update(initialWorldOptions, 1.05, camera), true);
  objects.group.traverse((object) => {
    if (object instanceof THREE.Mesh) {
      assert.ok(
        object.geometry.attributes.position.array.every(Number.isFinite),
      );
      if (object instanceof THREE.InstancedMesh)
        assert.ok(object.instanceMatrix.array.every(Number.isFinite));
    }
  });
  objects.dispose();
  assert.equal(objects.group.children.length, 0);
});

await test('near grass uses mapped cover and stays out of buildings, roads and mapped water', () => {
  const rectangle = (west: number, east: number): [number, number][][] => [
    [
      [west, 0.03],
      [east, 0.03],
      [east, 0.08],
      [west, 0.08],
      [west, 0.03],
    ],
  ];
  const features: WorldFeature[] = [
    {
      type: 'Feature',
      id: 'synthetic-building',
      properties: { kind: 'building', source: 'synthetic' },
      geometry: { type: 'Polygon', coordinates: rectangle(0.04, 0.05) },
    },
    {
      type: 'Feature',
      id: 'synthetic-water',
      properties: { kind: 'water', source: 'synthetic' },
      geometry: { type: 'Polygon', coordinates: rectangle(0.07, 0.08) },
    },
    {
      type: 'Feature',
      id: 'synthetic-road',
      properties: { kind: 'road', highway: 'residential', source: 'synthetic' },
      geometry: {
        type: 'LineString',
        coordinates: [
          [0.06, 0],
          [0.06, 0.1],
        ],
      },
    },
  ];
  const objects = createWorldObjects(features, {
    area: 'urubamba',
    bounds: [0, 0, 0.1, 0.1],
    landcover: (lon) => (lon < 0.03 ? 50 : 30),
    project: (lon, lat) => new THREE.Vector3(lon * 1000, 0, -lat * 1000),
    elevation: () => 2000,
  });
  const camera = new THREE.PerspectiveCamera();
  camera.position.set(50, 25, -50);
  objects.update({ ...initialWorldOptions, worldPaused: true }, 1, camera);
  const grass = objects.group.getObjectByName(
    'WorldCover grass',
  ) as THREE.InstancedMesh;
  assert.ok(grass.count > 100);
  const matrix = new THREE.Matrix4(),
    position = new THREE.Vector3();
  for (let i = 0; i < grass.count; i++) {
    grass.getMatrixAt(i, matrix);
    position.setFromMatrixPosition(matrix);
    assert.ok(
      position.x >= 30,
      'built land-cover classes must not produce grass',
    );
    assert.ok(
      Math.abs(position.x - 60) > 4,
      'road surface and verge exclude grass',
    );
    assert.ok(
      !(
        position.x > 40 &&
        position.x < 50 &&
        position.z < -30 &&
        position.z > -80
      ),
      'building footprint excludes grass',
    );
    assert.ok(
      !(
        position.x > 70 &&
        position.x < 80 &&
        position.z < -30 &&
        position.z > -80
      ),
      'mapped water excludes grass',
    );
  }
  objects.dispose();
});

await test('a mapped roof shelter remains open sided instead of becoming a solid building', () => {
  const features: WorldFeature[] = [
    {
      type: 'Feature',
      id: 'synthetic-shelter',
      properties: {
        kind: 'building',
        buildingType: 'roof',
        source: 'synthetic',
      },
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [0, 0],
            [0.01, 0],
            [0.01, 0.01],
            [0, 0.01],
            [0, 0],
          ],
        ],
      },
    },
  ];
  const objects = createWorldObjects(features, {
    area: 'machu',
    project: (lon, lat) => new THREE.Vector3(lon * 1000, 0, lat * 1000),
    elevation: () => 2000,
  });
  assert.equal(objects.heightAt(0.005, 0.005), 2003.2);
  let facadeTriangles = 0;
  objects.group.traverse((object) => {
    if (
      !(object instanceof THREE.Mesh) ||
      object instanceof THREE.InstancedMesh
    )
      return;
    const vertices = object.geometry.attributes.position;
    for (let i = 0; i < vertices.count; i += 3) {
      const xs = [vertices.getX(i), vertices.getX(i + 1), vertices.getX(i + 2)];
      const ys = [vertices.getY(i), vertices.getY(i + 1), vertices.getY(i + 2)];
      const zs = [vertices.getZ(i), vertices.getZ(i + 1), vertices.getZ(i + 2)];
      if (
        Math.max(...ys) - Math.min(...ys) > 1 &&
        (Math.max(...xs) - Math.min(...xs) > 5 ||
          Math.max(...zs) - Math.min(...zs) > 5)
      )
        facadeTriangles++;
    }
  });
  assert.equal(
    facadeTriangles,
    0,
    'a roof shelter must not receive full facade walls',
  );
  objects.dispose();
});

await test('merged building roofs and walls identify the same source feature and hidden buildings cannot be picked', () => {
  const building = (id: string, left: number): WorldFeature => ({
    type: 'Feature',
    id,
    properties: { kind: 'building', source: 'synthetic', height: 8 },
    geometry: {
      type: 'Polygon',
      coordinates: [
        [
          [left, 0],
          [left + 0.01, 0],
          [left + 0.01, 0.01],
          [left, 0.01],
          [left, 0],
        ],
      ],
    },
  });
  const objects = createWorldObjects(
    [building('synthetic-first', 0), building('synthetic-second', 0.02)],
    {
      area: 'synthetic-area',
      project: (lon, lat) => new THREE.Vector3(lon * 1000, 0, lat * 1000),
      elevation: () => 1000,
    },
  );
  const camera = new THREE.PerspectiveCamera();
  objects.update({ ...initialWorldOptions, worldPaused: true }, 0, camera);
  objects.group.updateMatrixWorld(true);
  const roof = new THREE.Raycaster(
    new THREE.Vector3(5, 50, 5),
    new THREE.Vector3(0, -1, 0),
  );
  const wall = new THREE.Raycaster(
    new THREE.Vector3(-5, 3, 5),
    new THREE.Vector3(1, 0, 0),
  );
  assert.equal(objects.pick(roof)?.feature.id, 'synthetic-first');
  assert.equal(objects.pick(wall)?.feature.id, 'synthetic-first');
  roof.ray.origin.x = 25;
  assert.equal(objects.pick(roof)?.feature.id, 'synthetic-second');
  objects.update(
    { ...initialWorldOptions, buildings: false, worldPaused: true },
    0,
    camera,
  );
  assert.equal(objects.pick(roof), undefined);
  objects.dispose();
});

await test('pitched roofs cover concave buildings while keeping courtyards open and mapped heights unchanged', () => {
  const outer: [number, number][] = [
    [0, 0],
    [20, 0],
    [20, 10],
    [10, 10],
    [10, 20],
    [0, 20],
    [0, 0],
  ];
  const hole: [number, number][] = [
    [2, 2],
    [2, 6],
    [6, 6],
    [6, 2],
    [2, 2],
  ];
  const objects = createWorldObjects(
    [
      {
        type: 'Feature',
        id: 'synthetic-courtyard',
        properties: { kind: 'building', source: 'synthetic', height: 8 },
        geometry: {
          type: 'Polygon',
          coordinates: [outer, hole].map((ring) =>
            ring.map(([x, z]) => [x / 1000, z / 1000]),
          ),
        },
      },
    ],
    {
      area: 'synthetic',
      project: (x, z) => new THREE.Vector3(x * 1000, 0, z * 1000),
      elevation: () => 100,
    },
  );
  let pitched = false;
  objects.group.traverse((object) => {
    if (
      !(object instanceof THREE.Mesh) ||
      Array.isArray(object.material) ||
      !object.material.customProgramCacheKey().endsWith('-roof')
    )
      return;
    const p = object.geometry.getAttribute('position'),
      n = object.geometry.getAttribute('normal');
    for (let i = 0; i < p.count; i += 3) {
      const x = (p.getX(i) + p.getX(i + 1) + p.getX(i + 2)) / 3;
      const z = (p.getZ(i) + p.getZ(i + 1) + p.getZ(i + 2)) / 3;
      assert.ok(!(x > 2 && x < 6 && z > 2 && z < 6), 'courtyard stays open');
      assert.ok(!(x > 10 && z > 10), 'concave footprint stays open');
      assert.ok(n.getY(i) >= 0, 'roof faces upward');
      if (n.getY(i) > 0 && n.getY(i) < 0.99) pitched = true;
      for (let j = 0; j < 3; j++)
        assert.ok(p.getY(i + j) <= 8.001, 'roof does not exceed mapped top');
    }
  });
  assert.ok(pitched, 'complex modern footprints receive a pitched roof');
  assert.equal(objects.heightAt(0.001, 0.001), 108);
  objects.dispose();
});

await test('long facades and streets batch repeated faces instead of allocating geometry per window or road segment', () => {
  const original = Object.getOwnPropertyDescriptor(
    THREE.BufferGeometry.prototype,
    'dispose',
  )!.value as () => void;
  let disposed = 0;
  THREE.BufferGeometry.prototype.dispose = function () {
    disposed++;
    original.call(this);
  };
  try {
    const measure = (length: number) => {
      disposed = 0;
      const objects = createWorldObjects(
        [
          {
            type: 'Feature',
            id: 'synthetic-long-facade',
            properties: { kind: 'building', source: 'synthetic', levels: 4 },
            geometry: {
              type: 'Polygon',
              coordinates: [
                [
                  [0, 0],
                  [length / 1000, 0],
                  [length / 1000, 0.02],
                  [0, 0.02],
                  [0, 0],
                ],
              ],
            },
          },
          {
            type: 'Feature',
            id: 'synthetic-long-road',
            properties: {
              kind: 'road',
              source: 'synthetic',
              highway: 'residential',
            },
            geometry: {
              type: 'LineString',
              coordinates: [
                [0, 0.03],
                [length / 1000, 0.03],
              ],
            },
          },
        ],
        {
          area: 'synthetic',
          project: (x, z) => new THREE.Vector3(x * 1000, 0, z * 1000),
          elevation: () => 0,
        },
      );
      const result = disposed;
      objects.dispose();
      return result;
    };
    const short = measure(30),
      long = measure(300);
    assert.ok(
      long <= short + 4,
      `temporary geometry allocations grew from ${short} to ${long}`,
    );
  } finally {
    THREE.BufferGeometry.prototype.dispose = original;
  }
});

await test('facade windows retain every lit face with compact shared corners and no unused attributes', () => {
  const objects = createWorldObjects(
    [
      {
        type: 'Feature',
        id: 'synthetic-window-building',
        properties: {
          kind: 'building',
          source: 'synthetic',
          levels: 2,
          height: 8,
        },
        geometry: {
          type: 'Polygon',
          coordinates: [
            [
              [0, 0],
              [0.02, 0],
              [0.02, 0.01],
              [0, 0.01],
              [0, 0],
            ],
          ],
        },
      },
    ],
    {
      area: 'synthetic',
      project: (x, z) => new THREE.Vector3(x * 1000, 0, z * 1000),
      elevation: () => 0,
    },
  );
  try {
    const windows = objects.group.children[0].children.find(
      (object) =>
        object instanceof THREE.Mesh &&
        object.material instanceof THREE.MeshStandardMaterial &&
        object.material.emissive.getHexString() === 'ffc66d',
    ) as THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
    const geometry = windows.geometry;
    assert.ok(
      geometry.index,
      'window corners must be shared instead of duplicating triangles',
    );
    assert.equal(
      geometry.index.count,
      36 * 6,
      'every facade window remains present',
    );
    assert.equal(geometry.attributes.position.count, 36 * 4);
    assert.deepEqual(Object.keys(geometry.attributes).sort(), [
      'normal',
      'position',
    ]);
    const p = geometry.attributes.position;
    for (let i = 0; i < p.count; i += 4) {
      assert.ok(
        Math.abs(
          Math.hypot(p.getX(i + 1) - p.getX(i), p.getZ(i + 1) - p.getZ(i)) -
            0.8,
        ) < 0.00001,
      );
      assert.ok(Math.abs(p.getY(i + 3) - p.getY(i) - 0.95) < 0.00001);
    }
    const camera = new THREE.PerspectiveCamera();
    objects.update(
      { ...initialWorldOptions, worldPaused: true, timeOfDay: 0 },
      0,
      camera,
    );
    assert.equal(windows.material.emissiveIntensity, 1.7);
    objects.group.updateMatrixWorld(true);
    const ray = new THREE.Raycaster(
      new THREE.Vector3(-5, 3, 5),
      new THREE.Vector3(1, 0, 0),
    );
    assert.equal(objects.pick(ray)?.feature.id, 'synthetic-window-building');
  } finally {
    objects.dispose();
  }
});

await test('groundcover skips distant tiles while retaining vegetation across tile boundaries', () => {
  let projects = 0;
  const objects = createWorldObjects([], {
    area: 'synthetic',
    bounds: [0, 0, 0.02, 0.02],
    landcover: () => 30,
    project: (lon, lat) => {
      projects++;
      return new THREE.Vector3(lon * 100000, 0, -lat * 100000);
    },
    elevation: () => 0,
  });
  try {
    const camera = new THREE.PerspectiveCamera();
    camera.position.set(2050, 20, -1000);
    objects.update(initialWorldOptions, 0, camera);
    const grass = objects.group.getObjectByName(
      'WorldCover grass',
    ) as THREE.InstancedMesh;
    assert.ok(
      grass.count > 0,
      'a camera outside the tile still sees its nearby edge vegetation',
    );
    const matrix = new THREE.Matrix4();
    for (let i = 0; i < grass.count; i++) {
      grass.getMatrixAt(i, matrix);
      assert.ok(
        matrix.elements[12] < 2000,
        'vegetation remains inside its source tile',
      );
    }
    camera.position.x = 2300;
    projects = 0;
    objects.update(initialWorldOptions, 1, camera);
    assert.equal(
      grass.count,
      0,
      'leaving the vegetation radius clears the previous instances',
    );
    assert.equal(
      projects,
      0,
      'a distant tile must not sample terrain around this camera',
    );
    camera.position.x = 2050;
    objects.update(initialWorldOptions, 2, camera);
    assert.ok(
      grass.count > 0,
      'returning to the edge restores the same source coverage',
    );
  } finally {
    objects.dispose();
  }
});

await test('city construction yields to input and can be cancelled before publishing a partial tile', async () => {
  const features: WorldFeature[] = Array.from({ length: 600 }, (_, i) => ({
    type: 'Feature',
    id: `synthetic-city-${i}`,
    properties: { kind: 'building', source: 'synthetic' },
    geometry: {
      type: 'Polygon',
      coordinates: [
        [
          [0, 0],
          [0.01, 0],
          [0.01, 0.01],
          [0, 0.01],
          [0, 0],
        ],
      ],
    },
  }));
  const context = {
    area: 'synthetic',
    project: (x: number, z: number) => new THREE.Vector3(x * 1000, 0, z * 1000),
    elevation: () => 0,
  };
  const controller = new AbortController();
  const inputTurn = new Promise<void>((resolve) =>
    setTimeout(() => {
      controller.abort();
      resolve();
    }, 0),
  );
  const original = Object.getOwnPropertyDescriptor(
    THREE.BufferGeometry.prototype,
    'dispose',
  )!.value as () => void;
  let released = 0;
  THREE.BufferGeometry.prototype.dispose = function () {
    released++;
    original.call(this);
  };
  try {
    await assert.rejects(
      createWorldObjectsAsync(features, context, controller.signal),
      { name: 'AbortError' },
    );
    await inputTurn;
    assert.ok(released > 0, 'cancelled tile releases its partial geometry');
    const objects = await createWorldObjectsAsync(
      features.slice(0, 1),
      context,
      new AbortController().signal,
    );
    assert.equal(
      objects.heightAt(0.005, 0.005),
      6,
      'a later tile completes with its building height intact',
    );
    objects.dispose();
  } finally {
    THREE.BufferGeometry.prototype.dispose = original;
  }
});
