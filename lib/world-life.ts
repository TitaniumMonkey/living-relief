import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { WorldFeature, WorldOptions } from './world-types';
import {
  canDrive,
  grazingSlope,
  insideRing,
  routePosition,
  seeded,
  type LonLat,
} from './world-object-math.ts';

export type WorldObjectContext = {
  project(lon: number, lat: number): THREE.Vector3;
  elevation(lon: number, lat: number): number;
  area: string;
  reducedMotion?: boolean;
  bounds?: [number, number, number, number];
  landcover?(lon: number, lat: number): number;
};
type Route = { coordinates: LonLat[]; lengths: number[]; total: number };
type Actor = {
  mesh: THREE.Mesh;
  route?: Route;
  origin?: LonLat;
  field?: LonLat[];
  holes?: LonLat[][];
  speed: number;
  phase: number;
  kind: 'animal' | 'person' | 'vehicle' | 'bird';
};

function piece(
  geometry: THREE.BufferGeometry,
  color: string,
  position: number[],
  scale = [1, 1, 1],
  rotation = [0, 0, 0],
) {
  geometry.scale(...(scale as [number, number, number]));
  geometry.rotateX(rotation[0]);
  geometry.rotateY(rotation[1]);
  geometry.rotateZ(rotation[2]);
  geometry.translate(...(position as [number, number, number]));
  const tint = new THREE.Color(color),
    colors = new Float32Array(geometry.attributes.position.count * 3);
  for (let i = 0; i < colors.length; i += 3) tint.toArray(colors, i);
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.deleteAttribute('uv');
  return geometry.index ? geometry.toNonIndexed() : geometry;
}
function model(
  kind: 'llama' | 'sheep' | 'cow' | 'person' | 'vehicle' | 'bird',
) {
  const parts: THREE.BufferGeometry[] = [];
  const sphere = (color: string, p: number[], s: number[]) =>
    parts.push(piece(new THREE.SphereGeometry(1, 8, 6), color, p, s));
  const box = (color: string, p: number[], s: number[]) =>
    parts.push(piece(new THREE.BoxGeometry(1, 1, 1), color, p, s));
  const rod = (
    color: string,
    p: number[],
    radius: number,
    height: number,
    rotation = [0, 0, 0],
  ) =>
    parts.push(
      piece(
        new THREE.CylinderGeometry(radius, radius * 0.9, height, 6),
        color,
        p,
        [1, 1, 1],
        rotation,
      ),
    );
  if (kind === 'person') {
    sphere('#b89170', [0, 1.58, 0], [0.14, 0.18, 0.14]);
    box('#ab684c', [0, 1.13, 0], [0.42, 0.65, 0.24]);
    for (const sign of [-1, 1]) {
      rod('#343e43', [sign * 0.11, 0.42, 0], 0.085, 0.76);
      rod('#ab684c', [sign * 0.28, 1.09, 0], 0.075, 0.56, [0, 0, sign * 0.12]);
      box('#332e29', [sign * 0.11, 0.06, 0.06], [0.16, 0.12, 0.29]);
    }
    box('#59634d', [0, 1.16, -0.17], [0.33, 0.45, 0.18]);
    rod('#cbb686', [0, 1.74, 0], 0.23, 0.055);
  } else if (kind === 'vehicle') {
    box('#eee1c5', [0, 0.7, 0], [1.7, 0.65, 3.7]);
    box('#e3d5b9', [0, 1.24, -0.2], [1.46, 0.55, 2.0]);
    box('#46616b', [0, 1.3, 0.815], [1.34, 0.41, 0.035]);
    box('#46616b', [0, 1.3, -1.215], [1.34, 0.41, 0.035]);
    for (const sign of [-1, 1]) {
      box('#46616b', [sign * 0.737, 1.3, -0.2], [0.025, 0.4, 1.77]);
      for (const z of [-1.18, 1.18])
        rod('#292b2a', [sign * 0.85, 0.39, z], 0.34, 0.22, [0, 0, Math.PI / 2]);
      box('#fff0b4', [sign * 0.55, 0.78, 1.86], [0.31, 0.15, 0.035]);
      box('#ac4a3c', [sign * 0.55, 0.78, -1.86], [0.28, 0.15, 0.035]);
    }
  } else if (kind === 'bird') {
    sphere('#4b4034', [0, 0, 0], [0.18, 0.12, 0.42]);
    sphere('#d5cbb6', [0, 0.08, 0.35], [0.11, 0.1, 0.16]);
    for (const sign of [-1, 1]) {
      const wing = new THREE.BufferGeometry();
      wing.setAttribute(
        'position',
        new THREE.Float32BufferAttribute(
          [0, 0, 0.16, sign * 1.35, 0.04, -0.12, sign * 0.36, 0, -0.45],
          3,
        ),
      );
      wing.computeVertexNormals();
      parts.push(piece(wing, '#5f4c39', [0, 0, 0]));
    }
  } else {
    const llama = kind === 'llama',
      cow = kind === 'cow';
    const coat = llama ? '#b49a73' : cow ? '#ebe1ca' : '#dfd7bd';
    const bodyY = llama ? 1.0 : cow ? 1.0 : 0.67;
    sphere(
      coat,
      [0, bodyY, 0],
      [cow ? 0.48 : 0.31, cow ? 0.52 : 0.34, cow ? 0.94 : 0.65],
    );
    for (const x of [-1, 1])
      for (const z of [-1, 1]) {
        rod(
          cow ? '#7f7766' : '#8a775c',
          [x * (cow ? 0.32 : 0.22), bodyY * 0.44, z * (cow ? 0.62 : 0.41)],
          cow ? 0.095 : 0.065,
          bodyY * 0.85,
        );
        box(
          '#514a3c',
          [x * (cow ? 0.32 : 0.22), 0.06, z * (cow ? 0.62 : 0.41)],
          [0.13, 0.12, 0.18],
        );
      }
    if (llama) {
      rod(coat, [0, 1.4, 0.48], 0.13, 0.85, [-0.15, 0, 0]);
      sphere(coat, [0, 1.86, 0.59], [0.17, 0.18, 0.29]);
      for (const x of [-0.1, 0.1])
        rod('#8e7755', [x, 2.1, 0.49], 0.04, 0.3, [0, 0, -x]);
    } else {
      sphere(
        cow ? '#50463a' : '#a89a7f',
        [0, bodyY + 0.08, cow ? 0.87 : 0.61],
        [0.25, 0.29, 0.29],
      );
      for (const x of [-1, 1])
        sphere(
          coat,
          [x * 0.25, bodyY + 0.25, cow ? 0.85 : 0.61],
          [0.18, 0.07, 0.08],
        );
      if (cow) {
        sphere('#51483b', [-0.36, 1.12, -0.21], [0.13, 0.37, 0.42]);
        sphere('#51483b', [0.36, 1.07, 0.35], [0.14, 0.3, 0.3]);
      }
    }
    const headY = llama ? 1.91 : bodyY + 0.17,
      headZ = llama ? 0.76 : cow ? 1.09 : 0.83;
    for (const x of [-0.11, 0.11])
      sphere('#302b22', [x, headY, headZ], [0.023, 0.023, 0.023]);
    rod(coat, [0, bodyY + 0.03, cow ? -0.96 : -0.65], 0.035, 0.4, [0.5, 0, 0]);
  }
  const geometry = mergeGeometries(parts)!;
  for (const part of parts) part.dispose();
  return geometry;
}

/** Sparse illustrative life. People follow mapped paths; vehicles follow eligible mapped roads. */
export function createWorldLife(
  features: WorldFeature[],
  context: WorldObjectContext,
) {
  const group = new THREE.Group();
  group.name = 'Illustrative local activity';
  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.88,
    side: THREE.DoubleSide,
  });
  const models = new Map<string, THREE.BufferGeometry>();
  const actors: Actor[] = [];
  const rng = seeded(features[0]?.id ?? context.area);
  function mesh(kind: Parameters<typeof model>[0]) {
    if (!models.has(kind)) models.set(kind, model(kind));
    const item = new THREE.Mesh(models.get(kind), material);
    item.castShadow = true;
    group.add(item);
    return item;
  }
  function makeRoute(coordinates: LonLat[]): Route {
    const lengths = [0];
    for (let i = 1; i < coordinates.length; i++)
      lengths.push(
        lengths[i - 1] +
          context
            .project(...coordinates[i - 1])
            .distanceTo(context.project(...coordinates[i])),
      );
    return { coordinates, lengths, total: lengths[lengths.length - 1] };
  }
  function canGraze(point: LonLat) {
    const center = context.project(...point),
      east = context.project(point[0] + 0.00001, point[1]),
      north = context.project(point[0], point[1] + 0.00001);
    return (
      grazingSlope(center.toArray(), east.toArray(), north.toArray()) < 0.45
    );
  }
  let animals = 0;
  const routes: {
    id: string;
    route: Route;
    kind: 'person' | 'vehicle';
    speed: number;
    phase: number;
    center: THREE.Vector3;
  }[] = [];
  const activeRoutes = new Map<string, Actor>();
  const routeCamera = new THREE.Vector3(Infinity, Infinity, Infinity);
  for (const feature of features) {
    const kind = feature.properties.kind;
    if (
      kind === 'path' ||
      (kind === 'road' && canDrive(feature.properties.highway, context.area))
    ) {
      const lines =
        feature.geometry.type === 'LineString'
          ? [feature.geometry.coordinates]
          : feature.geometry.type === 'MultiLineString'
            ? feature.geometry.coordinates
            : [];
      lines.forEach((line, index) => {
        const route = makeRoute(line);
        if (route.total < 25) return;
        routes.push({
          id: `${feature.id}:${index}`,
          route,
          kind: kind === 'path' ? 'person' : 'vehicle',
          speed: kind === 'path' ? 1.15 : 4.5,
          phase: seeded(`${feature.id}:${index}`)() * route.total,
          center: context.project(
            ...routePosition(route.coordinates, route.lengths, route.total / 2),
          ),
        });
      });
    }
    if (
      kind === 'farmland' &&
      animals < 6 &&
      feature.geometry.type === 'Polygon'
    ) {
      const ring = feature.geometry.coordinates[0],
        xs = ring.map((p) => p[0]),
        ys = ring.map((p) => p[1]);
      let west = Infinity,
        east = -Infinity,
        south = Infinity,
        north = -Infinity;
      for (const value of xs) {
        west = Math.min(west, value);
        east = Math.max(east, value);
      }
      for (const value of ys) {
        south = Math.min(south, value);
        north = Math.max(north, value);
      }
      for (let attempt = 0; attempt < 18 && animals < 6; attempt++) {
        const point: LonLat = [
          west + rng() * (east - west),
          south + rng() * (north - south),
        ];
        if (
          !insideRing(point, ring) ||
          feature.geometry.coordinates
            .slice(1)
            .some((hole) => insideRing(point, hole)) ||
          !canGraze(point)
        )
          continue;
        const species =
          context.area === 'machu'
            ? 'llama'
            : animals % 3 === 0
              ? 'cow'
              : animals % 3 === 1
                ? 'sheep'
                : 'llama';
        actors.push({
          mesh: mesh(species),
          origin: point,
          field: ring,
          holes: feature.geometry.coordinates.slice(1),
          speed: 0.18,
          phase: rng() * Math.PI * 2,
          kind: 'animal',
        });
        animals++;
        if (attempt > 2) break;
      }
    }
  }
  // Sanctuary llamas use mapped terrace/ruin interiors as illustrative grazing locations.
  if (context.area === 'machu' && animals < 3) {
    for (const feature of features
      .filter(
        (f) => f.properties.kind === 'terrace' && f.geometry.type === 'Polygon',
      )
      .slice(0, 3)) {
      if (feature.geometry.type !== 'Polygon') continue;
      const ring = feature.geometry.coordinates[0];
      const center = ring.reduce(
        (sum, p) =>
          [sum[0] + p[0] / ring.length, sum[1] + p[1] / ring.length] as LonLat,
        [0, 0] as LonLat,
      );
      if (insideRing(center, ring) && canGraze(center))
        actors.push({
          mesh: mesh('llama'),
          origin: center,
          field: ring,
          speed: 0.15,
          phase: rng() * 6,
          kind: 'animal',
        });
    }
  }
  if (context.area === 'machu' && context.landcover) {
    let terraceLlamas = 0;
    for (const feature of features) {
      if (terraceLlamas >= 3) break;
      if (
        feature.properties.kind !== 'terrace' ||
        feature.geometry.type !== 'LineString'
      )
        continue;
      const coordinates = feature.geometry.coordinates;
      for (let i = 1; i < coordinates.length && terraceLlamas < 3; i++) {
        const a = coordinates[i - 1],
          b = coordinates[i],
          dx = b[0] - a[0],
          dy = b[1] - a[1],
          length = Math.hypot(dx, dy);
        if (length < 0.00004) continue;
        for (const side of [-1, 1]) {
          const point: LonLat = [
            (a[0] + b[0]) / 2 - (dy / length) * 0.000025 * side,
            (a[1] + b[1]) / 2 + (dx / length) * 0.000025 * side,
          ];
          if (context.landcover(...point) !== 30 || !canGraze(point)) continue;
          // Actual mapped terrace wall plus source grass cover anchors illustrative sanctuary llamas.
          actors.push({
            mesh: mesh('llama'),
            origin: point,
            speed: 0,
            phase: rng() * 6,
            kind: 'animal',
          });
          terraceLlamas++;
          break;
        }
        if (terraceLlamas > 0) break;
      }
    }
  }
  const treeOrigins = features.filter(
    (f) => f.properties.kind === 'tree' && f.geometry.type === 'Point',
  );
  for (const tree of treeOrigins.slice(0, 3)) {
    if (tree.geometry.type !== 'Point') continue;
    actors.push({
      mesh: mesh('bird'),
      origin: tree.geometry.coordinates,
      speed: 0.25,
      phase: rng() * 6,
      kind: 'bird',
    });
  }
  let clock = 0,
    previousTime: number | undefined;
  const position = new THREE.Vector3(),
    ahead = new THREE.Vector3();
  return {
    group,
    update(options: WorldOptions, time: number, camera: THREE.Camera) {
      if (routeCamera.distanceToSquared(camera.position) > 100 ** 2) {
        routeCamera.copy(camera.position);
        const selected = ['person', 'vehicle'].flatMap((kind) =>
          routes
            .filter((route) => route.kind === kind)
            .sort(
              (a, b) =>
                a.center.distanceToSquared(camera.position) -
                b.center.distanceToSquared(camera.position),
            )
            .slice(0, kind === 'person' ? 12 : 6),
        );
        const ids = new Set(selected.map((route) => route.id));
        for (const [id, actor] of activeRoutes)
          if (!ids.has(id)) {
            actor.mesh.removeFromParent();
            actors.splice(actors.indexOf(actor), 1);
            activeRoutes.delete(id);
          }
        for (const route of selected)
          if (!activeRoutes.has(route.id)) {
            const actor: Actor = { ...route, mesh: mesh(route.kind) };
            actor.mesh.name =
              route.kind === 'person'
                ? 'Pedestrian on mapped path'
                : 'Vehicle on mapped road';
            actors.push(actor);
            activeRoutes.set(route.id, actor);
          }
      }
      const moving = !options.worldPaused && !context.reducedMotion;
      if (previousTime !== undefined && moving) clock += time - previousTime;
      previousTime = time;
      let animated = false;
      for (const actor of actors) {
        const enabled =
          actor.kind === 'person'
            ? options.people
            : actor.kind === 'vehicle'
              ? options.vehicles
              : options.animals;
        if (actor.route) {
          const { total, coordinates, lengths } = actor.route;
          const progress = (clock * actor.speed + actor.phase) % (total * 2),
            distance = progress <= total ? progress : total * 2 - progress;
          position.copy(
            context.project(...routePosition(coordinates, lengths, distance)),
          );
          const next = Math.max(
            0,
            Math.min(total, distance + (progress <= total ? 0.5 : -0.5)),
          );
          ahead.copy(
            context.project(...routePosition(coordinates, lengths, next)),
          );
          actor.mesh.rotation.y = Math.atan2(
            ahead.x - position.x,
            ahead.z - position.z,
          );
          position.y +=
            actor.kind === 'person'
              ? 0.2 + Math.sin(clock * 7 + actor.phase) * 0.035
              : 0.18;
        } else if (actor.origin) {
          const angle = clock * actor.speed + actor.phase;
          if (actor.kind === 'bird') {
            position.copy(
              context.project(
                actor.origin[0] + Math.cos(angle) * 0.00022,
                actor.origin[1] + Math.sin(angle) * 0.00022,
              ),
            );
            position.y += 32 + Math.sin(angle * 1.7) * 4;
            actor.mesh.rotation.set(Math.sin(angle) * 0.06, -angle, -0.15);
          } else {
            const candidate: LonLat = [
              actor.origin[0] + Math.cos(angle) * 0.000014,
              actor.origin[1] + Math.sin(angle) * 0.000014,
            ];
            position.copy(
              context.project(
                ...(actor.field &&
                insideRing(candidate, actor.field) &&
                !actor.holes?.some((hole) => insideRing(candidate, hole)) &&
                canGraze(candidate)
                  ? candidate
                  : actor.origin),
              ),
            );
            actor.mesh.rotation.y = -angle;
          }
        }
        actor.mesh.position.copy(position);
        actor.mesh.visible =
          enabled &&
          position.distanceTo(camera.position) <
            (actor.kind === 'person' ? 1800 : 2500);
        animated ||= moving && actor.mesh.visible;
      }
      return animated;
    },
    dispose() {
      for (const geometry of models.values()) geometry.dispose();
      material.dispose();
      group.clear();
      group.removeFromParent();
    },
  };
}
