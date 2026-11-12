import * as THREE from 'three';
import type { WorldFeature } from './world-types';
import type { WorldObjectContext } from './world-life';
import { createSaltworks } from './world-saltworks.ts';

/** Renders salt basins or drapes mapped airport ground onto the terrain. */
export function createSiteSurface(
  feature: WorldFeature,
  context: WorldObjectContext,
) {
  if (feature.properties.kind === 'saltpan')
    return createSaltworks(feature.inferredBasins!, context);
  const polygons =
    feature.geometry.type === 'Polygon'
      ? [feature.geometry.coordinates]
      : feature.geometry.type === 'MultiPolygon'
        ? feature.geometry.coordinates
        : [];
  const positions: number[] = [];
  const [west, south, east, north] = context.bounds!;
  const nw = context.project(west, north),
    se = context.project(east, south);
  const sample = (x: number, z: number) =>
    context.project(
      west + ((x - nw.x) / (se.x - nw.x)) * (east - west),
      north + ((z - nw.z) / (se.z - nw.z)) * (south - north),
    ).y + 0.12;
  if (feature.surfaceGrid) {
    for (const index of feature.surfaceGrid.indices) {
      const p = context.project(...feature.surfaceGrid.vertices[index]);
      positions.push(p.x, p.y + 0.12, p.z);
    }
  }
  for (const polygon of feature.surfaceGrid ? [] : polygons) {
    const rings = polygon.map((ring) =>
      ring.map((p) => {
        const v = context.project(...p);
        return new THREE.Vector2(v.x, -v.z);
      }),
    );
    const shape = new THREE.Shape(rings[0]);
    shape.holes = rings.slice(1).map((ring) => new THREE.Path(ring));
    const flat = new THREE.ShapeGeometry(shape);
    const vertices = flat.attributes.position,
      indices = flat.index!;
    const stack: THREE.Vector2[][] = [];
    for (let i = 0; i < indices.count; i += 3)
      stack.push(
        [0, 1, 2].map(
          (j) =>
            new THREE.Vector2(
              vertices.getX(indices.getX(i + j)),
              -vertices.getY(indices.getX(i + j)),
            ),
        ),
      );
    while (stack.length) {
      const points = stack.pop()!;
      const lengths = points.map((p, i) =>
        p.distanceToSquared(points[(i + 1) % 3]),
      );
      const longest = lengths.indexOf(Math.max(...lengths));
      if (lengths[longest] > 28 ** 2) {
        const a = points[longest],
          b = points[(longest + 1) % 3],
          c = points[(longest + 2) % 3];
        const mid = a.clone().lerp(b, 0.5);
        stack.push([a, mid, c], [mid, b, c]);
      } else for (const p of points) positions.push(p.x, sample(p.x, p.y), p.y);
    }
    flat.dispose();
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.computeVertexNormals();
  const material = new THREE.MeshStandardMaterial({
    color: feature.properties.aeroway === 'apron' ? '#83827a' : '#b19a75',
    roughness: 0.92,
    side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = 'varying vec3 sitePosition;\n' + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      '#include <begin_vertex>\nsitePosition=position;',
    );
    shader.fragmentShader =
      'varying vec3 sitePosition;\n' + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <color_fragment>',
      `#include <color_fragment>
      vec2 p = sitePosition.xz;
      float grain = fract(sin(dot(floor(p*.25),vec2(127.1,311.7)))*43758.54);
      float tracks = .96 + .04 * sin((p.x+p.y*.6)*.5);
      diffuseColor.rgb *= (.9 + grain * .18) * tracks;
    `,
    );
  };
  material.customProgramCacheKey = () => 'compound-ground';
  const mesh = new THREE.Mesh(geometry, material);
  mesh.receiveShadow = true;
  mesh.name = 'Mapped airport construction footprint';
  return {
    mesh,
    heightAt: (lon: number, lat: number) => context.elevation(lon, lat),
    dispose() {
      geometry.dispose();
      material.dispose();
    },
  };
}
