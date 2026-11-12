import type { TravelAPI } from './travel';
import * as THREE from 'three';
import { navigateWithMotion } from './map-navigation';
import { createNavigationMotion } from './navigation-motion';
import { createPointerZoom } from './pointer-zoom';
import { MapControls as OrbitControls } from 'three/addons/controls/MapControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import type { Region, Place } from './places';
import type { WorldOptions, GeographicView } from './world-types';
import type {
  RegionLayers,
  LandcoverMeta,
  LayerFeatureCollection,
} from './layers';
import { sampleGrid } from './geo';
import {
  displayResolution,
  surfaceNormal,
  geographicPoint,
  insideBounds,
  sampleSurface,
  labelOverlapsUI,
} from './render-math';

export type TerrainMeta = {
  n: number;
  min: number;
  max: number;
  sampleSpacingMeters: number;
  bounds: number[];
};
export type TerrainOptions = WorldOptions & {
  exaggeration: number;
  light: number;
  sunHeight: number;
  contours: boolean;
  labels: boolean;
  orbit: boolean;
  palette: string;
  atmosphere: boolean;
  reduceMotion: boolean;
  surface: 'elevation' | 'landcover';
  water: boolean;
  settlements: boolean;
  history: boolean;
  quality: 'balanced' | 'high';
  preset: 'dawn' | 'daylight' | 'dusk' | 'custom';
};
export type TerrainAPI = {
  travel?: TravelAPI;
  setCollection?: (region: Region, signal: AbortSignal) => Promise<TerrainMeta>;
  update: (options: TerrainOptions) => void;
  focus: (
    place?: Place,
    overhead?: boolean,
    offset?: [number, number, number],
    distance?: number,
  ) => void;
  export: () => void;
  dispose: () => void;
  probe: (lon?: number, lat?: number) => void;
  section: (a?: Place, b?: Place) => void;
  sample: (lon: number, lat: number) => number;
  getView: () => GeographicView;
  setView: (view: GeographicView) => void;
};
const palettes: Record<string, string[]> = {
  atlas: ['#294f4e', '#537868', '#8f9d74', '#b3aa81', '#b6a48e', '#ece7d9'],
  copper: ['#493b35', '#7d5641', '#ae7652', '#c99e73', '#e3c49b', '#fff0d1'],
  alabaster: ['#7b908c', '#9bac9f', '#c0caba', '#dce0cc', '#edebda', '#fff7e7'],
};

export async function createTerrain(
  host: HTMLElement,
  region: Region,
  options: TerrainOptions,
  onReady: (m: TerrainMeta) => void,
  onPick: (p: Place) => void,
  signal: AbortSignal,
  onInteract: () => void,
): Promise<TerrainAPI> {
  const get = async (url: string) => {
    const response = await fetch(url, { signal });
    if (!response.ok)
      throw new Error('Map data could not load. Reload to try again.');
    return response;
  };
  const layerPromise = ['valley', 'machu'].includes(region.id)
    ? get(`/layers/${region.id}.json`).then(async (r) => {
        const manifest: RegionLayers = await r.json();
        const [lr, fr] = await Promise.all([
          get(manifest.landcover),
          get(manifest.features),
        ]);
        const landcover: LandcoverMeta = await lr.json();
        const classes = new Uint8Array(
          await (await get(landcover.dataUrl)).arrayBuffer(),
        );
        const features: LayerFeatureCollection = await fr.json();
        return { landcover, classes, features: features.features };
      })
    : Promise.resolve(null);
  const [mr, br, layers] = await Promise.all([
    get(`/terrain/${region.id}.json`),
    get(`/terrain/${region.id}.bin`),
    layerPromise,
  ]);
  const meta: TerrainMeta = await mr.json();
  const heights = new Float32Array(await br.arrayBuffer());
  if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
  const { n } = meta;
  const [west, south, east, north] = region.bounds;
  const widthKm =
    (east - west) * 111.32 * Math.cos((((north + south) / 2) * Math.PI) / 180);
  const width = 12,
    depth = (width * (north - south) * 111.32) / widthKm;
  const floor = Math.max(0, Math.floor(meta.min / 500) * 500 - 250);
  const heightScale = width / (widthKm * 1000);
  let current = { ...options },
    disposed = false,
    initialized = false;
  let frame = 0,
    frameCount = 0,
    fpsFrames = 0,
    fpsStart = performance.now();
  let targetCamera: THREE.Vector3 | null = null,
    targetLook: THREE.Vector3 | null = null;
  let focusedId: string | undefined,
    aspectFit = 1,
    mistStarted = performance.now();
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const isMotionReduced = () => current.reduceMotion || reducedMotion.matches;
  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: true,
    preserveDrawingBuffer: true,
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  renderer.setClearColor(0x000000, 0);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.shadowMap.autoUpdate = false;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  renderer.domElement.setAttribute(
    'aria-label',
    'Interactive 3D relief model. Drag to pan, scroll to zoom, right-drag or Shift-drag to orbit.',
  );
  renderer.domElement.tabIndex = 0;
  host.appendChild(renderer.domElement);
  const scene = new THREE.Scene(),
    atmosphereScene = new THREE.Group();
  scene.add(atmosphereScene);
  const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 120);
  camera.position.set(14, 16, 20);
  const controls = new OrbitControls(camera, renderer.domElement);
  const navigation = createNavigationMotion();
  controls.enableDamping = true;
  controls.dampingFactor = 0.085;
  controls.minDistance = 30 * heightScale;
  controls.zoomToCursor = true;
  controls.screenSpacePanning = false;
  camera.near = Math.max(0.0003, 0.8 * heightScale);
  controls.maxDistance = 60;
  controls.maxPolarAngle = Math.PI / 2.1;
  controls.autoRotateSpeed = 0.45;
  controls.target.set(0, 0.8, 0);
  const ambient = new THREE.HemisphereLight(0xe5ede5, 0x243933, 1.02);
  const sun = new THREE.DirectionalLight(0xffead2, 3.25);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const shadowSpan = Math.hypot(width, depth) * 0.56;
  Object.assign(sun.shadow.camera, {
    left: -shadowSpan,
    right: shadowSpan,
    top: shadowSpan,
    bottom: -shadowSpan,
    near: 0.1,
    far: 65,
  });
  sun.shadow.bias = -0.00012;
  sun.shadow.normalBias = 0.012;
  sun.target.position.set(0, 0.8, 0);
  const fill = new THREE.DirectionalLight(0xb4d5e4, 0.42);
  fill.position.set(-10, 8, 10);
  scene.add(ambient, sun, sun.target, fill);
  const terrain = new THREE.Group();
  scene.add(terrain);
  const composer = new EffectComposer(renderer);
  const renderPass = new RenderPass(scene, camera);
  const ao = new GTAOPass(scene, camera, 512, 512);
  ao.updateGtaoMaterial({
    radius: 0.32,
    thickness: 0.7,
    distanceFallOff: 0.65,
    samples: 8,
    screenSpaceRadius: false,
  });
  ao.updatePdMaterial({ radius: 4, samples: 8, rings: 2 });
  ao.blendIntensity = 0.42;
  const renderAO = ao.render.bind(ao);
  ao.render = (...args) => {
    const visible = atmosphereScene.visible;
    atmosphereScene.visible = false;
    renderAO(...args);
    atmosphereScene.visible = visible;
  };
  const output = new OutputPass();
  composer.addPass(renderPass);
  composer.addPass(ao);
  composer.addPass(output);
  const normalBytes = new Uint8Array(n * n * 4);
  const colorBytes = new Uint8Array(n * n * 4);
  const texture = (bytes: Uint8Array) => {
    const t = new THREE.DataTexture(bytes, n, n, THREE.RGBAFormat);
    t.flipY = true;
    t.magFilter = THREE.LinearFilter;
    t.minFilter = THREE.LinearFilter;
    t.needsUpdate = true;
    return t;
  };
  const normalMap = texture(normalBytes),
    colorMap = texture(colorBytes);
  colorMap.colorSpace = THREE.SRGBColorSpace;
  const waterCanvas = document.createElement('canvas');
  waterCanvas.width = 1024;
  waterCanvas.height = 1024;
  const waterContext = waterCanvas.getContext('2d')!;
  waterContext.fillStyle = '#000';
  waterContext.fillRect(0, 0, 1024, 1024);
  waterContext.fillStyle = '#fff';
  const paintWater = (rings: number[][][]) => {
    waterContext.beginPath();
    rings.forEach((ring) => {
      ring.forEach(([lon, lat], i) => {
        const x = ((lon - west) / (east - west)) * 1024,
          y = ((north - lat) / (north - south)) * 1024;
        if (i === 0) waterContext.moveTo(x, y);
        else waterContext.lineTo(x, y);
      });
      waterContext.closePath();
    });
    waterContext.fill('evenodd');
  };
  layers?.features.forEach((feature) => {
    if (feature.geometry.type === 'Polygon')
      paintWater(feature.geometry.coordinates);
    if (feature.geometry.type === 'MultiPolygon')
      feature.geometry.coordinates.forEach(paintWater);
  });
  const waterMask = new THREE.CanvasTexture(waterCanvas);
  waterMask.minFilter = THREE.LinearFilter;
  const material = new THREE.MeshStandardMaterial({
    map: colorMap,
    normalMap,
    normalMapType: THREE.ObjectSpaceNormalMap,
    roughness: 0.89,
    metalness: 0.035,
  });
  const uniforms = {
    water: { value: options.water ? 1 : 0 },
    lines: { value: 1 },
    interval: { value: ['machu', 'tristan'].includes(region.id) ? 100 : 250 },
  };
  material.onBeforeCompile = (shader) => {
    shader.uniforms.waterMask = { value: waterMask };
    shader.uniforms.waterEnabled = uniforms.water;
    shader.uniforms.contourEnabled = uniforms.lines;
    shader.uniforms.contourInterval = uniforms.interval;
    shader.vertexShader =
      'attribute float elevation; varying float vElevation;\n' +
      shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      '#include <begin_vertex>\nvElevation = elevation;',
    );
    shader.fragmentShader =
      'uniform sampler2D waterMask; uniform float waterEnabled; uniform float contourEnabled; uniform float contourInterval; varying float vElevation;\n' +
      shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <color_fragment>',
      '#include <color_fragment>\nfloat h = vElevation / contourInterval; float fw = max(fwidth(h), 0.001); float line = 1.0 - smoothstep(fw * 0.35, fw * 1.1, abs(fract(h + 0.5) - 0.5)); diffuseColor.rgb *= 1.0 - line * 0.17 * contourEnabled; float lake = texture2D(waterMask, vMapUv).r * waterEnabled; diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.095, 0.26, 0.29), lake * 0.85);',
    );
  };
  let geometry = new THREE.PlaneGeometry();
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  let wallGeo = new THREE.BufferGeometry();
  const wallMaterial = new THREE.MeshStandardMaterial({
    color: 0x526052,
    roughness: 0.95,
    side: THREE.DoubleSide,
  });
  const wall = new THREE.Mesh(wallGeo, wallMaterial);
  wall.receiveShadow = false;
  wall.castShadow = true;
  const plinthMaterial = new THREE.MeshStandardMaterial({
    color: 0x24332d,
    roughness: 0.8,
    metalness: 0.12,
  });
  const plinth = new THREE.Mesh(
    new THREE.BoxGeometry(width + 0.06, 0.14, depth + 0.06),
    plinthMaterial,
  );
  plinth.position.y = -0.17;
  plinth.castShadow = true;
  plinth.receiveShadow = true;
  terrain.add(mesh, wall, plinth);
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(100, 100),
    new THREE.ShadowMaterial({ opacity: 0.36 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.245;
  ground.receiveShadow = true;
  scene.add(ground);
  const mistMaterials: THREE.ShaderMaterial[] = [];
  for (let i = 0; i < 4; i++) {
    const m = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      uniforms: {
        opacity: { value: 0.03 },
        time: { value: 0 },
        tint: { value: new THREE.Color('#d7e1db') },
      },
      vertexShader:
        'varying vec2 mistUv; void main(){mistUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
      fragmentShader:
        'varying vec2 mistUv; uniform float opacity; uniform float time; uniform vec3 tint; void main(){vec2 p=mistUv; float edge=smoothstep(0.0,0.22,p.x)*smoothstep(0.0,0.22,p.y)*smoothstep(0.0,0.22,1.0-p.x)*smoothstep(0.0,0.22,1.0-p.y); float wisps=0.55+0.22*sin(p.x*19.0+p.y*8.0+time)+0.18*sin(p.y*33.0-p.x*12.0-time*0.4); gl_FragColor=vec4(tint,opacity*edge*wisps);\n#include <tonemapping_fragment>\n #include <colorspace_fragment>\n}',
    });
    const sheet = new THREE.Mesh(new THREE.PlaneGeometry(width, depth), m);
    sheet.rotation.x = -Math.PI / 2;
    sheet.userData.level = i;
    atmosphereScene.add(sheet);
    mistMaterials.push(m);
  }
  const sample = (lon: number, lat: number) =>
    sampleGrid(heights, n, region.bounds, lon, lat);
  let displayHeights = heights,
    displaySize = n;
  const point = (lon: number, lat: number, lift = 0) => {
    const [x, z] = geographicPoint(region.bounds, lon, lat, width, depth);
    return new THREE.Vector3(
      x,
      (Math.max(
        sampleSurface(displayHeights, displaySize, region.bounds, lon, lat),
        0,
      ) -
        floor) *
        heightScale *
        current.exaggeration +
        lift,
      z,
    );
  };
  const probeDot = new THREE.Mesh(
    new THREE.SphereGeometry(0.065, 16, 12),
    new THREE.MeshBasicMaterial({ color: 0xffd891 }),
  );
  probeDot.visible = false;
  terrain.add(probeDot);
  const sectionGeo = new THREE.BufferGeometry();
  const sectionLine = new THREE.Line(
    sectionGeo,
    new THREE.LineBasicMaterial({
      color: 0xf3cb80,
      transparent: true,
      opacity: 0.85,
    }),
  );
  sectionLine.visible = false;
  terrain.add(sectionLine);
  let endpoints: [Place, Place] | null = null,
    probeLocation: [number, number] | null = null;
  const probe = (lon?: number, lat?: number) => {
    probeLocation = lon !== undefined && lat !== undefined ? [lon, lat] : null;
    probeDot.visible = !!probeLocation;
    if (probeLocation) probeDot.position.copy(point(...probeLocation, 0.1));
    invalidate();
  };
  const section = (a?: Place, b?: Place) => {
    endpoints = a && b ? [a, b] : null;
    sectionLine.visible = !!endpoints;
    if (a && b) {
      sectionGeo.setFromPoints(
        Array.from({ length: 513 }, (_, i) =>
          point(
            a.lon + ((b.lon - a.lon) * i) / 512,
            a.lat + ((b.lat - a.lat) * i) / 512,
            0.025,
          ),
        ),
      );
    }
    invalidate();
  };
  type Pin = {
    place: Place;
    element: HTMLButtonElement;
    dot: THREE.Mesh;
    world: THREE.Vector3;
    category: 'settlement' | 'history' | 'general';
  };
  const pins: Pin[] = [];
  const historicalIds = new Set([
    'machu',
    'sacsay',
    'moray',
    'pisac',
    'ollanta',
  ]);
  const pinGeometry = new THREE.SphereGeometry(0.037, 10, 8);
  const townPinMaterial = new THREE.MeshBasicMaterial({ color: 0xf7e6b9 });
  const historyPinMaterial = new THREE.MeshBasicMaterial({ color: 0xefbf73 });
  const addPin = (place: Place, category: Pin['category']) => {
    const element = document.createElement('button');
    element.className = 'map-pin';
    element.textContent = place.name;
    element.title = `Explore ${place.name}`;
    element.addEventListener('click', () => onPick(place));
    host.appendChild(element);
    const dot = new THREE.Mesh(
      pinGeometry,
      category === 'history' ? historyPinMaterial : townPinMaterial,
    );
    terrain.add(dot);
    pins.push({
      place,
      element,
      dot,
      world: point(place.lon, place.lat, 0.045),
      category,
    });
  };
  region.places.forEach((p) =>
    addPin(
      p,
      !layers ? 'general' : historicalIds.has(p.id) ? 'history' : 'settlement',
    ),
  );
  layers?.features
    .filter(
      (f) =>
        f.properties.kind === 'settlement' &&
        f.geometry.type === 'Point' &&
        f.properties.name,
    )
    .forEach((f, i) => {
      const [lon, lat] = f.geometry.coordinates as number[];
      if (
        !insideBounds(region.bounds, lon, lat) ||
        region.places.some((p) => Math.hypot(p.lon - lon, p.lat - lat) < 0.018)
      )
        return;
      addPin(
        {
          id: `settlement-${i}`,
          name: f.properties.name!,
          lon,
          lat,
          kind: 'MAPPED SETTLEMENT',
          note: 'Settlement location from OpenStreetMap.',
        },
        'settlement',
      );
    });
  const waterGroup = new THREE.Group();
  terrain.add(waterGroup);
  const waterMaterial = new THREE.LineBasicMaterial({
    color: 0x78b7bc,
    transparent: true,
    opacity: 0.9,
    depthWrite: false,
  });
  const streamMaterial = waterMaterial.clone();
  streamMaterial.opacity = 0.4;
  const waterPaths: { path: number[][]; stream: boolean }[] = [];
  layers?.features
    .filter((f) => f.properties.kind !== 'settlement')
    .forEach((f) => {
      const stream = f.properties.waterway === 'stream';
      if (f.geometry.type === 'LineString')
        waterPaths.push({ path: f.geometry.coordinates, stream });
      if (
        f.geometry.type === 'MultiLineString' ||
        f.geometry.type === 'Polygon'
      )
        f.geometry.coordinates.forEach((path) =>
          waterPaths.push({ path, stream }),
        );
      if (f.geometry.type === 'MultiPolygon')
        f.geometry.coordinates.forEach((polygon) =>
          polygon.forEach((path) => waterPaths.push({ path, stream })),
        );
    });
  const riverSegments = new THREE.LineSegments(
    new THREE.BufferGeometry(),
    waterMaterial,
  );
  const streamSegments = new THREE.LineSegments(
    new THREE.BufferGeometry(),
    streamMaterial,
  );
  waterGroup.add(riverSegments, streamSegments);
  const refreshWater = () => {
    const rivers: number[] = [],
      streams: number[] = [];
    waterPaths.forEach(({ path, stream }) => {
      const vertices = stream ? streams : rivers;
      for (let i = 0; i < path.length - 1; i++) {
        const [a, b] = [path[i], path[i + 1]];
        const steps = Math.max(
          1,
          Math.ceil(
            Math.hypot(
              (b[0] - a[0]) / (east - west),
              (b[1] - a[1]) / (north - south),
            ) * n,
          ),
        );
        let previous: THREE.Vector3 | null = null;
        for (let j = 0; j <= steps; j++) {
          const lon = a[0] + ((b[0] - a[0]) * j) / steps,
            lat = a[1] + ((b[1] - a[1]) * j) / steps;
          if (!insideBounds(region.bounds, lon, lat)) {
            previous = null;
            continue;
          }
          const p = point(lon, lat, 0.018);
          if (previous)
            vertices.push(previous.x, previous.y, previous.z, p.x, p.y, p.z);
          previous = p;
        }
      }
    });
    [
      [riverSegments, rivers],
      [streamSegments, streams],
    ].forEach(([line, vertices]) => {
      const segments = line as THREE.LineSegments;
      segments.geometry.dispose();
      segments.geometry = new THREE.BufferGeometry();
      segments.geometry.setAttribute(
        'position',
        new THREE.Float32BufferAttribute(vertices as number[], 3),
      );
      segments.geometry.computeBoundingSphere();
    });
  };
  const remakeGeometry = () => {
    const size = displayResolution(n, current.quality);
    geometry.dispose();
    geometry = new THREE.PlaneGeometry(width, depth, size - 1, size - 1);
    geometry.rotateX(-Math.PI / 2);
    const positions = geometry.attributes.position,
      elevations = new Float32Array(size * size);
    for (let y = 0; y < size; y++)
      for (let x = 0; x < size; x++) {
        const i = y * size + x;
        const value = Math.max(
          sample(
            west + (x / (size - 1)) * (east - west),
            north - (y / (size - 1)) * (north - south),
          ),
          0,
        );
        elevations[i] = value;
        positions.setY(i, (value - floor) * heightScale * current.exaggeration);
      }
    displayHeights = elevations;
    displaySize = size;
    geometry.setAttribute(
      'elevation',
      new THREE.BufferAttribute(elevations, 1),
    );
    geometry.computeVertexNormals();
    mesh.geometry = geometry;
    const edge: number[] = [];
    for (let i = 0; i < size; i++) edge.push(i);
    for (let i = 1; i < size; i++) edge.push(i * size + size - 1);
    for (let i = size - 2; i >= 0; i--) edge.push((size - 1) * size + i);
    for (let i = size - 2; i > 0; i--) edge.push(i * size);
    const walls = new Float32Array(edge.length * 18);
    edge.forEach((e, i) => {
      const b = edge[(i + 1) % edge.length];
      const a = [positions.getX(e), positions.getY(e), positions.getZ(e)],
        c = [positions.getX(b), positions.getY(b), positions.getZ(b)];
      walls.set(
        [
          ...a,
          a[0],
          -0.1,
          a[2],
          ...c,
          ...c,
          a[0],
          -0.1,
          a[2],
          c[0],
          -0.1,
          c[2],
        ],
        i * 18,
      );
    });
    wallGeo.dispose();
    wallGeo = new THREE.BufferGeometry();
    wall.geometry = wallGeo;
    wallGeo.setAttribute('position', new THREE.BufferAttribute(walls, 3));
    wallGeo.computeVertexNormals();
    wallGeo.computeBoundingSphere();
    host.dataset.geometryVertices = String(size * size);
  };
  const update = (next: TerrainOptions) => {
    const reshape = !initialized || next.exaggeration !== current.exaggeration;
    const quality = !initialized || next.quality !== current.quality;
    const recolor =
      !initialized ||
      next.palette !== current.palette ||
      next.surface !== current.surface;
    if (
      next.atmosphere &&
      (!current.atmosphere || next.preset !== current.preset)
    )
      mistStarted = performance.now();
    current = { ...next };
    controls.autoRotate = next.orbit && !isMotionReduced();
    controls.enableDamping = !isMotionReduced();
    if (isMotionReduced() && targetCamera && targetLook) {
      camera.position.copy(targetCamera);
      controls.target.copy(targetLook);
      cancel();
    }
    uniforms.lines.value = next.contours ? 1 : 0;
    uniforms.water.value = next.water ? 1 : 0;
    if (reshape || quality) remakeGeometry();
    if (reshape) {
      for (let y = 0; y < n; y++)
        for (let x = 0; x < n; x++) {
          const normal = surfaceNormal(
              heights,
              n,
              x,
              y,
              width,
              depth,
              heightScale * next.exaggeration,
            ),
            i = (y * n + x) * 4;
          normalBytes[i] = (normal[0] * 0.5 + 0.5) * 255;
          normalBytes[i + 1] = (normal[1] * 0.5 + 0.5) * 255;
          normalBytes[i + 2] = (normal[2] * 0.5 + 0.5) * 255;
          normalBytes[i + 3] = 255;
        }
      normalMap.needsUpdate = true;
    }
    if (reshape || quality) {
      pins.forEach((p) => {
        p.world.copy(point(p.place.lon, p.place.lat, 0.045));
        p.dot.position.copy(p.world);
      });
      refreshWater();
      if (endpoints) section(...endpoints);
      if (probeLocation) probe(...probeLocation);
      atmosphereScene.children.forEach((sheet, i) => {
        sheet.position.y =
          (Math.max(meta.min, 0) +
            (meta.max - Math.max(meta.min, 0)) * (0.18 + i * 0.028) -
            floor) *
          heightScale *
          next.exaggeration;
      });
    }
    if (recolor) {
      const palette = palettes[next.palette].map((c) => new THREE.Color(c));
      const coverColors = new Map(
        layers?.landcover.classes.map((c) => [
          c.value,
          new THREE.Color(c.color),
        ]),
      );
      const color = new THREE.Color();
      for (let y = 0; y < n; y++)
        for (let x = 0; x < n; x++) {
          const i = y * n + x,
            value = heights[i];
          const t =
            THREE.MathUtils.clamp(
              (value - Math.max(meta.min, 0)) /
                (meta.max - Math.max(meta.min, 0)),
              0,
              1,
            ) *
            (palette.length - 1);
          const j = Math.min(palette.length - 2, Math.floor(t));
          color.copy(palette[j]).lerp(palette[j + 1], t - j);
          if (next.surface === 'landcover' && layers) {
            const lc = layers.landcover,
              lon = west + (x / (n - 1)) * (east - west),
              lat = north - (y / (n - 1)) * (north - south);
            const lx = Math.min(
              lc.n - 1,
              Math.max(
                0,
                Math.floor(
                  ((lon - lc.bounds[0]) / (lc.bounds[2] - lc.bounds[0])) * lc.n,
                ),
              ),
            );
            const ly = Math.min(
              lc.n - 1,
              Math.max(
                0,
                Math.floor(
                  ((lc.bounds[3] - lat) / (lc.bounds[3] - lc.bounds[1])) * lc.n,
                ),
              ),
            );
            const cover = coverColors.get(layers.classes[ly * lc.n + lx]);
            if (cover) color.copy(cover);
          }
          if (value <= 0) color.set('#315e68');
          color.convertLinearToSRGB();
          colorBytes[i * 4] = color.r * 255;
          colorBytes[i * 4 + 1] = color.g * 255;
          colorBytes[i * 4 + 2] = color.b * 255;
          colorBytes[i * 4 + 3] = 255;
        }
      colorMap.needsUpdate = true;
      wallMaterial.color.set(
        next.palette === 'copper'
          ? '#6b5143'
          : next.palette === 'alabaster'
            ? '#818d7d'
            : '#4c6051',
      );
      material.roughness = next.palette === 'copper' ? 0.73 : 0.91;
      material.metalness = next.palette === 'copper' ? 0.13 : 0.025;
    }
    const angle = (next.light * Math.PI) / 180,
      altitude = (next.sunHeight * Math.PI) / 180;
    sun.position.set(
      Math.cos(angle) * Math.cos(altitude) * 28,
      Math.sin(altitude) * 28 + 1,
      Math.sin(angle) * Math.cos(altitude) * 28,
    );
    const top = (meta.max - floor) * heightScale * next.exaggeration;
    sun.target.position.y = top * 0.45;
    sun.position.y += sun.target.position.y;
    const extent = Math.hypot(width, depth, top) * 0.5 + 0.3;
    Object.assign(sun.shadow.camera, {
      left: -extent,
      right: extent,
      top: extent,
      bottom: -extent,
    });
    sun.shadow.camera.updateProjectionMatrix();
    sun.color.set(
      next.preset === 'dusk'
        ? '#ffc79f'
        : next.preset === 'dawn'
          ? '#ffe0b3'
          : '#fff0da',
    );
    ambient.intensity =
      next.preset === 'daylight' || next.preset === 'custom' ? 1.02 : 0.78;
    scene.fog = next.atmosphere
      ? new THREE.FogExp2(next.preset === 'dusk' ? 0x8b7772 : 0xa4b7ae, 0.007)
      : null;
    waterGroup.visible = next.water;
    atmosphereScene.visible = next.atmosphere;
    renderer.shadowMap.needsUpdate = true;
    initialized = true;
    invalidate();
  };
  const cancel = () => {
    targetCamera = null;
    targetLook = null;
  };
  const focus = (
    place?: Place,
    overhead = false,
    offset?: [number, number, number],
  ) => {
    navigation.reset();
    pointerZoom.reset();
    focusedId = place?.id;
    if (current.atmosphere && current.preset === 'dawn')
      mistStarted = performance.now();
    const p = place
      ? point(place.lon, place.lat)
      : new THREE.Vector3(0, 0.7, 0);
    targetLook = p;
    const delta = offset
      ? new THREE.Vector3(...offset)
      : overhead
        ? new THREE.Vector3(0, 22, 0.01)
        : place
          ? new THREE.Vector3(4, 5, 6)
          : new THREE.Vector3(14, 15.3, 20);
    targetCamera = p.clone().add(delta.multiplyScalar(aspectFit));
    if (isMotionReduced()) {
      camera.position.copy(targetCamera);
      controls.target.copy(targetLook);
      cancel();
    }
    pins.forEach((pin) =>
      pin.element.classList.toggle('selected', pin.place.id === place?.id),
    );
    invalidate();
  };
  const interact = () => {
    renderer.domElement.focus({ preventScroll: true });
    cancel();
    onInteract();
    invalidate();
  };
  controls.addEventListener('start', interact);
  controls.addEventListener('change', () => invalidate());
  const pointerZoom = createPointerZoom(
    camera,
    controls,
    renderer.domElement,
    interact,
    invalidate,
    isMotionReduced,
  );
  const keyboard = (e: KeyboardEvent) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (navigation.press(e.code, e.shiftKey)) {
      if (!e.repeat) interact();
      e.preventDefault();
      return;
    }
    if (e.key === '+' || e.key === '=') {
      interact();
      camera.position.lerp(controls.target, 0.15);
      e.preventDefault();
    }
    if (e.key === '-') {
      interact();
      camera.position
        .sub(controls.target)
        .multiplyScalar(1.15)
        .add(controls.target);
      e.preventDefault();
    }
    if (e.key === 'Home') {
      interact();
      focus();
      e.preventDefault();
    }
    invalidate();
  };
  const keyup = (event: KeyboardEvent) => {
    navigation.release(event.code, event.shiftKey);
  };
  const stopNavigation = () => {
    navigation.reset();
    pointerZoom.reset();
  };
  renderer.domElement.addEventListener('keydown', keyboard);
  window.addEventListener('keyup', keyup);
  window.addEventListener('blur', stopNavigation);
  renderer.domElement.addEventListener('blur', stopNavigation);
  document.addEventListener('visibilitychange', stopNavigation);
  const resize = new ResizeObserver(() => {
    const w = host.clientWidth,
      h = host.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h);
    composer.setSize(w, h);
    camera.aspect = w / h;
    const nextFit = Math.max(1, 0.95 / camera.aspect);
    camera.position
      .sub(controls.target)
      .multiplyScalar(nextFit / aspectFit)
      .add(controls.target);
    if (targetCamera && targetLook)
      targetCamera
        .sub(targetLook)
        .multiplyScalar(nextFit / aspectFit)
        .add(targetLook);
    aspectFit = nextFit;
    camera.updateProjectionMatrix();
    invalidate();
  });
  resize.observe(host);
  const occluded = (p: THREE.Vector3) => {
    const start = camera.position;
    for (let i = 1; i < 45; i++) {
      const t = i / 46,
        x = start.x + (p.x - start.x) * t,
        y = start.y + (p.y - start.y) * t,
        z = start.z + (p.z - start.z) * t;
      const lon = west + (x / width + 0.5) * (east - west),
        lat = north - (z / depth + 0.5) * (north - south);
      if (
        insideBounds(region.bounds, lon, lat) &&
        point(lon, lat).y > y + 0.025
      )
        return true;
    }
    return false;
  };
  const projected = new THREE.Vector3();
  const layoutPins = () => {
    const occupied: { x: number; y: number; w: number }[] = [];
    const hostBounds = host.getBoundingClientRect();
    const panels = Array.from(
      host.parentElement!.querySelectorAll<HTMLElement>(
        '.scene-heading, .map-tools, .earth-navigation, .place-card, .profile-card, .chapter-caption',
      ),
    )
      .filter((panel) => panel.offsetWidth && panel.offsetHeight)
      .map((panel) => {
        const rect = panel.getBoundingClientRect();
        return {
          left: rect.left - hostBounds.left,
          top: rect.top - hostBounds.top,
          right: rect.right - hostBounds.left,
          bottom: rect.bottom - hostBounds.top,
        };
      });
    const labelLimit = host.clientWidth < 650 ? 4 : 8;
    const closeView = camera.position.distanceTo(controls.target) < 15;
    [...pins]
      .sort(
        (a, b) =>
          Number(b.place.id === focusedId) - Number(a.place.id === focusedId) ||
          Number(a.place.id.startsWith('settlement-')) -
            Number(b.place.id.startsWith('settlement-')),
      )
      .forEach((p) => {
        const selected = p.place.id === focusedId;
        const enabled =
          current.labels &&
          (closeView || !p.place.id.startsWith('settlement-')) &&
          (selected ||
            p.category === 'general' ||
            (p.category === 'history' ? current.history : current.settlements));
        p.element.hidden = !enabled;
        p.dot.visible = enabled;
        if (!enabled) return;
        projected.copy(p.world).project(camera);
        const x = (projected.x / 2 + 0.5) * host.clientWidth,
          y = (-projected.y / 2 + 0.5) * host.clientHeight - 9,
          w = p.element.offsetWidth;
        const overlap = occupied.some(
          (o) =>
            Math.abs(o.x - x) < (o.w + w) / 2 + 8 && Math.abs(o.y - y) < 30,
        );
        const hidden =
          occupied.length >= labelLimit ||
          labelOverlapsUI(x, y, w, p.element.offsetHeight, panels) ||
          overlap ||
          projected.z > 1 ||
          projected.z < -1 ||
          x < w / 2 ||
          x > host.clientWidth - w / 2 ||
          y < 28 ||
          y > host.clientHeight ||
          (!selected && occluded(p.world));
        p.element.style.visibility = hidden ? 'hidden' : 'visible';
        p.dot.visible = !hidden;
        if (!hidden) occupied.push({ x, y, w });
        p.element.style.transform = `translate(-50%, -100%) translate(${x}px,${y}px)`;
      });
  };
  const draw = (exporting = false) => {
    const fog = scene.fog;
    if (exporting) scene.fog = null;
    atmosphereScene.visible = current.atmosphere && !exporting;
    composer.render();
    atmosphereScene.visible = current.atmosphere;
    scene.fog = fog;
  };
  let settling = 0;
  let previousFrame = performance.now();
  function invalidate() {
    if (!disposed && !frame) frame = requestAnimationFrame(animate);
  }
  function animate(now: number) {
    frame = 0;
    if (disposed) return;
    const dt = Math.min(0.05, (now - previousFrame) / 1000);
    previousFrame = now;
    if (targetCamera && targetLook) {
      const ease = 1 - Math.exp(-7 * dt);
      camera.position.lerp(targetCamera, ease);
      controls.target.lerp(targetLook, ease);
      if (camera.position.distanceTo(targetCamera) < 0.012) {
        camera.position.copy(targetCamera);
        controls.target.copy(targetLook);
        cancel();
      }
    }
    const input = navigation.tick(dt, isMotionReduced());
    if (input.x || input.forward)
      navigateWithMotion(
        camera,
        controls.target,
        input.x,
        input.forward,
        input.orbit,
        host.clientHeight,
      );
    controls.dampingFactor = 1 - Math.exp(-12 * dt);
    const zoomMoving = pointerZoom.tick(dt);
    const changed = controls.update(dt);
    const [cameraLon, cameraLat] = [
      west + (camera.position.x / width + 0.5) * (east - west),
      north - (camera.position.z / depth + 0.5) * (north - south),
    ];
    if (insideBounds(region.bounds, cameraLon, cameraLat))
      camera.position.y = Math.max(
        camera.position.y,
        point(cameraLon, cameraLat).y + 30 * heightScale,
      );
    settling = changed ? 0 : settling + 1;
    const elapsed = (now - mistStarted) / 1000;
    mistMaterials.forEach((m, i) => {
      m.uniforms.time.value = isMotionReduced()
        ? i
        : Math.min(elapsed, 14) * 0.12 + i;
      m.uniforms.opacity.value = isMotionReduced()
        ? 0.035
        : 0.035 +
          Math.max(0, 1 - elapsed / 14) *
            (current.preset === 'dawn' ? 0.2 : 0.07);
    });
    const compass = host.parentElement?.querySelector<SVGElement>(
      '.north-indicator svg',
    );
    if (compass)
      compass.style.transform = `rotate(${(-controls.getAzimuthalAngle() * 180) / Math.PI}deg)`;
    layoutPins();
    draw();
    frameCount++;
    fpsFrames++;
    host.dataset.renderCount = String(frameCount);
    host.dataset.activeResources = `${renderer.info.memory.geometries} geometries / ${renderer.info.memory.textures} textures`;
    if (now - fpsStart > 1000) {
      host.dataset.fps = String(
        Math.round((fpsFrames * 1000) / (now - fpsStart)),
      );
      fpsFrames = 0;
      fpsStart = now;
    }
    if (
      targetCamera ||
      controls.autoRotate ||
      settling < 3 ||
      input.active ||
      zoomMoving ||
      (current.atmosphere && !isMotionReduced() && elapsed < 14)
    )
      invalidate();
  }
  const motionChange = () => {
    controls.autoRotate = current.orbit && !isMotionReduced();
    controls.enableDamping = !isMotionReduced();
    if (isMotionReduced() && targetCamera && targetLook) {
      camera.position.copy(targetCamera);
      controls.target.copy(targetLook);
      cancel();
    }
    invalidate();
  };
  reducedMotion.addEventListener('change', motionChange);
  update(options);
  onReady(meta);
  return {
    update,
    getView: () => ({
      lon: west + (controls.target.x / width + 0.5) * (east - west),
      lat: north - (controls.target.z / depth + 0.5) * (north - south),
      distance: camera.position.distanceTo(controls.target) / heightScale,
      azimuth: controls.getAzimuthalAngle(),
      polar: controls.getPolarAngle(),
    }),
    setView: (view) => {
      navigation.reset();
      pointerZoom.reset();
      cancel();
      controls.target.copy(point(view.lon, view.lat));
      camera.position
        .copy(controls.target)
        .add(
          new THREE.Vector3().setFromSphericalCoords(
            view.distance * heightScale,
            view.polar,
            view.azimuth,
          ),
        );
      controls.update();
      invalidate();
    },
    focus,
    sample,
    probe,
    section,
    export: () => {
      draw(true);
      const exported = document.createElement('canvas');
      exported.width = renderer.domElement.width;
      exported.height = renderer.domElement.height;
      const context = exported.getContext('2d')!;
      context.drawImage(renderer.domElement, 0, 0);
      const canvasBounds = renderer.domElement.getBoundingClientRect();
      context.scale(
        exported.width / canvasBounds.width,
        exported.height / canvasBounds.height,
      );
      pins
        .filter(
          (pin) =>
            !pin.element.hidden && pin.element.style.visibility === 'visible',
        )
        .forEach((pin) => {
          const rect = pin.element.getBoundingClientRect(),
            style = getComputedStyle(pin.element);
          const x = rect.left - canvasBounds.left,
            y = rect.top - canvasBounds.top;
          context.fillStyle = style.backgroundColor;
          context.strokeStyle = style.borderColor;
          context.beginPath();
          context.roundRect(x, y, rect.width, rect.height, 3);
          context.fill();
          context.stroke();
          context.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
          context.fillStyle = style.color;
          context.textAlign = 'center';
          context.textBaseline = 'middle';
          context.fillText(
            pin.place.name,
            x + rect.width / 2,
            y + rect.height / 2,
          );
        });
      const credits = ['Terrain: USGS / NOAA via Mapzen Terrain Tiles.'];
      if (layers && (current.water || current.settlements))
        credits.push(
          '© OpenStreetMap contributors · openstreetmap.org/copyright',
        );
      if (layers && current.surface === 'landcover')
        credits.push(
          '© ESA WorldCover project 2021 / Contains modified Copernicus Sentinel data (2021) processed by ESA WorldCover consortium',
        );
      context.font = '9px sans-serif';
      context.textAlign = 'left';
      context.textBaseline = 'top';
      const creditLines: string[] = [];
      credits.forEach((credit) => {
        let line = '';
        credit.split(' ').forEach((word) => {
          const next = line ? `${line} ${word}` : word;
          if (context.measureText(next).width > canvasBounds.width - 40) {
            creditLines.push(line);
            line = word;
          } else line = next;
        });
        creditLines.push(line);
      });
      const creditWidth =
        Math.max(
          ...creditLines.map((line) => context.measureText(line).width),
        ) + 16;
      const creditHeight = creditLines.length * 12 + 12;
      const creditY = canvasBounds.height - creditHeight - 10;
      context.fillStyle = 'rgba(19, 35, 31, 0.88)';
      context.beginPath();
      context.roundRect(10, creditY, creditWidth, creditHeight, 3);
      context.fill();
      context.fillStyle = '#e4e9db';
      creditLines.forEach((line, i) =>
        context.fillText(line, 18, creditY + 6 + i * 12),
      );
      const a = document.createElement('a');
      a.download = `relief-${region.id}.png`;
      a.href = exported.toDataURL('image/png');
      a.click();
      invalidate();
    },
    dispose: () => {
      disposed = true;
      cancelAnimationFrame(frame);
      resize.disconnect();
      reducedMotion.removeEventListener('change', motionChange);
      window.removeEventListener('keyup', keyup);
      window.removeEventListener('blur', stopNavigation);
      renderer.domElement.removeEventListener('blur', stopNavigation);
      document.removeEventListener('visibilitychange', stopNavigation);
      controls.dispose();
      pointerZoom.dispose();
      normalMap.dispose();
      colorMap.dispose();
      waterMask.dispose();
      ao.dispose();
      output.dispose();
      composer.dispose();
      const materials = new Set<THREE.Material>();
      scene.traverse((o) => {
        if (o instanceof THREE.Mesh || o instanceof THREE.Line) {
          o.geometry.dispose();
          (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) =>
            materials.add(m),
          );
        }
      });
      materials.add(waterMaterial);
      materials.add(streamMaterial);
      materials.forEach((m) => m.dispose());
      sun.shadow.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      pins.forEach((p) => p.element.remove());
      renderer.domElement.remove();
      delete host.dataset.activeResources;
    },
  };
}
