import * as THREE from 'three';
import type { GeoBounds, LayerFeature } from './layers';
import { sampleGrid } from './geo.ts';
import {
  coverPixels,
  worldProjection,
  sampleRectilinearSurface,
  geographicPixel,
} from './world-math.ts';
import type { TerrainOptions } from './terrain';

type GroundData = {
  bounds: GeoBounds;
  heights: Float32Array;
  n: number;
  cover: Uint8Array;
  coverN: number;
  origin: ReturnType<typeof worldProjection>;
  baseline: number;
  regionalSample?: (lon: number, lat: number) => number;
  regionalGrid?: {
    longitudes: readonly number[];
    latitudes: readonly number[];
  };
  holes?: GeoBounds[];
  partitions?: GeoBounds[];
  outerEdges?: { west: boolean; east: boolean; north: boolean; south: boolean };
  naturalPixels?: Uint8Array;
  waterFeatures: LayerFeature[];
  waterResolution?: number;
};

function waterMask(
  bounds: GeoBounds,
  origin: ReturnType<typeof worldProjection>,
  features: LayerFeature[],
  size: number,
) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d')!;
  context.fillStyle = '#000';
  context.fillRect(0, 0, size, size);
  context.fillStyle = '#fff';
  context.strokeStyle = '#fff';
  context.lineCap = 'round';
  context.lineJoin = 'round';
  const [west] = origin.project(bounds[0], bounds[3]),
    [east] = origin.project(bounds[2], bounds[1]);
  const trace = (coordinates: number[][]) => {
    coordinates.forEach(([lon, lat], i) => {
      const [x, y] = geographicPixel(bounds, size, lon, lat);
      if (i === 0) context.moveTo(x, y);
      else context.lineTo(x, y);
    });
  };
  const fill = (rings: number[][][]) => {
    context.beginPath();
    rings.forEach((ring) => {
      trace(ring);
      context.closePath();
    });
    context.fill('evenodd');
  };
  for (const feature of features) {
    const g = feature.geometry;
    if (g.type === 'Point' || feature.properties.kind === 'settlement')
      continue;
    if (g.type === 'Polygon') fill(g.coordinates);
    else if (g.type === 'MultiPolygon') g.coordinates.forEach(fill);
    else {
      const river = feature.properties.waterway === 'river';
      context.lineWidth = ((river ? 20 : 2.6) / (east - west)) * size;
      context.globalAlpha = river ? 1 : 0.65;
      const lines = g.type === 'LineString' ? [g.coordinates] : g.coordinates;
      lines.forEach((line) => {
        context.beginPath();
        trace(line);
        context.stroke();
      });
      context.globalAlpha = 1;
    }
  }
  const rgba = context.getImageData(0, 0, size, size).data,
    bytes = new Uint8Array(size * size);
  for (let i = 0; i < bytes.length; i++) bytes[i] = rgba[i * 4];
  const texture = new THREE.DataTexture(bytes, size, size, THREE.RedFormat);
  texture.flipY = true;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return texture;
}

export function createGroundPatch(data: GroundData, resolution: number) {
  const { bounds, origin, baseline, heights, n, cover, coverN } = data;
  const natural = new THREE.DataTexture(
    data.naturalPixels || coverPixels(cover, coverN),
    coverN,
    coverN,
    THREE.RGBAFormat,
  );
  const classified = new THREE.DataTexture(
    coverPixels(cover, coverN, true),
    coverN,
    coverN,
    THREE.RGBAFormat,
  );
  for (const texture of [natural, classified]) {
    texture.flipY = true;
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.magFilter = THREE.LinearFilter;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.generateMipmaps = true;
    texture.needsUpdate = true;
    texture.anisotropy = 4;
  }
  classified.magFilter = THREE.NearestFilter;
  const water = waterMask(
    bounds,
    origin,
    data.waterFeatures,
    data.waterResolution || 1024,
  );
  const uniforms = {
    groundWaterMask: { value: water },
    waterEnabled: { value: 1 },
    wetness: { value: 0 },
    classification: { value: 0 },
    contours: { value: 0 },
    baseline: { value: baseline },
  };
  const material = new THREE.MeshStandardMaterial({
    map: natural,
    roughness: 0.94,
    metalness: 0.015,
  });
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader =
      'varying vec3 groundPosition; varying vec3 groundNormal;\n' +
      shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      '#include <begin_vertex>\n groundPosition = position; groundNormal = normal;',
    );
    shader.fragmentShader =
      `varying vec3 groundPosition; varying vec3 groundNormal;
      uniform sampler2D groundWaterMask; uniform float waterEnabled;
      uniform float wetness; uniform float classification; uniform float contours; uniform float baseline;
      float hashGround(vec2 p) { return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
      float noiseGround(vec2 p) { vec2 i=floor(p); vec2 f=fract(p); f=f*f*(3.0-2.0*f); return mix(mix(hashGround(i),hashGround(i+vec2(1,0)),f.x),mix(hashGround(i+vec2(0,1)),hashGround(i+vec2(1,1)),f.x),f.y); }
      ` + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <map_fragment>',
      `#include <map_fragment>
      float field = noiseGround(groundPosition.xz * 0.006);
      float grain = noiseGround(groundPosition.xz * 0.12);
      float fine = noiseGround(groundPosition.xz * 1.4);
      float cliff = smoothstep(0.38,0.78,1.0-groundNormal.y);
      vec3 rock = vec3(0.28,0.255,0.205) * (0.86+grain*0.22);
      diffuseColor.rgb = mix(diffuseColor.rgb,rock,cliff*(1.0-classification)*0.75);
      diffuseColor.rgb *= 1.0 + (1.0-classification) * ((field-0.5)*0.22+(grain-0.5)*0.13+(fine-0.5)*0.055);
      diffuseColor.rgb *= 1.0-wetness*0.23;
      float mappedWater = texture2D(groundWaterMask, vMapUv).r * waterEnabled;
      vec3 riverColor = vec3(0.075,0.145,0.155) * (0.95+noiseGround(groundPosition.xz*0.13)*0.1);
      diffuseColor.rgb = mix(diffuseColor.rgb,riverColor,mappedWater);
      float elevation = groundPosition.y + baseline;
      float contourDistance=abs(fract(elevation/100.0-0.5)-0.5)/max(fwidth(elevation/100.0),0.003);
      diffuseColor.rgb *= 1.0-contours*(1.0-smoothstep(0.6,1.5,contourDistance))*0.2;
    `,
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <normal_fragment_maps>',
      `#include <normal_fragment_maps>
      float roughDetail = noiseGround(groundPosition.xz*0.5);
      normal = normalize(normal + vec3(dFdx(roughDetail),dFdy(roughDetail),0.0)*0.22*(1.0-classification));
    `,
    );
  };
  const sample = (lon: number, lat: number) => {
    const value = sampleGrid(heights, n, bounds, lon, lat);
    if (!data.regionalSample) return value;
    // Join the source-derived detailed tile to the regional surface at its boundary.
    const tx = (lon - bounds[0]) / (bounds[2] - bounds[0]);
    const ty = (lat - bounds[1]) / (bounds[3] - bounds[1]);
    const edge = Math.min(
      data.outerEdges?.west ? tx : 1,
      data.outerEdges?.east ? 1 - tx : 1,
      data.outerEdges?.south ? ty : 1,
      data.outerEdges?.north ? 1 - ty : 1,
    );
    const t = Math.min(1, Math.max(0, edge * 16));
    if (t >= 1) return value;
    return THREE.MathUtils.lerp(
      data.regionalSample(lon, lat),
      value,
      t * t * (3 - 2 * t),
    );
  };
  let displayLongitudes: number[] = [];
  let displayLatitudes: number[] = [];
  let displayElevations = new Float32Array();
  const indicesFor = (xs: number[], ys: number[]) => {
    const indices: number[] = [];
    for (let row = 0; row < ys.length - 1; row++)
      for (let col = 0; col < xs.length - 1; col++) {
        const lon = (xs[col] + xs[col + 1]) / 2,
          lat = (ys[row] + ys[row + 1]) / 2;
        if (
          data.holes?.some(
            (h) => lon > h[0] && lon < h[2] && lat > h[1] && lat < h[3],
          )
        )
          continue;
        const a = row * xs.length + col,
          b = a + xs.length,
          c = b + 1,
          d = a + 1;
        indices.push(a, b, d, b, c, d);
      }
    return indices;
  };
  const geometry = (size: number) => {
    const longitude = Array.from(
      { length: size },
      (_, i) => bounds[0] + (i / (size - 1)) * (bounds[2] - bounds[0]),
    );
    const latitude = Array.from(
      { length: size },
      (_, i) => bounds[3] - (i / (size - 1)) * (bounds[3] - bounds[1]),
    );
    (data.partitions ?? data.holes)?.forEach((hole) => {
      longitude.push(hole[0], hole[2]);
      latitude.push(hole[1], hole[3]);
    });
    // Tile boundaries are regional grid lines. Preserve their curve breakpoints
    // so differently subdivided neighbors meet on the same displayed surface.
    longitude.push(
      ...(data.regionalGrid?.longitudes.filter(
        (lon) => lon > bounds[0] && lon < bounds[2],
      ) ?? []),
    );
    latitude.push(
      ...(data.regionalGrid?.latitudes.filter(
        (lat) => lat > bounds[1] && lat < bounds[3],
      ) ?? []),
    );
    const xs = [...new Set(longitude)].sort((a, b) => a - b);
    const ys = [...new Set(latitude)].sort((a, b) => b - a);
    displayLongitudes = xs;
    displayLatitudes = ys;
    displayElevations = new Float32Array(xs.length * ys.length);
    const positions = new Float32Array(xs.length * ys.length * 3);
    const normals = new Float32Array(positions.length);
    const uv = new Float32Array(xs.length * ys.length * 2);
    const [w, north] = origin.project(bounds[0], bounds[3]);
    const [e, south] = origin.project(bounds[2], bounds[1]);
    const deltaLon = (bounds[2] - bounds[0]) / (n - 1);
    const deltaLat = (bounds[3] - bounds[1]) / (n - 1);
    for (let row = 0; row < ys.length; row++)
      for (let col = 0; col < xs.length; col++) {
        const lon = xs[col],
          lat = ys[row],
          i = row * xs.length + col;
        const [x, z] = origin.project(lon, lat);
        displayElevations[i] = sample(lon, lat);
        positions.set([x, displayElevations[i] - baseline, z], i * 3);
        uv.set(
          [
            (lon - bounds[0]) / (bounds[2] - bounds[0]),
            (lat - bounds[1]) / (bounds[3] - bounds[1]),
          ],
          i * 2,
        );
        const left = Math.max(bounds[0], lon - deltaLon),
          right = Math.min(bounds[2], lon + deltaLon);
        const bottom = Math.max(bounds[1], lat - deltaLat),
          top = Math.min(bounds[3], lat + deltaLat);
        const dx =
          (sample(right, lat) - sample(left, lat)) /
          (((right - left) / (bounds[2] - bounds[0])) * (e - w));
        const dz =
          (sample(lon, bottom) - sample(lon, top)) /
          (((top - bottom) / (bounds[3] - bounds[1])) * (south - north));
        const normal = new THREE.Vector3(-dx, 1, -dz).normalize();
        normals.set(normal.toArray(), i * 3);
      }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    const indices = indicesFor(xs, ys);
    const capacity = new Uint32Array((xs.length - 1) * (ys.length - 1) * 6);
    capacity.set(indices);
    geo.setIndex(new THREE.BufferAttribute(capacity, 1));
    geo.setDrawRange(0, indices.length);
    geo.computeBoundingSphere();
    return geo;
  };
  let size = resolution;
  const mesh = new THREE.Mesh(geometry(size), material);
  mesh.receiveShadow = true;
  mesh.castShadow = true;
  return {
    mesh,
    sample,
    surfaceGrid: () => ({
      longitudes: displayLongitudes,
      latitudes: displayLatitudes,
    }),
    surface(lon: number, lat: number) {
      return sampleRectilinearSurface(
        displayLongitudes,
        displayLatitudes,
        displayElevations,
        lon,
        lat,
      );
    },
    setHoles(holes: GeoBounds[]) {
      data.holes = holes;
      const indices = indicesFor(displayLongitudes, displayLatitudes);
      mesh.geometry.index!.array.set(indices);
      mesh.geometry.index!.needsUpdate = true;
      mesh.geometry.setDrawRange(0, indices.length);
    },
    setOuterEdges(edges: NonNullable<GroundData['outerEdges']>) {
      if (
        Object.entries(edges).every(
          ([key, value]) =>
            data.outerEdges?.[key as keyof typeof edges] === value,
        )
      )
        return false;
      data.outerEdges = edges;
      mesh.geometry.dispose();
      mesh.geometry = geometry(size);
      return true;
    },
    setResolution(next: number, force = false) {
      if (next === size && !force) return;
      size = next;
      mesh.geometry.dispose();
      mesh.geometry = geometry(next);
    },
    update(options: TerrainOptions) {
      const classify = options.surface === 'landcover';
      material.map = classify ? classified : natural;
      material.roughness = options.weather === 'rain' ? 0.58 : 0.94;
      uniforms.classification.value = classify ? 1 : 0;
      uniforms.contours.value = options.contours ? 1 : 0;
      uniforms.waterEnabled.value = options.water ? 1 : 0;
      uniforms.wetness.value =
        options.weather === 'rain' ? options.weatherIntensity : 0;
    },
    dispose() {
      mesh.geometry.dispose();
      material.dispose();
      natural.dispose();
      classified.dispose();
      water.dispose();
    },
  };
}
