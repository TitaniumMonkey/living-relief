import * as THREE from 'three';
import { createSiteSurface } from './world-sites.ts';
import { createAirportSurface } from './world-airport.ts';
import { buildingAppearance } from './place-details.ts';
import { pitchedRoof } from './world-roofs.ts';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { WorldFeature, WorldFeatures, WorldOptions } from './world-types';
import { createWorldLife, type WorldObjectContext } from './world-life.ts';
import {
  buildingHeight,
  foundation,
  insideRing,
  seeded,
  supportsPitchedRoof,
  terraceSection,
  type LonLat,
} from './world-object-math.ts';
export type { WorldObjectContext } from './world-life.ts';

type Roof = { ring: LonLat[]; top: number };
const binKey = (lon: number, lat: number) =>
  `${Math.floor(lon * 1000)}/${Math.floor(lat * 1000)}`;
type Parts = THREE.BufferGeometry[];
function painted(
  geometry: THREE.BufferGeometry,
  color: THREE.ColorRepresentation,
) {
  const result = geometry.index ? geometry.toNonIndexed() : geometry;
  if (result !== geometry) geometry.dispose();
  result.deleteAttribute('uv');
  const tint = new THREE.Color(color),
    data = new Float32Array(result.attributes.position.count * 3);
  for (let i = 0; i < data.length; i += 3) tint.toArray(data, i);
  result.setAttribute('color', new THREE.BufferAttribute(data, 3));
  result.setAttribute(
    'finish',
    new THREE.BufferAttribute(
      new Float32Array(result.attributes.position.count),
      1,
    ),
  );
  return result;
}
function triangles(points: number[], color: THREE.ColorRepresentation) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(points, 3),
  );
  geometry.computeVertexNormals();
  return painted(geometry, color);
}
function quad(
  a: THREE.Vector3,
  b: THREE.Vector3,
  c: THREE.Vector3,
  d: THREE.Vector3,
  color: THREE.ColorRepresentation,
) {
  return triangles([...a, ...b, ...c, ...a, ...c, ...d], color);
}
function appendQuad(
  points: number[],
  a: THREE.Vector3,
  b: THREE.Vector3,
  c: THREE.Vector3,
  d: THREE.Vector3,
) {
  points.push(
    a.x,
    a.y,
    a.z,
    b.x,
    b.y,
    b.z,
    c.x,
    c.y,
    c.z,
    a.x,
    a.y,
    a.z,
    c.x,
    c.y,
    c.z,
    d.x,
    d.y,
    d.z,
  );
}
function extruded(
  rings: THREE.Vector3[][],
  bottom: number,
  height: number,
  color: THREE.ColorRepresentation,
) {
  const shape = new THREE.Shape(
    rings[0].map((p) => new THREE.Vector2(p.x, -p.z)),
  );
  shape.holes = rings
    .slice(1)
    .map(
      (ring) => new THREE.Path(ring.map((p) => new THREE.Vector2(p.x, -p.z))),
    );
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: height,
    bevelEnabled: false,
    steps: 1,
  });
  geometry.rotateX(-Math.PI / 2);
  geometry.translate(0, bottom, 0);
  return painted(geometry, color);
}
function polygonRings(feature: WorldFeature): LonLat[][][] {
  return feature.geometry.type === 'Polygon'
    ? [feature.geometry.coordinates]
    : feature.geometry.type === 'MultiPolygon'
      ? feature.geometry.coordinates
      : [];
}
function lines(feature: WorldFeature): LonLat[][] {
  return feature.geometry.type === 'LineString'
    ? [feature.geometry.coordinates]
    : feature.geometry.type === 'MultiLineString'
      ? feature.geometry.coordinates
      : polygonRings(feature).flat();
}
function denseLine(
  coordinates: LonLat[],
  context: WorldObjectContext,
  spacing: number,
) {
  const points: THREE.Vector3[] = [];
  for (let i = 1; i < coordinates.length; i++) {
    const a = coordinates[i - 1],
      b = coordinates[i],
      distance = context.project(...a).distanceTo(context.project(...b));
    const count = Math.max(1, Math.ceil(distance / spacing));
    for (let j = 0; j < count; j++)
      points.push(
        context.project(
          a[0] + ((b[0] - a[0]) * j) / count,
          a[1] + ((b[1] - a[1]) * j) / count,
        ),
      );
  }
  points.push(context.project(...coordinates[coordinates.length - 1]));
  return points;
}

/** Builds source-aligned objects in renderer coordinates. heightAt returns absolute metres above sea level. */
function* assembleWorldObjects(
  input: WorldFeatures | WorldFeature[],
  context: WorldObjectContext,
  resources: BuildResources,
) {
  const features = Array.isArray(input) ? input : input.features;
  const group = new THREE.Group();
  group.name = 'Mapped objects and illustrative detail';
  const buildingGroup = new THREE.Group(),
    ruinGroup = new THREE.Group(),
    treeGroup = new THREE.Group(),
    vegetationGroup = new THREE.Group(),
    roadsGroup = new THREE.Group();
  group.add(buildingGroup, ruinGroup, treeGroup, vegetationGroup, roadsGroup);
  const sites = resources.sites;
  const siteMeshes: THREE.Mesh[] = [];
  const materials = resources.materials,
    geometries = resources.geometries;
  const walls: Parts = [],
    roofs: Parts = [],
    ruins: Parts = [],
    plants: Parts = [];
  const windowVertices: number[] = [],
    roadFaces: number[] = [],
    pathFaces: number[] = [],
    stripeFaces: number[] = [];
  resources.parts.push(walls, roofs, ruins, plants);
  let sliceStarted = performance.now();
  const obstacles = new Map<string, Roof[]>();
  const roadBins = new Map<
    string,
    { a: THREE.Vector3; b: THREE.Vector3; width: number }[]
  >();
  const water = features
    .filter((f) => f.properties.kind === 'water')
    .flatMap(polygonRings);
  const roadBinKey = (x: number, z: number) =>
    `${Math.floor(x / 100)}/${Math.floor(z / 100)}`;
  function onRoad(p: THREE.Vector3) {
    return (roadBins.get(roadBinKey(p.x, p.z)) ?? []).some(
      ({ a, b, width }) => {
        const dx = b.x - a.x,
          dz = b.z - a.z;
        const along = THREE.MathUtils.clamp(
          ((p.x - a.x) * dx + (p.z - a.z) * dz) / (dx * dx + dz * dz),
          0,
          1,
        );
        return (
          Math.hypot(p.x - a.x - along * dx, p.z - a.z - along * dz) <
          width / 2 + 1.5
        );
      },
    );
  }
  const rng = seeded(features[0]?.id ?? context.area);
  const center = new THREE.Vector3();
  let centerCount = 0;
  const material = (roughness: number) => {
    const item = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness,
      side: THREE.DoubleSide,
    });
    materials.push(item);
    return item;
  };
  const masonryMaterial = material(0.96),
    roofMaterial = material(0.85),
    roadMaterial = material(0.95),
    plantMaterial = material(1);
  const windowMaterial = new THREE.MeshStandardMaterial({
    color: '#52625b',
    emissive: '#ffc66d',
    emissiveIntensity: 0,
    roughness: 0.45,
  });
  materials.push(windowMaterial);
  const reveal = { value: 0 };
  for (const surface of [
    masonryMaterial,
    roofMaterial,
    roadMaterial,
    plantMaterial,
    windowMaterial,
  ]) {
    surface.onBeforeCompile = (shader) => {
      shader.uniforms.objectReveal = reveal;
      if (surface === masonryMaterial || surface === roofMaterial) {
        shader.vertexShader =
          'attribute float finish; varying float surfaceFinish; varying vec3 surfacePosition; varying vec3 surfaceDirection;\n' +
          shader.vertexShader;
        shader.vertexShader = shader.vertexShader.replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
          surfacePosition = position; surfaceDirection = normal; surfaceFinish = finish;`,
        );
        shader.fragmentShader =
          'varying float surfaceFinish; varying vec3 surfacePosition; varying vec3 surfaceDirection;\n' +
          shader.fragmentShader;
        shader.fragmentShader = shader.fragmentShader.replace(
          '#include <color_fragment>',
          `#include <color_fragment>
          vec3 p = surfacePosition;
          float grain = fract(sin(dot(floor(p * 13.0), vec3(12.989, 78.233, 31.731))) * 43758.54);
          float closeDetail = 1.0 - smoothstep(180.0, 650.0, length(vViewPosition));
          float variation = .94 + grain * .12 * closeDetail;
          ${
            surface === roofMaterial
              ? `
          vec2 uv = p.xz;
          float rows = floor(uv.y / .42);
          float tile = fract(uv.x / .28 + mod(rows, 2.0) * .5);
          float grout = smoothstep(.02, .09, tile) * (1.0 - smoothstep(.91, .98, tile));
          float seams = smoothstep(.02, .1, fract(uv.y / .42));
          float ribs = .91 + .09 * sin(uv.x * 25.0);
          float roofTexture = surfaceFinish > 1.5 ? ribs : .8 + .2 * grout * seams;
          variation *= mix(1.0, roofTexture, closeDetail);
          `
              : `
          float along = abs(surfaceDirection.x) > abs(surfaceDirection.z) ? p.z : p.x;
          float rows = floor(p.y / .24);
          vec2 bricks = fract(vec2(along / .5 + mod(rows, 2.0) * .5, p.y / .24));
          float mortar = smoothstep(.02, .07, bricks.x) * smoothstep(.025, .12, bricks.y);
          float masonry = surfaceFinish > .5 ? .82 + .18 * mortar : .98 + .02 * sin(p.y * 3.0 + along);
          variation *= mix(1.0, masonry, closeDetail);
          `
          }
          diffuseColor.rgb *= variation;
        `,
        );
      }
      shader.fragmentShader =
        'uniform float objectReveal;\n' + shader.fragmentShader;
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <dithering_fragment>',
        `#include <dithering_fragment>
        if (fract(sin(dot(floor(gl_FragCoord.xy), vec2(12.9898, 78.233))) * 43758.5453) > objectReveal) discard;`,
      );
    };
    surface.customProgramCacheKey = () =>
      `world-object-textured-${surface === roofMaterial ? 'roof' : surface === masonryMaterial ? 'wall' : 'plain'}`;
  }
  let revealStart: number | undefined;
  function mesh(parts: Parts, target: THREE.Group, surface: THREE.Material) {
    if (!parts.length) return;
    const geometry = mergeGeometries(parts)!;
    geometries.push(geometry);
    let faceStart = 0;
    const picks = parts
      .map((part) => {
        const start = faceStart;
        faceStart += part.attributes.position.count / 3;
        return {
          start,
          end: faceStart,
          feature: part.userData.feature as WorldFeature | undefined,
        };
      })
      .filter((range) => range.feature);
    for (const part of parts) part.dispose();
    const item = new THREE.Mesh(geometry, surface);
    item.userData.picks = picks;
    item.castShadow = true;
    item.receiveShadow = true;
    target.add(item);
  }
  function addBuilding(feature: WorldFeature) {
    const wallStart = walls.length,
      roofStart = roofs.length;
    const appearance = buildingAppearance(feature);
    for (const geographicRings of polygonRings(feature)) {
      const rings = geographicRings.map((ring) =>
        ring.map((p) => context.project(...p)),
      );
      const outer = rings[0],
        outline = outer.slice(0, -1),
        height =
          feature.properties.buildingType === 'roof'
            ? (feature.properties.height ?? 3.2)
            : buildingHeight(feature.properties);
      const ground = foundation(
        outer.map((p) => p.y),
        height,
      );
      const absolute = foundation(
        geographicRings[0].map((p) => context.elevation(...p)),
        height,
      );
      const ring = geographicRings[0];
      let west = Infinity,
        east = -Infinity,
        south = Infinity,
        north = -Infinity;
      for (const [lon, lat] of ring) {
        west = Math.min(west, lon);
        east = Math.max(east, lon);
        south = Math.min(south, lat);
        north = Math.max(north, lat);
      }
      const obstacle = { ring, top: absolute.top };
      for (let x = Math.floor(west * 1000); x <= Math.floor(east * 1000); x++)
        for (
          let y = Math.floor(south * 1000);
          y <= Math.floor(north * 1000);
          y++
        ) {
          const key = `${x}/${y}`;
          if (!obstacles.has(key)) obstacles.set(key, []);
          obstacles.get(key)!.push(obstacle);
        }
      const flat = feature.properties.roofShape === 'flat';
      const rise = flat ? 0 : Math.min(2.2, height * 0.23),
        eave = ground.top - rise;
      const plaster = new THREE.Color(appearance.wall);
      const shelter = feature.properties.buildingType === 'roof';
      if (shelter) {
        for (const corner of outline) {
          const post = new THREE.CylinderGeometry(
            0.12,
            0.15,
            eave - corner.y,
            6,
          );
          post.translate(corner.x, (eave + corner.y) / 2, corner.z);
          walls.push(painted(post, '#6e6048'));
        }
      } else {
        walls.push(
          extruded(
            rings,
            ground.bottom,
            ground.base - ground.bottom,
            '#807764',
          ),
        );
        walls.push(extruded(rings, ground.base, height - rise, plaster));
      }
      if (flat) roofs.push(extruded(rings, ground.top, 0.12, appearance.roof));
      else if (
        geographicRings.length > 1 ||
        !supportsPitchedRoof(geographicRings[0])
      ) {
        const fitted = pitchedRoof(rings, eave, rise);
        roofs.push(triangles(fitted.roof, appearance.roof));
        if (!shelter) walls.push(triangles(fitted.gables, plaster));
      } else {
        const tint = new THREE.Color(appearance.roof);
        const centroid = outline
          .reduce((sum, p) => sum.add(p), new THREE.Vector3())
          .multiplyScalar(1 / outline.length);
        centroid.y = ground.top;
        if (outline.length === 4 && feature.properties.roofShape !== 'hipped') {
          const edgeA = outline[0].distanceTo(outline[1]),
            edgeB = outline[1].distanceTo(outline[2]);
          const p =
            edgeA > edgeB
              ? [outline[1], outline[2], outline[3], outline[0]]
              : outline;
          const start = p[0]
              .clone()
              .add(p[1])
              .multiplyScalar(0.5)
              .setY(ground.top),
            end = p[2].clone().add(p[3]).multiplyScalar(0.5).setY(ground.top);
          const low = p.map((v) => v.clone().setY(eave));
          roofs.push(
            quad(low[1], low[2], end, start, tint),
            quad(low[3], low[0], start, end, tint),
          );
          if (!shelter)
            walls.push(
              triangles(
                [...low[0], ...low[1], ...start, ...low[2], ...low[3], ...end],
                plaster,
              ),
            );
        } else {
          for (let i = 0; i < outline.length; i++)
            roofs.push(
              triangles(
                [
                  ...outline[i].clone().setY(eave),
                  ...outline[(i + 1) % outline.length].clone().setY(eave),
                  ...centroid,
                ],
                tint,
              ),
            );
        }
      }
      const floors = shelter ? 0 : (feature.properties.levels ?? 2);
      for (let edge = 1; edge < outer.length; edge++) {
        const a = outer[edge - 1],
          b = outer[edge],
          along = b.clone().sub(a).setY(0),
          length = along.length();
        along.normalize();
        const outward = new THREE.Vector3(along.z, 0, -along.x).multiplyScalar(
          0.04,
        );
        for (let floor = 0; floor < floors; floor++)
          for (let x = 1.7; x < length - 1.2; x += 3.2) {
            const start = a
              .clone()
              .addScaledVector(along, x)
              .add(outward)
              .setY(ground.base + ((height - rise) * (floor + 0.43)) / floors);
            const endX = start.x + along.x * 0.8,
              endZ = start.z + along.z * 0.8,
              top = start.y + 0.95;
            windowVertices.push(
              start.x,
              start.y,
              start.z,
              endX,
              start.y,
              endZ,
              endX,
              top,
              endZ,
              start.x,
              top,
              start.z,
            );
          }
      }
      center.add(outline[0]);
      centerCount++;
    }
    for (const geometry of walls.slice(wallStart)) {
      geometry.userData.feature = feature;
      (geometry.attributes.finish.array as Float32Array).fill(
        appearance.wallFinish === 'brick' ? 1 : 0,
      );
    }
    for (const geometry of roofs.slice(roofStart)) {
      geometry.userData.feature = feature;
      (geometry.attributes.finish.array as Float32Array).fill(
        appearance.roofFinish === 'metal' ? 2 : 0,
      );
    }
  }
  function addStonework(feature: WorldFeature) {
    const start = ruins.length;
    const terrace = feature.properties.kind === 'terrace',
      height = feature.properties.height ?? (terrace ? 1.6 : 2.1);
    let sampleHeight: ((x: number, z: number) => number) | undefined;
    if (context.bounds) {
      const [west, south, east, north] = context.bounds;
      const nw = context.project(west, north),
        se = context.project(east, south);
      sampleHeight = (x, z) =>
        context.project(
          west + ((x - nw.x) / (se.x - nw.x)) * (east - west),
          north + ((z - nw.z) / (se.z - nw.z)) * (south - north),
        ).y;
    }
    for (const line of lines(feature)) {
      const points = denseLine(line, context, 3);
      for (let i = 1; i < points.length; i++) {
        const a = points[i - 1],
          b = points[i],
          direction = b.clone().sub(a).setY(0),
          width = terrace ? 0.42 : 0.55;
        const normal = new THREE.Vector3(direction.z, 0, -direction.x)
          .normalize()
          .multiplyScalar(width);
        const a0 = a.clone().sub(normal),
          a1 = a.clone().add(normal),
          b0 = b.clone().sub(normal),
          b1 = b.clone().add(normal);
        const raised = (v: THREE.Vector3) =>
          v.clone().add(new THREE.Vector3(0, height, 0));
        const color = new THREE.Color().setHSL(0.1, 0.09, 0.35 + rng() * 0.13);
        ruins.push(
          quad(a0, b0, raised(b0), raised(a0), color),
          quad(b1, a1, raised(a1), raised(b1), color),
          quad(raised(a0), raised(b0), raised(b1), raised(a1), '#a09b85'),
        );
        if (terrace && sampleHeight) {
          const section = terraceSection(
            a.toArray(),
            b.toArray(),
            sampleHeight,
            height,
          );
          const point = (p: [number, number, number]) =>
            new THREE.Vector3(...p);
          ruins.push(
            quad(
              point(section.frontA),
              point(section.frontB),
              point(section.backB),
              point(section.backA),
              '#929164',
            ),
            quad(
              point(section.backA),
              point(section.backB),
              point(section.groundB),
              point(section.groundA),
              '#847a5d',
            ),
          );
        }
        // Recessed horizontal courses give stonework a readable scale without fictional masonry plans.
        for (let level = 0.55; level < height; level += 0.55) {
          const aa = a1.clone().add(new THREE.Vector3(0, level, 0)),
            bb = b1.clone().add(new THREE.Vector3(0, level, 0));
          ruins.push(
            quad(
              aa,
              bb,
              bb.clone().add(new THREE.Vector3(0, 0.028, 0)),
              aa.clone().add(new THREE.Vector3(0, 0.028, 0)),
              '#686959',
            ),
          );
        }
      }
    }
    for (const geometry of ruins.slice(start))
      geometry.userData.feature = feature;
  }
  for (const feature of features) {
    if (performance.now() - sliceStarted >= 8) {
      yield;
      sliceStarted = performance.now();
    }
    const kind = feature.properties.kind;
    if (kind === 'building') addBuilding(feature);
    if (
      (kind === 'saltpan' || kind === 'airfield' || kind === 'aeroway') &&
      context.bounds
    ) {
      const site =
        kind === 'aeroway'
          ? createAirportSurface(feature, context)
          : createSiteSurface(feature, context);
      sites.push(site);
      roadsGroup.add(site.mesh);
      site.mesh.traverse((object) => {
        if (object instanceof THREE.Mesh) {
          object.userData.picks = [
            {
              start: 0,
              end:
                (object.geometry.index?.count ??
                  object.geometry.attributes.position.count) / 3,
              feature,
            },
          ];
          siteMeshes.push(object);
        }
      });
    }
    if (kind === 'ruin' || kind === 'terrace') addStonework(feature);
    if (kind === 'road' || kind === 'path') {
      const path = kind === 'path',
        width = path
          ? 1.1
          : feature.properties.highway === 'service'
            ? 3.4
            : 5.2;
      for (const line of lines(feature)) {
        const points = denseLine(line, context, path ? 6 : 10);
        for (let i = 1; i < points.length; i++) {
          const a = points[i - 1].clone().add(new THREE.Vector3(0, 0.18, 0)),
            b = points[i].clone().add(new THREE.Vector3(0, 0.18, 0));
          const normal = new THREE.Vector3(b.z - a.z, 0, a.x - b.x)
            .normalize()
            .multiplyScalar(width / 2);
          const segment = { a, b, width };
          for (
            let x = Math.floor((Math.min(a.x, b.x) - width) / 100);
            x <= Math.floor((Math.max(a.x, b.x) + width) / 100);
            x++
          )
            for (
              let z = Math.floor((Math.min(a.z, b.z) - width) / 100);
              z <= Math.floor((Math.max(a.z, b.z) + width) / 100);
              z++
            ) {
              const key = `${x}/${z}`;
              if (!roadBins.has(key)) roadBins.set(key, []);
              roadBins.get(key)!.push(segment);
            }
          appendQuad(
            path ? pathFaces : roadFaces,
            a.clone().sub(normal),
            b.clone().sub(normal),
            b.clone().add(normal),
            a.clone().add(normal),
          );
          if (
            !path &&
            i % 3 === 0 &&
            feature.properties.highway !== 'service'
          ) {
            normal.normalize().multiplyScalar(0.045);
            a.y += 0.015;
            b.y += 0.015;
            appendQuad(
              stripeFaces,
              a.clone().sub(normal),
              b.clone().sub(normal),
              b.clone().add(normal),
              a.clone().add(normal),
            );
          }
        }
      }
    }
    if (kind === 'farmland')
      for (const polygon of polygonRings(feature)) {
        const ring = polygon[0];
        const samples = ring.map((p) => context.project(...p));
        const min = new THREE.Vector3(Infinity, Infinity, Infinity),
          max = new THREE.Vector3(-Infinity, -Infinity, -Infinity);
        samples.forEach((p) => {
          min.min(p);
          max.max(p);
        });
        let west = Infinity,
          east = -Infinity,
          south = Infinity,
          north = -Infinity;
        for (const [lon, lat] of ring) {
          west = Math.min(west, lon);
          east = Math.max(east, lon);
          south = Math.min(south, lat);
          north = Math.max(north, lat);
        }
        const stalkCount = Math.min(
          180,
          Math.ceil(((max.x - min.x) * (max.z - min.z)) / 150),
        );
        for (let i = 0; i < stalkCount; i++) {
          const geo: LonLat = [
            west + rng() * (east - west),
            south + rng() * (north - south),
          ];
          if (
            !insideRing(geo, ring) ||
            polygon.slice(1).some((hole) => insideRing(geo, hole))
          )
            continue;
          const p = context.project(...geo),
            height = 0.4 + rng() * 0.5,
            tint = new THREE.Color().setHSL(0.17 + rng() * 0.06, 0.24, 0.36);
          plants.push(
            triangles(
              [
                p.x - 0.3,
                p.y,
                p.z,
                p.x,
                p.y + height,
                p.z,
                p.x + 0.3,
                p.y,
                p.z,
                p.x,
                p.y,
                p.z - 0.3,
                p.x,
                p.y + height,
                p.z,
                p.x,
                p.y,
                p.z + 0.3,
              ],
              tint,
            ),
          );
        }
      }
  }
  yield;
  mesh(walls, buildingGroup, masonryMaterial);
  yield;
  mesh(roofs, buildingGroup, roofMaterial);
  yield;
  if (windowVertices.length) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(windowVertices, 3),
    );
    const count = windowVertices.length / 3;
    const indices =
      count > 65535
        ? new Uint32Array((count / 4) * 6)
        : new Uint16Array((count / 4) * 6);
    for (let i = 0, offset = 0; i < count; i += 4, offset += 6) {
      indices[offset] = i;
      indices[offset + 1] = i + 1;
      indices[offset + 2] = i + 2;
      indices[offset + 3] = i;
      indices[offset + 4] = i + 2;
      indices[offset + 5] = i + 3;
    }
    geometry.setIndex(new THREE.BufferAttribute(indices, 1));
    geometry.computeVertexNormals();
    geometries.push(geometry);
    const windows = new THREE.Mesh(geometry, windowMaterial);
    windows.name = 'Building windows';
    windows.userData.picks = [];
    windows.castShadow = true;
    windows.receiveShadow = true;
    buildingGroup.add(windows);
  }
  yield;
  mesh(ruins, ruinGroup, masonryMaterial);
  yield;
  const roads: Parts = [];
  if (roadFaces.length) roads.push(triangles(roadFaces, '#797a70'));
  if (pathFaces.length) roads.push(triangles(pathFaces, '#b5a281'));
  if (stripeFaces.length) roads.push(triangles(stripeFaces, '#c3bd99'));
  mesh(roads, roadsGroup, roadMaterial);
  mesh(plants, vegetationGroup, plantMaterial);
  yield;
  const treeFeatures = features.filter(
    (f) => f.properties.kind === 'tree' && f.geometry.type === 'Point',
  );
  const trunkGeometry = new THREE.CylinderGeometry(0.12, 0.22, 1, 6),
    crownGeometry = new THREE.IcosahedronGeometry(1, 0),
    detailGeometry = new THREE.IcosahedronGeometry(1, 1);
  geometries.push(trunkGeometry, crownGeometry, detailGeometry);
  const trunkMaterial = new THREE.MeshStandardMaterial({
    color: '#6d6250',
    roughness: 1,
  });
  materials.push(trunkMaterial);
  const leafMaterial = new THREE.MeshStandardMaterial({
    color: '#ffffff',
    roughness: 1,
  });
  materials.push(leafMaterial);
  const nearLeafMaterial = leafMaterial.clone();
  materials.push(nearLeafMaterial);
  const windTime = { value: 0 };
  function nearFade(surface: THREE.MeshStandardMaterial, wind: boolean) {
    surface.onBeforeCompile = (shader) => {
      shader.uniforms.worldObjectTime = windTime;
      shader.vertexShader =
        'uniform float worldObjectTime; varying float objectDistance;\n' +
        shader.vertexShader;
      shader.vertexShader = shader.vertexShader.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vec4 localWorldPosition = modelMatrix * instanceMatrix * vec4(transformed, 1.0);
        objectDistance = distance(cameraPosition, localWorldPosition.xyz);
        ${wind ? 'transformed.x += sin(worldObjectTime * 1.1 + localWorldPosition.x * .08) * .05; transformed.z += cos(worldObjectTime * .8 + localWorldPosition.z * .06) * .04;' : ''}`,
      );
      shader.fragmentShader =
        'varying float objectDistance;\n' + shader.fragmentShader;
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <dithering_fragment>',
        `#include <dithering_fragment>
        float detailFade = 1.0 - smoothstep(430.0, 680.0, objectDistance);
        float grain = fract(sin(dot(floor(gl_FragCoord.xy), vec2(12.9898, 78.233))) * 43758.5453);
        if (grain > detailFade) discard;`,
      );
    };
    surface.customProgramCacheKey = () =>
      `world-near-${wind ? 'wind' : 'trunk'}`;
  }
  nearFade(nearLeafMaterial, true);
  nearFade(trunkMaterial, false);
  const nearCapacity = Math.min(2400, treeFeatures.length);
  const trunks = new THREE.InstancedMesh(
      trunkGeometry,
      trunkMaterial,
      nearCapacity,
    ),
    crowns = new THREE.InstancedMesh(
      crownGeometry,
      leafMaterial,
      treeFeatures.length,
    ),
    details = new THREE.InstancedMesh(
      detailGeometry,
      nearLeafMaterial,
      nearCapacity * 3,
    );
  treeGroup.add(trunks, crowns, details);
  trunks.count = 0;
  details.count = 0;
  const transform = new THREE.Object3D(),
    tint = new THREE.Color();
  const treeRecords: {
    position: THREE.Vector3;
    height: number;
    radius: number;
    tint: THREE.Color;
    angle: number;
  }[] = [];
  for (let i = 0; i < treeFeatures.length; i++) {
    if (performance.now() - sliceStarted >= 8) {
      yield;
      sliceStarted = performance.now();
    }
    const feature = treeFeatures[i];
    if (feature.geometry.type !== 'Point') continue;
    const p = context.project(...feature.geometry.coordinates),
      height = feature.properties.height ?? 8 + rng() * 9,
      radius = height * (0.17 + rng() * 0.09),
      angle = rng() * 6;
    if (!centerCount) {
      center.add(p);
      centerCount++;
    }
    transform.position.copy(p).add(new THREE.Vector3(0, height * 0.63, 0));
    transform.scale.set(radius, height * 0.36, radius * 0.85);
    transform.rotation.set(0, angle, 0);
    transform.updateMatrix();
    crowns.setMatrixAt(i, transform.matrix);
    tint
      .set(
        ['#264d35', '#325e3d', '#356d43', '#3f7046', '#285d45'][
          Math.floor(rng() * 5)
        ],
      )
      .multiplyScalar(0.85 + rng() * 0.25);
    crowns.setColorAt(i, tint);
    treeRecords.push({
      position: p,
      height,
      radius,
      tint: tint.clone(),
      angle,
    });
  }
  crowns.castShadow = true;
  crowns.receiveShadow = true;
  crowns.computeBoundingSphere();
  let lastTreeCamera = new THREE.Vector3(Infinity, Infinity, Infinity);
  function updateNearTrees(camera: THREE.Camera) {
    if (lastTreeCamera.distanceToSquared(camera.position) < 1600) return;
    lastTreeCamera = camera.position.clone();
    const nearby = treeRecords
      .map((tree) => ({
        tree,
        distance: tree.position.distanceToSquared(camera.position),
      }))
      .filter(({ distance }) => distance < 720 ** 2)
      .sort((a, b) => a.distance - b.distance)
      .slice(0, nearCapacity);
    trunks.count = nearby.length;
    details.count = nearby.length * 3;
    nearby.forEach(({ tree }, i) => {
      const { position: p, height, radius, tint: color, angle } = tree;
      transform.position.copy(p).add(new THREE.Vector3(0, height * 0.26, 0));
      transform.scale.set(height * 0.065, height * 0.52, height * 0.065);
      transform.rotation.set(0, angle, 0);
      transform.updateMatrix();
      trunks.setMatrixAt(i, transform.matrix);
      for (let cluster = 0; cluster < 3; cluster++) {
        const phase = angle + cluster * 2.094;
        transform.position
          .copy(p)
          .add(
            new THREE.Vector3(
              Math.cos(phase) * radius * 0.42,
              height * (0.62 + cluster * 0.045),
              Math.sin(phase) * radius * 0.42,
            ),
          );
        transform.scale.set(
          radius * 0.8,
          height * (0.27 - cluster * 0.015),
          radius * 0.72,
        );
        transform.rotation.set(0.08 * cluster, phase, -0.06 * cluster);
        transform.updateMatrix();
        details.setMatrixAt(i * 3 + cluster, transform.matrix);
        details.setColorAt(
          i * 3 + cluster,
          color.clone().multiplyScalar(1.06 + cluster * 0.035),
        );
      }
    });
    for (const instances of [trunks, details]) {
      instances.instanceMatrix.needsUpdate = true;
      if (instances.instanceColor) instances.instanceColor.needsUpdate = true;
      instances.castShadow = true;
      instances.receiveShadow = true;
      instances.computeBoundingSphere();
    }
  }
  let groundCoverActive = false;
  let updateGroundcover = (_camera: THREE.Camera) => {};
  if (context.bounds && context.landcover) {
    const [west, south, east, north] = context.bounds;
    const nw = context.project(west, north),
      se = context.project(east, south),
      classify = context.landcover.bind(context);
    const grassParts: Parts = [];
    for (let blade = 0; blade < 7; blade++) {
      const angle = blade * 2.399,
        dx = Math.cos(angle),
        dz = Math.sin(angle),
        height = 0.4 + (blade % 3) * 0.14;
      grassParts.push(
        triangles(
          [
            dx * 0.25,
            0,
            dz * 0.25,
            dx * 0.13,
            height * 0.55,
            dz * 0.13,
            -dz * 0.07,
            0,
            dx * 0.07,
            dx * 0.13,
            height * 0.55,
            dz * 0.13,
            dx * 0.3,
            height,
            dz * 0.3,
            -dz * 0.035,
            height * 0.48,
            dx * 0.035,
          ],
          '#8b9962',
        ),
      );
    }
    const grassGeometry = mergeGeometries(grassParts)!;
    grassParts.forEach((part) => part.dispose());
    const shrubGeometry = new THREE.IcosahedronGeometry(1, 1);
    shrubGeometry.scale(0.75, 0.55, 0.68);
    shrubGeometry.translate(0, 0.5, 0);
    geometries.push(grassGeometry, shrubGeometry);
    const grassMaterial = new THREE.MeshStandardMaterial({
        color: '#ffffff',
        vertexColors: true,
        roughness: 1,
        side: THREE.DoubleSide,
      }),
      shrubMaterial = new THREE.MeshStandardMaterial({
        color: '#728251',
        roughness: 1,
      });
    materials.push(grassMaterial, shrubMaterial);
    for (const surface of [grassMaterial, shrubMaterial]) {
      surface.onBeforeCompile = (shader) => {
        shader.uniforms.worldObjectTime = windTime;
        shader.vertexShader =
          'uniform float worldObjectTime; varying float plantDistance;\n' +
          shader.vertexShader;
        shader.vertexShader = shader.vertexShader.replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
          vec4 plantWorld = modelMatrix * instanceMatrix * vec4(transformed, 1.0);
          plantDistance = distance(cameraPosition, plantWorld.xyz);
          transformed.x += sin(worldObjectTime * 1.7 + plantWorld.x * .7 + plantWorld.z * .4) * transformed.y * .1;`,
        );
        shader.fragmentShader =
          'varying float plantDistance;\n' + shader.fragmentShader;
        shader.fragmentShader = shader.fragmentShader.replace(
          '#include <dithering_fragment>',
          `#include <dithering_fragment>
          float grassFade = 1.0 - smoothstep(65.0, 105.0, plantDistance);
          if (fract(sin(dot(floor(gl_FragCoord.xy), vec2(12.9898, 78.233))) * 43758.5453) > grassFade) discard;`,
        );
      };
      surface.customProgramCacheKey = () => 'world-groundcover-wind';
    }
    const grass = new THREE.InstancedMesh(grassGeometry, grassMaterial, 3500),
      shrubs = new THREE.InstancedMesh(shrubGeometry, shrubMaterial, 600);
    grass.name = 'WorldCover grass';
    shrubs.name = 'WorldCover shrubs';
    grass.count = 0;
    shrubs.count = 0;
    grass.receiveShadow = true;
    shrubs.receiveShadow = true;
    vegetationGroup.add(grass, shrubs);
    const oldPosition = new THREE.Vector3(Infinity, Infinity, Infinity);
    updateGroundcover = (camera) => {
      if (oldPosition.distanceToSquared(camera.position) < 225) return;
      oldPosition.copy(camera.position);
      grass.count = 0;
      shrubs.count = 0;
      groundCoverActive = false;
      if (
        camera.position.x + 105 <= nw.x ||
        camera.position.x - 105 >= se.x ||
        camera.position.z + 105 <= nw.z ||
        camera.position.z - 105 >= se.z
      )
        return;
      const nearbyGround = context.project(
        west + ((camera.position.x - nw.x) / (se.x - nw.x)) * (east - west),
        north + ((camera.position.z - nw.z) / (se.z - nw.z)) * (south - north),
      );
      if (camera.position.y - nearbyGround.y > 110) return;
      const centerX = Math.round(camera.position.x / 3) * 3,
        centerZ = Math.round(camera.position.z / 3) * 3;
      for (let x = centerX - 102; x <= centerX + 102; x += 3)
        for (let z = centerZ - 102; z <= centerZ + 102; z += 3) {
          if (
            (x - camera.position.x) ** 2 + (z - camera.position.z) ** 2 >
            105 ** 2
          )
            continue;
          const lon = west + ((x - nw.x) / (se.x - nw.x)) * (east - west),
            lat = north + ((z - nw.z) / (se.z - nw.z)) * (south - north);
          if (lon <= west || lon >= east || lat <= south || lat >= north)
            continue;
          const cover = classify(lon, lat);
          if (cover !== 20 && cover !== 30) continue;
          if (
            (obstacles.get(binKey(lon, lat)) ?? []).some(({ ring }) =>
              insideRing([lon, lat], ring),
            ) ||
            water.some((polygon) => insideRing([lon, lat], polygon[0]))
          )
            continue;
          const p = context.project(lon, lat);
          if (onRoad(p)) continue;
          const random = seeded(`${x}/${z}`),
            shrub = cover === 20 && random() > 0.55,
            instances = shrub ? shrubs : grass;
          if (instances.count >= (shrub ? 600 : 3500)) continue;
          transform.position.copy(p);
          transform.rotation.set(0, random() * Math.PI * 2, 0);
          transform.scale.setScalar(0.7 + random() * 0.6);
          transform.updateMatrix();
          instances.setMatrixAt(instances.count++, transform.matrix);
        }
      groundCoverActive = grass.count + shrubs.count > 0;
      for (const instances of [grass, shrubs]) {
        instances.instanceMatrix.needsUpdate = true;
        instances.computeBoundingSphere();
      }
    };
  }
  if (centerCount) center.multiplyScalar(1 / centerCount);
  const life = createWorldLife(features, context);
  group.add(life.group);
  return {
    group,
    update(options: WorldOptions, time: number, camera: THREE.Camera) {
      revealStart ??= time;
      reveal.value =
        options.worldPaused || context.reducedMotion
          ? 1
          : Math.min(1, (time - revealStart) / 1.2);
      buildingGroup.visible = options.buildings;
      ruinGroup.visible = options.ruins;
      treeGroup.visible = options.trees;
      vegetationGroup.visible = options.vegetation;
      if (options.trees) updateNearTrees(camera);
      if (options.vegetation) updateGroundcover(camera);
      if (!options.worldPaused && !context.reducedMotion) windTime.value = time;
      const night = THREE.MathUtils.smoothstep(
        Math.abs(options.timeOfDay - 12),
        5.5,
        7.5,
      );
      windowMaterial.emissiveIntensity = night * 1.7;
      windowMaterial.color.set(night > 0.5 ? '#d6a966' : '#52625b');
      const movingLife = life.update(options, time, camera);
      return (
        reveal.value < 1 ||
        movingLife ||
        (((options.trees && details.count > 0) ||
          (options.vegetation && groundCoverActive)) &&
          !options.worldPaused &&
          !context.reducedMotion)
      );
    },
    pick(raycaster: THREE.Raycaster) {
      const candidates = [
        ...siteMeshes,
        ...(buildingGroup.visible ? buildingGroup.children : []),
        ...(ruinGroup.visible ? ruinGroup.children : []),
      ];
      const hit = raycaster.intersectObjects(candidates, false).find((hit) => {
        const ranges = hit.object.userData.picks as {
          start: number;
          end: number;
          feature: WorldFeature;
        }[];
        return ranges.some(
          (range) =>
            hit.faceIndex! >= range.start && hit.faceIndex! < range.end,
        );
      });
      if (!hit) return;
      const ranges = hit.object.userData.picks as {
        start: number;
        end: number;
        feature: WorldFeature;
      }[];
      const range = ranges.find(
        (range) => hit.faceIndex! >= range.start && hit.faceIndex! < range.end,
      )!;
      return {
        feature: range.feature,
        point: hit.point,
        distance: hit.distance,
      };
    },
    heightAt(lon: number, lat: number) {
      let height = context.elevation(lon, lat);
      for (const obstacle of obstacles.get(binKey(lon, lat)) ?? [])
        if (insideRing([lon, lat], obstacle.ring))
          height = Math.max(height, obstacle.top);
      for (const site of sites)
        height = Math.max(height, site.heightAt(lon, lat));
      return height;
    },
    dispose() {
      life.dispose();
      sites.forEach((site) => site.dispose());
      for (const geometry of geometries) geometry.dispose();
      for (const item of materials) item.dispose();
      group.clear();
      group.removeFromParent();
    },
  };
}

type BuildResources = {
  parts: Parts[];
  geometries: THREE.BufferGeometry[];
  materials: THREE.Material[];
  sites: ReturnType<typeof createSiteSurface>[];
};
function* buildWorldObjects(
  input: WorldFeatures | WorldFeature[],
  context: WorldObjectContext,
) {
  const resources: BuildResources = {
    parts: [],
    geometries: [],
    materials: [],
    sites: [],
  };
  let delivered = false;
  try {
    const objects = yield* assembleWorldObjects(input, context, resources);
    delivered = true;
    return objects;
  } finally {
    if (!delivered) {
      for (const geometry of new Set([
        ...resources.geometries,
        ...resources.parts.flat(),
      ]))
        geometry.dispose();
      for (const material of resources.materials) material.dispose();
      for (const site of resources.sites) site.dispose();
    }
  }
}

/** Synchronous construction for offline processing and focused geometry tests. */
export function createWorldObjects(
  input: WorldFeatures | WorldFeature[],
  context: WorldObjectContext,
) {
  const builder = buildWorldObjects(input, context);
  let step = builder.next();
  while (!step.done) step = builder.next();
  return step.value;
}

/** Build a tile in input-friendly chunks; cancelled tiles release their partial geometry. */
export async function createWorldObjectsAsync(
  input: WorldFeatures | WorldFeature[],
  context: WorldObjectContext,
  signal: AbortSignal,
) {
  signal.throwIfAborted();
  const builder = buildWorldObjects(input, context);
  try {
    let step = builder.next();
    while (!step.done) {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      signal.throwIfAborted();
      step = builder.next();
    }
    return step.value;
  } finally {
    builder.return(undefined!);
  }
}
