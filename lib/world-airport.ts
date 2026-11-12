import * as THREE from 'three';
import type { WorldFeature } from './world-types.ts';
import type { WorldObjectContext } from './world-life.ts';
import { createSiteSurface } from './world-sites.ts';

/** Drapes mapped airside geometry; untagged taxiway widths and paint are illustrative. */
export function createAirportSurface(
  feature: WorldFeature,
  context: WorldObjectContext,
) {
  if (
    feature.geometry.type === 'Polygon' ||
    feature.geometry.type === 'MultiPolygon'
  )
    return createSiteSurface(feature, context);
  const lines =
    feature.geometry.type === 'LineString'
      ? [feature.geometry.coordinates]
      : feature.geometry.type === 'MultiLineString'
        ? feature.geometry.coordinates
        : [];
  const runway = feature.properties.aeroway === 'runway';
  const width = feature.properties.width ?? 12;
  const [west, south, east, north] = context.bounds!;
  const nw = context.project(west, north),
    se = context.project(east, south);
  const ground = (x: number, z: number, lift: number) =>
    new THREE.Vector3(
      x,
      context.project(
        west + ((x - nw.x) / (se.x - nw.x)) * (east - west),
        north + ((z - nw.z) / (se.z - nw.z)) * (south - north),
      ).y + lift,
      z,
    );
  const positions: number[] = [],
    colors: number[] = [];
  const asphalt = new THREE.Color(runway ? '#505454' : '#737470');
  const paint = new THREE.Color(runway ? '#e5e1cd' : '#d7b766');
  const strip = (
    a: THREE.Vector3,
    b: THREE.Vector3,
    half: number,
    shift: number,
    lift: number,
    color: THREE.Color,
  ) => {
    const d = new THREE.Vector3().subVectors(b, a).setY(0).normalize();
    const edge = new THREE.Vector3(-d.z, 0, d.x);
    const p = [
      ground(
        a.x + edge.x * (shift - half),
        a.z + edge.z * (shift - half),
        lift,
      ),
      ground(
        b.x + edge.x * (shift - half),
        b.z + edge.z * (shift - half),
        lift,
      ),
      ground(
        b.x + edge.x * (shift + half),
        b.z + edge.z * (shift + half),
        lift,
      ),
      ground(
        a.x + edge.x * (shift + half),
        a.z + edge.z * (shift + half),
        lift,
      ),
    ];
    for (const i of [0, 3, 1, 1, 3, 2]) {
      positions.push(p[i].x, p[i].y, p[i].z);
      colors.push(color.r, color.g, color.b);
    }
  };
  for (const line of lines) {
    let along = 0;
    for (let i = 1; i < line.length; i++) {
      const a = context.project(...line[i - 1]),
        b = context.project(...line[i]);
      const distance = a.distanceTo(b),
        count = Math.max(1, Math.ceil(distance / 5));
      for (let j = 0; j < count; j++) {
        const start = a.clone().lerp(b, j / count),
          end = a.clone().lerp(b, (j + 1) / count);
        strip(start, end, width / 2, 0, 0.16, asphalt);
        if (
          !runway ||
          Math.floor((along + (j / count) * distance) / 30) % 2 === 0
        )
          strip(start, end, runway ? 0.45 : 0.12, 0, 0.19, paint);
        if (runway)
          for (const side of [-1, 1])
            strip(start, end, 0.18, side * (width / 2 - 1), 0.19, paint);
      }
      along += distance;
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.9,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = runway
    ? 'Mapped runway 10/28'
    : 'Mapped taxiway · illustrative width';
  mesh.receiveShadow = true;
  return {
    mesh,
    heightAt: (lon: number, lat: number) => context.elevation(lon, lat),
    dispose() {
      geometry.dispose();
      material.dispose();
    },
  };
}
