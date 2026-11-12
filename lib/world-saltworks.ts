import * as THREE from 'three';
import { insideRing } from './world-object-math.ts';
import type { WorldObjectContext } from './world-life.ts';
import type { WorldFeature } from './world-types.ts';

type Basin = NonNullable<WorldFeature['inferredBasins']>[number];
type Surface = { positions: number[]; colors: number[] };

/** Builds illustrative stepped ponds from clipped cells, anchored to display terrain. */
export function createSaltworks(basins: Basin[], context: WorldObjectContext) {
  const mesh = new THREE.Group();
  mesh.name = 'Maras · illustrative 3D salt ponds';
  const stone: Surface = { positions: [], colors: [] };
  const water: Surface = { positions: [], colors: [] };
  const levels: { basin: Basin; height: number }[] = [];
  const rimColor = new THREE.Color('#eee6d2');
  const wallColor = new THREE.Color('#bdb09b');
  const emit = (
    surface: Surface,
    points: THREE.Vector3[],
    color: THREE.Color,
  ) => {
    for (const point of points) {
      surface.positions.push(point.x, point.y, point.z);
      surface.colors.push(color.r, color.g, color.b);
    }
  };
  const flat = (
    surface: Surface,
    rings: Basin['footprint'],
    height: number,
    color: THREE.Color,
  ) => {
    const points = rings.map((ring) =>
      ring.map(([lon, lat]) => {
        const p = context.project(lon, lat);
        return new THREE.Vector2(p.x, -p.z);
      }),
    );
    const shape = new THREE.Shape(points[0]);
    shape.holes = points.slice(1).map((ring) => new THREE.Path(ring));
    const geometry = new THREE.ShapeGeometry(shape);
    const positions = geometry.getAttribute('position'),
      index = geometry.index!;
    for (let i = 0; i < index.count; i += 3) {
      emit(
        surface,
        [0, 1, 2].map((j) => {
          const v = index.getX(i + j);
          return new THREE.Vector3(
            positions.getX(v),
            height,
            -positions.getY(v),
          );
        }),
        color,
      );
    }
    geometry.dispose();
  };
  const walls = (rings: Basin['footprint'], top: number, floor?: number) => {
    for (const ring of rings)
      for (let i = 1; i < ring.length; i++) {
        const a = context.project(...ring[i - 1]),
          b = context.project(...ring[i]);
        a.y = floor ?? a.y - 0.08;
        b.y = floor ?? b.y - 0.08;
        const c = new THREE.Vector3(b.x, top, b.z),
          d = new THREE.Vector3(a.x, top, a.z);
        emit(stone, [a, b, d, b, c, d], wallColor);
      }
  };
  basins.forEach((basin, i) => {
    let top = -Infinity;
    for (const ring of basin.footprint)
      for (let j = 1; j < ring.length; j++) {
        const a = ring[j - 1],
          b = ring[j];
        top = Math.max(
          top,
          context.project(...a).y,
          context.project((a[0] + b[0]) / 2, (a[1] + b[1]) / 2).y,
        );
      }
    top += 0.32;
    levels.push({ basin, height: top });
    walls(basin.footprint, top);
    const poolColor = new THREE.Color(
      [
        '#e8deca',
        '#f1ebdb',
        '#ddd0b5',
        '#faf5e7',
        '#bd9e79',
        '#987b58',
        '#ede6d8',
      ][i % 7],
    );
    for (const pool of basin.pools) {
      flat(water, pool, top - 0.16, poolColor);
      walls(pool, top, top - 0.16);
    }
    for (const rim of basin.rims) flat(stone, rim, top, rimColor);
  });
  const materials = [
    new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.94,
      side: THREE.DoubleSide,
    }),
    new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.43,
      metalness: 0.05,
      side: THREE.DoubleSide,
    }),
  ];
  materials.forEach((material, i) => {
    material.onBeforeCompile = (shader) => {
      shader.vertexShader =
        'varying vec3 saltPosition;\n' + shader.vertexShader;
      shader.vertexShader = shader.vertexShader.replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\nsaltPosition=position;',
      );
      shader.fragmentShader =
        'varying vec3 saltPosition;\n' + shader.fragmentShader;
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        float grain = fract(sin(dot(floor(saltPosition.xz*13.0),vec2(127.1,311.7)))*43758.54);
        diffuseColor.rgb *= .94 + grain * .12;
        ${i === 0 ? 'diffuseColor.rgb *= .92 + .08 * sin(saltPosition.y * 9.0);' : ''}`,
      );
    };
    material.customProgramCacheKey = () => `saltworks-3d-${i}`;
  });
  const geometries: THREE.BufferGeometry[] = [];
  [stone, water].forEach((surface, i) => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(surface.positions, 3),
    );
    geometry.setAttribute(
      'color',
      new THREE.Float32BufferAttribute(surface.colors, 3),
    );
    geometry.computeVertexNormals();
    const part = new THREE.Mesh(geometry, materials[i]);
    part.name =
      i === 0 ? 'Salt-crusted retaining walls' : 'Salt evaporation basins';
    part.castShadow = i === 0;
    part.receiveShadow = true;
    mesh.add(part);
    geometries.push(geometry);
  });
  return {
    mesh,
    heightAt(lon: number, lat: number) {
      const terrain = context.elevation(lon, lat);
      const base = terrain - context.project(lon, lat).y;
      for (const { basin, height } of levels)
        if (
          insideRing([lon, lat], basin.footprint[0]) &&
          !basin.footprint.slice(1).some((hole) => insideRing([lon, lat], hole))
        )
          return Math.max(terrain, height + base);
      return terrain;
    },
    dispose() {
      geometries.forEach((geometry) => geometry.dispose());
      materials.forEach((material) => material.dispose());
      mesh.clear();
    },
  };
}
