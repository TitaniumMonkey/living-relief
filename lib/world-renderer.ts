import { createWorldTravel } from './world-travel';
import * as THREE from 'three';
import { navigateWithMotion } from './map-navigation';
import { createNavigationMotion } from './navigation-motion';
import { createPointerZoom } from './pointer-zoom';
import { MapControls as OrbitControls } from 'three/addons/controls/MapControls.js';
import { featurePlace } from './place-details';
import { buildingPlaces, type Place, type Region } from './places';
import type { TerrainAPI, TerrainMeta, TerrainOptions } from './terrain';
import type {
  GeoBounds,
  LandcoverMeta,
  LayerFeature,
  LayerFeatureCollection,
  RegionLayers,
} from './layers';
import type {
  GeographicView,
  WorldFeatures,
  WorldManifest,
  WorldTile,
} from './world-types';
import { sampleGrid } from './geo';
import { insideBounds, labelOverlapsUI } from './render-math';
import {
  cameraClearance,
  coverPixels,
  tileDistance,
  keepTileObjects,
  exposedTileEdges,
  worldProjection,
} from './world-math';
import { createGroundPatch } from './world-ground';
import { createWorldEnvironment } from './world-environment';
import { createWorldObjectsAsync } from './world-objects';

type Ground = ReturnType<typeof createGroundPatch>;
type Objects = Awaited<ReturnType<typeof createWorldObjectsAsync>>;
type TileState = {
  manifest: WorldTile;
  ground?: Ground;
  areaId: string;
  light: boolean;
  resolution: number;
  detailLoading?: AbortController;
  objects?: Objects;
  features?: WorldFeatures;
  loading?: AbortController;
  detailed: boolean;
  cover?: Uint8Array;
  distance: number;
  eyeDistance: number;
};

export async function createWorldTerrain(
  host: HTMLElement,
  region: Region,
  options: TerrainOptions,
  onReady: (meta: TerrainMeta) => void,
  onPick: (place: Place) => void,
  signal: AbortSignal,
  onInteract: () => void,
): Promise<TerrainAPI> {
  const get = async (url: string, requestSignal = signal) => {
    const response = await fetch(url, { signal: requestSignal });
    if (!response.ok)
      throw new Error(
        'Local world assets could not load. Reload to try again.',
      );
    return response;
  };
  const [meta, heights, manifest, layerManifest] = await Promise.all([
    get(`/terrain/${region.id}.json`).then((r) =>
      r.json(),
    ) as Promise<TerrainMeta>,
    get(`/terrain/${region.id}.bin`).then(
      async (r) => new Float32Array(await r.arrayBuffer()),
    ),
    get('/world/manifest.json').then((r) => r.json()) as Promise<WorldManifest>,
    get(`/layers/${region.id}.json`).then((r) =>
      r.json(),
    ) as Promise<RegionLayers>,
  ]);
  const [coverMeta, features] = await Promise.all([
    get(layerManifest.landcover).then((r) =>
      r.json(),
    ) as Promise<LandcoverMeta>,
    get(layerManifest.features).then((r) =>
      r.json(),
    ) as Promise<LayerFeatureCollection>,
  ]);
  const classes = new Uint8Array(
    await (await get(coverMeta.dataUrl)).arrayBuffer(),
  );
  if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
  let collection = region;
  const tileOwners = new Map<
    string,
    { tile: WorldTile; areaId: string; light: boolean }
  >();
  manifest.areas.forEach((area) =>
    area.tiles.forEach((tile) => {
      if (!tileOwners.has(tile.terrain.url))
        tileOwners.set(tile.terrain.url, {
          tile,
          areaId: area.id,
          light: area.detail === 'light',
        });
    }),
  );
  let measurement = { heights, meta, bounds: region.bounds };
  const origin = worldProjection(region.bounds);
  const baseline = Math.floor(meta.min / 100) * 100;
  const sample = (lon: number, lat: number) =>
    insideBounds(measurement.bounds, lon, lat)
      ? sampleGrid(
          measurement.heights,
          measurement.meta.n,
          measurement.bounds,
          lon,
          lat,
        )
      : sampleGrid(heights, meta.n, region.bounds, lon, lat);
  const bounds = region.bounds as GeoBounds;
  let current = { ...options },
    disposed = false,
    frame = 0,
    frames = 0,
    fpsFrames = 0;
  let fpsStarted = performance.now(),
    previousTime = performance.now(),
    worldTime = 0;
  let targetCamera: THREE.Vector3 | null = null,
    targetLook: THREE.Vector3 | null = null;
  let focusedId: string | undefined,
    aspectFit = 1,
    flightFrames = 0,
    flightStarted = 0;
  let nextTileCheck = 0;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const motionReduced = () => current.reduceMotion || reducedMotion.matches;
  const paused = () =>
    current.worldPaused || motionReduced() || document.hidden;
  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: true,
    preserveDrawingBuffer: false,
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  renderer.setClearColor(0, 0);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.12;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.shadowMap.autoUpdate = false;
  renderer.domElement.tabIndex = 0;
  renderer.domElement.setAttribute(
    'aria-label',
    'Interactive living landscape. Drag to pan, scroll to zoom, right-drag or Shift-drag to orbit. Click buildings for details.',
  );
  host.appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, 1, 1, 250000);
  const controls = new OrbitControls(camera, renderer.domElement);
  const navigation = createNavigationMotion();
  controls.enableDamping = true;
  controls.dampingFactor = 0.085;
  controls.minDistance = 30;
  controls.maxDistance = 220000;
  controls.maxPolarAngle = Math.PI * 0.495;
  controls.screenSpacePanning = false;
  controls.zoomToCursor = true;
  controls.zoomSpeed = 0.85;
  controls.autoRotateSpeed = 0.42;
  const coarse = createGroundPatch(
    {
      bounds,
      heights,
      n: meta.n,
      cover: classes,
      coverN: coverMeta.n,
      origin,
      baseline,
      holes: [],
      partitions: [...tileOwners.values()].map(({ tile }) => tile.bounds),
      waterFeatures: features.features,
      waterResolution: 2048,
    },
    257,
  );
  scene.add(coarse.mesh);
  const tiles: TileState[] = [...tileOwners.values()].map(
    ({ tile, areaId, light }) => ({
      manifest: tile,
      areaId,
      light,
      detailed: false,
      resolution: 33,
      distance: Infinity,
      eyeDistance: Infinity,
    }),
  );
  const syncHoles = () => {
    const loaded = tiles.filter((t) => t.ground).map((t) => t.manifest.bounds);
    coarse.setHoles(loaded);
    for (const tile of tiles) {
      if (
        tile.ground?.setOuterEdges(
          exposedTileEdges(tile.manifest.bounds, loaded),
        )
      ) {
        tile.loading?.abort();
        tile.objects?.dispose();
        tile.objects = undefined;
      }
    }
  };
  const elevation = (lon: number, lat: number) => {
    const tile = tiles.find((t) => insideBounds(t.manifest.bounds, lon, lat));
    return tile?.ground
      ? tile.ground.surface(lon, lat)
      : coarse.surface(lon, lat);
  };
  const point = (lon: number, lat: number, lift = 0) => {
    const [x, z] = origin.project(lon, lat);
    return new THREE.Vector3(x, elevation(lon, lat) - baseline + lift, z);
  };
  const travel = createWorldTravel(scene, point, invalidate);
  const environment = createWorldEnvironment(scene, renderer);
  const probeMaterial = new THREE.MeshBasicMaterial({ color: '#f3d797' });
  const probeDot = new THREE.Mesh(
    new THREE.SphereGeometry(1, 12, 8),
    probeMaterial,
  );
  probeDot.visible = false;
  scene.add(probeDot);
  const sectionLine = new THREE.Line(
    new THREE.BufferGeometry(),
    new THREE.LineBasicMaterial({ color: '#f4d591' }),
  );
  scene.add(sectionLine);
  sectionLine.visible = false;
  let probeLocation: [number, number] | null = null,
    endpoints: [Place, Place] | null = null;
  const probe = (lon?: number, lat?: number) => {
    probeLocation = lon === undefined || lat === undefined ? null : [lon, lat];
    probeDot.visible = !!probeLocation;
    if (probeLocation) probeDot.position.copy(point(...probeLocation, 4));
    invalidate();
  };
  const section = (a?: Place, b?: Place) => {
    endpoints = a && b ? [a, b] : null;
    sectionLine.visible = !!endpoints;
    if (a && b) {
      sectionLine.geometry.dispose();
      sectionLine.geometry = new THREE.BufferGeometry().setFromPoints(
        Array.from({ length: 1025 }, (_, i) =>
          point(
            THREE.MathUtils.lerp(a.lon, b.lon, i / 1024),
            THREE.MathUtils.lerp(a.lat, b.lat, i / 1024),
            3,
          ),
        ),
      );
    }
    invalidate();
  };
  type Pin = {
    place: Place;
    element: HTMLButtonElement;
    history: boolean;
    incidental: boolean;
  };
  const historyIds = new Set(['machu', 'sacsay', 'moray', 'pisac', 'ollanta']);
  const pins: Pin[] = [];
  const visiblePins: { pin: Pin; world: THREE.Vector3 }[] = [];
  const addPin = (place: Place, incidental = false) => {
    const element = document.createElement('button');
    element.className = 'map-pin';
    element.textContent = place.name;
    element.title = `Explore ${place.name}`;
    element.addEventListener('click', () => onPick(place));
    host.appendChild(element);
    pins.push({
      place,
      element,
      history: historyIds.has(place.id) || place.kind === 'INCA LANDMARK',
      incidental,
    });
  };
  region.places.forEach((p) => addPin(p));
  features.features.forEach((f: LayerFeature, i) => {
    if (
      f.properties.kind !== 'settlement' ||
      f.geometry.type !== 'Point' ||
      !f.properties.name
    )
      return;
    const [lon, lat] = f.geometry.coordinates;
    if (region.places.some((p) => Math.hypot(p.lon - lon, p.lat - lat) < 0.015))
      return;
    addPin(
      {
        id: `settlement-${i}`,
        lon,
        lat,
        name: f.properties.name,
        kind: 'MAPPED SETTLEMENT',
        note: 'Settlement mapped by OpenStreetMap contributors.',
      },
      true,
    );
  });
  const occluded = (p: THREE.Vector3) => {
    const v = new THREE.Vector3();
    for (let i = 1; i < 32; i++) {
      v.copy(camera.position).lerp(p, i / 32);
      const [lon, lat] = origin.geographic(v.x, v.z);
      if (
        insideBounds(bounds, lon, lat) &&
        elevation(lon, lat) - baseline > v.y + 5
      )
        return true;
    }
    return false;
  };
  const layoutPins = () => {
    visiblePins.length = 0;
    if (travel.isActive()) {
      pins.forEach((pin) => {
        pin.element.hidden = true;
      });
      return;
    }
    const occupied: { x: number; y: number; width: number }[] = [];
    const hostBounds = host.getBoundingClientRect();
    const panels = Array.from(
      host.parentElement!.querySelectorAll<HTMLElement>(
        '.scene-heading, .map-tools, .earth-navigation, .place-card, .profile-card, .chapter-caption, .train-dock',
      ),
    )
      .filter((p) => p.offsetWidth && p.offsetHeight)
      .map((p) => {
        const r = p.getBoundingClientRect();
        return {
          left: r.left - hostBounds.left,
          top: r.top - hostBounds.top,
          right: r.right - hostBounds.left,
          bottom: r.bottom - hostBounds.top,
        };
      });
    const ordered = [...pins].sort(
      (a, b) =>
        Number(b.place.id === focusedId) - Number(a.place.id === focusedId) ||
        Number(a.incidental) - Number(b.incidental),
    );
    // Measure all labels before writing positions; interleaving these forces layout per pin.
    pins.forEach((pin) => {
      pin.element.hidden = false;
    });
    const sizes = new Map(
      pins.map((pin) => [
        pin,
        { width: pin.element.offsetWidth, height: pin.element.offsetHeight },
      ]),
    );
    ordered.forEach((pin) => {
      const selected = pin.place.id === focusedId;
      const world = point(pin.place.lon, pin.place.lat, 8);
      const enabled =
        current.labels &&
        (selected || (pin.history ? current.history : current.settlements)) &&
        (!pin.incidental || camera.position.distanceTo(world) < 16000) &&
        (!pin.place.detail ||
          selected ||
          camera.position.distanceTo(world) < 4000);
      pin.element.hidden = !enabled;
      if (!enabled) return;
      const p = world.clone().project(camera),
        x = (p.x * 0.5 + 0.5) * host.clientWidth,
        y = (-p.y * 0.5 + 0.5) * host.clientHeight - 8;
      const { width, height } = sizes.get(pin)!;
      const hidden =
        p.z < -1 ||
        p.z > 1 ||
        x < width / 2 ||
        x > host.clientWidth - width / 2 ||
        y < 28 ||
        y > host.clientHeight ||
        occupied.length >= (host.clientWidth < 650 ? 4 : 8) ||
        occupied.some(
          (o) =>
            Math.abs(o.x - x) < (o.width + width) / 2 + 10 &&
            Math.abs(o.y - y) < 32,
        ) ||
        labelOverlapsUI(x, y, width, height, panels) ||
        (!selected && occluded(world));
      pin.element.style.visibility = hidden ? 'hidden' : 'visible';
      pin.element.style.translate = `${x}px ${y}px`;
      pin.element.classList.toggle('selected', selected);
      if (!hidden) {
        occupied.push({ x, y, width });
        visiblePins.push({ pin, world });
      }
    });
  };
  const refreshAnchors = () => {
    labelState = '';
    travel.refresh();
    if (endpoints) section(...endpoints);
    if (probeLocation) probe(...probeLocation);
    renderer.shadowMap.needsUpdate = true;
  };
  const worldOptions = () => ({ ...current, worldPaused: paused() });
  const makeObjects = async (tile: TileState, signal: AbortSignal) => {
    if (!tile.features) return;
    const objects = await createWorldObjectsAsync(
      tile.features,
      {
        project: (lon, lat) => point(lon, lat),
        elevation,
        area: tile.areaId,
        bounds: tile.manifest.bounds,
        landcover: (lon, lat) => {
          const b = tile.manifest.bounds,
            n = tile.manifest.landcover.n;
          const x = Math.min(
            n - 1,
            Math.max(0, Math.floor(((lon - b[0]) / (b[2] - b[0])) * n)),
          );
          const y = Math.min(
            n - 1,
            Math.max(0, Math.floor(((b[3] - lat) / (b[3] - b[1])) * n)),
          );
          return tile.cover![y * n + x];
        },
      },
      signal,
    );
    if (signal.aborted || disposed) {
      objects.dispose();
      return;
    }
    tile.objects = objects;
    scene.add(objects.group);
    objects.update(worldOptions(), worldTime, camera);
    renderer.shadowMap.needsUpdate = true;
  };
  const loadDetail = async (tile: TileState) => {
    if (tile.detailLoading || tile.ground) return;
    const controller = new AbortController();
    tile.detailLoading = controller;
    try {
      const [terrain, cover, halo] = await Promise.all([
        get(tile.manifest.terrain.url, controller.signal).then(
          async (r) => new Float32Array(await r.arrayBuffer()),
        ),
        get(tile.manifest.landcover.url, controller.signal).then(
          async (r) => new Uint8Array(await r.arrayBuffer()),
        ),
        tile.manifest.landcover.haloUrl
          ? get(tile.manifest.landcover.haloUrl, controller.signal).then(
              async (r) => new Uint8Array(await r.arrayBuffer()),
            )
          : undefined,
      ]);
      if (disposed || controller.signal.aborted) return;
      const coverN = tile.manifest.landcover.n;
      let naturalPixels: Uint8Array | undefined;
      if (halo) {
        const margin = (Math.sqrt(halo.length) - coverN) / 2;
        const haloN = coverN + margin * 2;
        const colored = coverPixels(halo, haloN);
        naturalPixels = new Uint8Array(coverN * coverN * 4);
        for (let y = 0; y < coverN; y++) {
          const start = ((y + margin) * haloN + margin) * 4;
          naturalPixels.set(
            colored.subarray(start, start + coverN * 4),
            y * coverN * 4,
          );
        }
      }
      tile.ground = createGroundPatch(
        {
          bounds: tile.manifest.bounds,
          heights: terrain,
          n: tile.manifest.terrain.n,
          cover,
          coverN,
          origin,
          baseline,
          naturalPixels,
          waterFeatures: features.features,
          waterResolution: 512,
          regionalSample: (lon, lat) => coarse.surface(lon, lat),
          regionalGrid: coarse.surfaceGrid(),
          outerEdges: exposedTileEdges(
            tile.manifest.bounds,
            tiles.filter((t) => t.ground).map((t) => t.manifest.bounds),
          ),
        },
        tile.resolution,
      );
      tile.ground.update(current);
      scene.add(tile.ground.mesh);
      tile.detailed = true;
      tile.cover = cover;
      syncHoles();
      host.dataset.worldDetail = 'ready';
      refreshAnchors();
      nextTileCheck = 0;
      invalidate();
    } catch (error) {
      if (!(error instanceof DOMException && error.name === 'AbortError')) {
        host.dataset.worldDetail = 'unavailable';
        console.error('Living World terrain assets:', error);
      }
    } finally {
      tile.detailLoading = undefined;
    }
  };
  const loadObjects = async (tile: TileState) => {
    if (tile.objects || tile.loading || !tile.detailed) return;
    const controller = new AbortController();
    tile.loading = controller;
    try {
      const collection =
        tile.features ??
        ((await (
          await get(tile.manifest.features, controller.signal)
        ).json()) as WorldFeatures);
      if (disposed || controller.signal.aborted) return;
      tile.features = collection;
      await makeObjects(tile, controller.signal);
      invalidate();
    } catch (error) {
      if (!(error instanceof DOMException && error.name === 'AbortError'))
        console.error('Living World geographic assets:', error);
    } finally {
      if (tile.loading === controller) tile.loading = undefined;
      nextTileCheck = 0;
      invalidate();
    }
  };
  const updateTiles = () => {
    const cameraDistance = camera.position.distanceTo(controls.target);
    const cameraGeo = origin.geographic(camera.position.x, camera.position.z);
    const altitude = Math.max(
      0,
      camera.position.y + baseline - elevation(...cameraGeo),
    );
    const detailedLayers =
      current.buildings ||
      current.ruins ||
      current.trees ||
      current.vegetation ||
      current.animals ||
      current.people ||
      current.vehicles;
    tiles.forEach((tile) => {
      const [w, n] = origin.project(
        tile.manifest.bounds[0],
        tile.manifest.bounds[3],
      );
      const [e, south] = origin.project(
        tile.manifest.bounds[2],
        tile.manifest.bounds[1],
      );
      tile.eyeDistance = Math.hypot(
        altitude,
        tileDistance(camera.position.x, camera.position.z, w, n, e, south),
      );
      tile.distance = tileDistance(
        controls.target.x,
        controls.target.z,
        w,
        n,
        e,
        south,
      );
    });
    const nearest = [...tiles].sort(
      (a, b) =>
        Math.min(a.distance, a.eyeDistance) -
        Math.min(b.distance, b.eyeDistance),
    );
    const active = new Set(
      nearest
        .filter(
          (t) =>
            Math.min(t.distance, t.eyeDistance) < 9500 &&
            (cameraDistance < 40000 || t.eyeDistance < 9500),
        )
        .slice(0, 36),
    );
    let loading = tiles.filter((t) => t.detailLoading).length;
    let holesChanged = false;
    nearest.forEach((tile) => {
      if (active.has(tile)) {
        const nearby =
          detailedLayers &&
          keepTileObjects(
            tile.distance,
            tile.eyeDistance,
            cameraDistance,
            tile.light,
            !!(tile.objects || tile.loading),
          );
        // Hold fine ground under resident buildings; zoom must not tear down a city.
        const resolution = nearby
          ? 129
          : cameraDistance + tile.distance <
              (current.quality === 'high' ? 14000 : 6500)
            ? 129
            : cameraDistance + tile.distance < 18000
              ? 65
              : 33;
        if (tile.resolution !== resolution) {
          tile.resolution = resolution;
          tile.ground?.setResolution(resolution);
          tile.loading?.abort();
          tile.objects?.dispose();
          tile.objects = undefined;
        }
        if (!tile.ground && !tile.detailLoading && loading < 2) {
          loading++;
          void loadDetail(tile);
        }
        if (nearby) {
          // Finish terrain seams before constructing objects; build one city tile at a time.
          if (!tiles.some((t) => t.detailLoading || t.loading))
            void loadObjects(tile);
        } else {
          tile.loading?.abort();
          tile.objects?.dispose();
          tile.objects = undefined;
        }
      } else {
        tile.detailLoading?.abort();
        tile.loading?.abort();
        if (tile.ground) {
          tile.objects?.dispose();
          tile.objects = undefined;
          tile.ground.mesh.removeFromParent();
          tile.ground.dispose();
          tile.ground = undefined;
          tile.features = undefined;
          tile.cover = undefined;
          tile.detailed = false;
          holesChanged = true;
        }
      }
    });
    if (holesChanged) {
      syncHoles();
      refreshAnchors();
    }
    host.dataset.loadedTiles = String(
      tiles.filter((tile) => tile.objects).length,
    );
    host.dataset.terrainTiles = String(
      tiles.filter((tile) => tile.ground).length,
    );
  };
  const constrain = () => {
    const [lon, lat] = origin.geographic(camera.position.x, camera.position.z);
    if (
      insideBounds(bounds, lon, lat) &&
      !travel.isOnboard() &&
      !travel.isTransitioning()
    ) {
      const terrainHeight = elevation(lon, lat);
      let top = terrainHeight;
      tiles.forEach((tile) => {
        if (tile.objects && insideBounds(tile.manifest.bounds, lon, lat))
          top = Math.max(top, tile.objects.heightAt(lon, lat));
      });
      camera.position.y =
        cameraClearance(camera.position.y + baseline, terrainHeight, top, 30) -
        baseline;
      host.dataset.cameraClearance = (
        camera.position.y +
        baseline -
        top
      ).toFixed(1);
    }
    const distance = camera.position.distanceTo(controls.target);
    const nextNear =
      travel.isOnboard() || travel.isTransitioning()
        ? 0.08
        : Math.max(0.6, Math.min(15, distance / 1200));
    if (Math.abs(camera.near - nextNear) > 0.1) {
      camera.near = nextNear;
      camera.updateProjectionMatrix();
    }
  };
  const cancel = () => {
    targetCamera = null;
    targetLook = null;
  };
  const focus = (
    place?: Place,
    overhead = false,
    offset?: [number, number, number],
    distance?: number,
  ) => {
    navigation.reset();
    pointerZoom.reset();
    focusedId = place?.id;
    const target = place
      ? point(place.lon, place.lat)
      : point(
          ...manifest.areas.find(
            (a) => a.id === (collection.id === 'machu' ? 'machu' : 'urubamba'),
          )!.center,
        );
    const delta = offset
      ? new THREE.Vector3(...offset)
          .normalize()
          .multiplyScalar(distance ?? 1400)
      : overhead
        ? new THREE.Vector3(0, place ? 2400 : 9000, 1)
        : place
          ? new THREE.Vector3(760, 640, 1000).multiplyScalar(
              place?.detail ? 0.28 : 1,
            )
          : new THREE.Vector3(5200, 4400, 6400);
    targetLook = target;
    targetCamera = target.clone().add(delta.multiplyScalar(aspectFit));
    if (motionReduced()) {
      camera.position.copy(targetCamera);
      controls.target.copy(targetLook);
      cancel();
    }
    nextTileCheck = 0;
    invalidate();
  };
  const getView = (): GeographicView => {
    const [lon, lat] = origin.geographic(controls.target.x, controls.target.z);
    return {
      lon,
      lat,
      distance: camera.position.distanceTo(controls.target),
      azimuth: controls.getAzimuthalAngle(),
      polar: controls.getPolarAngle(),
    };
  };
  const setView = (view: GeographicView) => {
    navigation.reset();
    pointerZoom.reset();
    travel.useExternalCamera();
    cancel();
    controls.target.copy(point(view.lon, view.lat));
    camera.position
      .copy(controls.target)
      .add(
        new THREE.Vector3().setFromSphericalCoords(
          Math.max(30, Math.min(180000, view.distance)),
          view.polar,
          view.azimuth,
        ),
      );
    controls.update();
    constrain();
    nextTileCheck = 0;
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
    motionReduced,
  );
  const keyboard = (event: KeyboardEvent) => {
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    if (navigation.press(event.code, event.shiftKey)) {
      if (!event.repeat) interact();
      event.preventDefault();
      return;
    }
    if (travel.isOnboard()) return;
    if (event.key === '+' || event.key === '=') {
      interact();
      camera.position.lerp(controls.target, 0.18);
      event.preventDefault();
    }
    if (event.key === '-') {
      interact();
      camera.position
        .sub(controls.target)
        .multiplyScalar(1.18)
        .add(controls.target);
      event.preventDefault();
    }
    if (event.key === 'Home') {
      interact();
      focus();
      event.preventDefault();
    }
    constrain();
    invalidate();
  };
  const keyup = (event: KeyboardEvent) => {
    navigation.release(event.code, event.shiftKey);
  };
  const stopNavigation = () => {
    navigation.reset();
    pointerZoom.reset();
  };
  const raycaster = new THREE.Raycaster();
  let pointerDown: [number, number] | undefined;
  let cabDrag: { id: number; x: number; y: number } | undefined;
  const cabPointerDown = (event: PointerEvent) => {
    if (!travel.isOnboard()) return;
    cabDrag = { id: event.pointerId, x: event.clientX, y: event.clientY };
    renderer.domElement.setPointerCapture(event.pointerId);
    interact();
    event.stopImmediatePropagation();
  };
  const cabPointerMove = (event: PointerEvent) => {
    if (!cabDrag || cabDrag.id !== event.pointerId) return;
    travel.lookAround(
      (event.clientX - cabDrag.x) * 0.004,
      (event.clientY - cabDrag.y) * 0.004,
    );
    cabDrag.x = event.clientX;
    cabDrag.y = event.clientY;
  };
  const cabPointerUp = (event: PointerEvent) => {
    if (!cabDrag || cabDrag.id !== event.pointerId) return;
    cabDrag = undefined;
    event.stopImmediatePropagation();
  };
  const pointerStart = (event: PointerEvent) => {
    if (event.button === 0) pointerDown = [event.clientX, event.clientY];
  };
  const pointerPick = (event: PointerEvent) => {
    const start = pointerDown;
    pointerDown = undefined;
    if (
      !start ||
      Math.hypot(event.clientX - start[0], event.clientY - start[1]) > 5
    )
      return;
    const rect = renderer.domElement.getBoundingClientRect();
    raycaster.setFromCamera(
      new THREE.Vector2(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        1 - ((event.clientY - rect.top) / rect.height) * 2,
      ),
      camera,
    );
    const candidates = tiles
      .flatMap((tile) => {
        const hit = tile.objects?.pick(raycaster);
        return hit ? [hit] : [];
      })
      .sort((a, b) => a.distance - b.distance);
    const hit = candidates[0];
    if (!hit) return;
    const groundHit = raycaster.intersectObjects(
      [
        coarse.mesh,
        ...tiles.flatMap((tile) => (tile.ground ? [tile.ground.mesh] : [])),
      ],
      false,
    )[0];
    if (groundHit && groundHit.distance + 0.5 < hit.distance) return;
    const [lon, lat] = origin.geographic(hit.point.x, hit.point.z);
    onPick(
      buildingPlaces.get(hit.feature.id) ?? featurePlace(hit.feature, lon, lat),
    );
    probe(lon, lat);
  };
  renderer.domElement.addEventListener('pointerdown', cabPointerDown, true);
  renderer.domElement.addEventListener('pointermove', cabPointerMove);
  renderer.domElement.addEventListener('pointerup', cabPointerUp, true);
  renderer.domElement.addEventListener('pointercancel', cabPointerUp, true);
  renderer.domElement.addEventListener('pointerdown', pointerStart);
  renderer.domElement.addEventListener('pointerup', pointerPick);
  renderer.domElement.addEventListener('keydown', keyboard);
  window.addEventListener('keyup', keyup);
  window.addEventListener('blur', stopNavigation);
  renderer.domElement.addEventListener('blur', stopNavigation);
  const resize = new ResizeObserver(() => {
    if (!host.clientWidth || !host.clientHeight) return;
    renderer.setSize(host.clientWidth, host.clientHeight);
    camera.aspect = host.clientWidth / host.clientHeight;
    const nextFit = Math.max(1, 0.9 / camera.aspect);
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
  const update = (next: TerrainOptions) => {
    const wasOrbit = current.orbit;
    const qualityChanged = current.quality !== next.quality;
    current = { ...next };
    if (qualityChanged) {
      renderer.setPixelRatio(
        Math.min(window.devicePixelRatio, next.quality === 'high' ? 2 : 1.5),
      );
      coarse.setResolution(next.quality === 'high' ? 513 : 257);
      tiles.forEach((tile) => {
        tile.ground?.setResolution(tile.resolution, true);
        tile.objects?.dispose();
        tile.objects = undefined;
      });
      refreshAnchors();
    }
    controls.autoRotate = next.orbit && !paused();
    controls.enableDamping = !motionReduced();
    if (next.orbit && !wasOrbit) {
      flightStarted = performance.now();
      flightFrames = 0;
      fpsStarted = performance.now();
      fpsFrames = 0;
      delete host.dataset.flightFps;
    }
    if (motionReduced() && targetCamera && targetLook) {
      camera.position.copy(targetCamera);
      controls.target.copy(targetLook);
      cancel();
    }
    coarse.update(next);
    tiles.forEach((t) => {
      t.ground?.update(next);
      t.objects?.update(worldOptions(), worldTime, camera);
    });
    environment.update(next);
    nextTileCheck = 0;
    invalidate();
  };
  const draw = () => renderer.render(scene, camera);
  let settling = 0;
  let nextActivityShadow = 0;
  let nextLabels = 0;
  const lastLabelEye = new THREE.Vector3(Infinity, Infinity, Infinity);
  const lastLabelRotation = new THREE.Quaternion();
  let labelState = '';
  const pinProjection = new THREE.Vector3();
  function invalidate() {
    if (!disposed && !document.hidden && !frame)
      frame = requestAnimationFrame(animate);
  }
  function animate(now: number) {
    frame = 0;
    if (disposed || document.hidden) return;
    const dt = Math.min(0.05, (now - previousTime) / 1000);
    previousTime = now;
    if (!paused()) worldTime += dt * current.worldSpeed;
    if (targetCamera && targetLook) {
      const ease = 1 - Math.exp(-7 * dt);
      camera.position.lerp(targetCamera, ease);
      controls.target.lerp(targetLook, ease);
      if (camera.position.distanceTo(targetCamera) < 0.5) {
        camera.position.copy(targetCamera);
        controls.target.copy(targetLook);
        cancel();
      }
    }
    const input = navigation.tick(dt, motionReduced());
    if (input.x || input.forward) {
      if (travel.isOnboard())
        travel.lookAround(-input.x * 1.2, input.forward * 0.85);
      else {
        navigateWithMotion(
          camera,
          controls.target,
          input.x,
          input.forward,
          input.orbit,
          host.clientHeight,
        );
        const [lon, lat] = origin.geographic(
          controls.target.x,
          controls.target.z,
        );
        const height = elevation(lon, lat) - baseline;
        camera.position.y += height - controls.target.y;
        controls.target.y = height;
      }
    }
    controls.dampingFactor = 1 - Math.exp(-12 * dt);
    controls.enabled = !travel.isOnboard() && !travel.isTransitioning();
    const zoomMoving = pointerZoom.tick(dt);
    const changed = controls.enabled ? controls.update(dt) : false;
    const travelMoving = travel.tick(
      dt,
      now,
      camera,
      controls.target,
      paused(),
      motionReduced(),
    );
    constrain();
    settling = changed ? 0 : settling + 1;
    if (now > nextTileCheck) {
      updateTiles();
      nextTileCheck = now + 450;
    }
    let lifeMoving = false;
    const activityOptions = worldOptions();
    tiles.forEach((tile) => {
      if (tile.objects)
        lifeMoving =
          tile.objects.update(activityOptions, worldTime, camera) || lifeMoving;
    });
    if (lifeMoving && !paused() && now >= nextActivityShadow) {
      renderer.shadowMap.needsUpdate = true;
      nextActivityShadow = now + 100;
    }
    const weatherMoving =
      environment.tick(worldTime, camera, controls.target) && !paused();
    probeDot.scale.setScalar(
      Math.max(2, camera.position.distanceTo(controls.target) * 0.004),
    );
    const nextLabelState = `${focusedId},${current.labels},${current.history},${current.settlements},${travel.isActive()},${host.clientWidth},${host.clientHeight}`;
    if (
      now >= nextLabels &&
      (nextLabelState !== labelState ||
        camera.position.distanceToSquared(lastLabelEye) > 0.01 ||
        camera.quaternion.angleTo(lastLabelRotation) > 0.0001)
    ) {
      layoutPins();
      lastLabelEye.copy(camera.position);
      lastLabelRotation.copy(camera.quaternion);
      labelState = nextLabelState;
      nextLabels = now + 50;
      const compass = host.parentElement?.querySelector<SVGElement>(
        '.north-indicator svg',
      );
      if (compass)
        compass.style.transform = `rotate(${(-controls.getAzimuthalAngle() * 180) / Math.PI}deg)`;
    }
    // Keep visible labels attached at the display frame rate; only collision/occlusion work is throttled.
    for (const { pin, world } of visiblePins) {
      pinProjection.copy(world).project(camera);
      pin.element.style.translate = `${(pinProjection.x * 0.5 + 0.5) * host.clientWidth}px ${(-pinProjection.y * 0.5 + 0.5) * host.clientHeight - 8}px`;
    }
    draw();
    frames++;
    fpsFrames++;
    if (now - fpsStarted > 1000) {
      host.dataset.renderCount = String(frames);
      host.dataset.activeResources = `${renderer.info.memory.geometries} geometries / ${renderer.info.memory.textures} textures`;
      host.dataset.geometryVertices = String(
        coarse.mesh.geometry.getAttribute('position').count +
          tiles.reduce(
            (sum, t) =>
              sum +
              (t.ground?.mesh.geometry.getAttribute('position').count ?? 0),
            0,
          ),
      );
      host.dataset.cameraHeight = String(
        Math.round(camera.position.y + baseline),
      );
      const [focusLon, focusLat] = origin.geographic(
        controls.target.x,
        controls.target.z,
      );
      host.dataset.focusCoordinates = `${focusLon.toFixed(6)},${focusLat.toFixed(6)}`;
      host.dataset.cameraBearing = controls.getAzimuthalAngle().toFixed(4);
      host.dataset.cameraDistance = String(
        Math.round(camera.position.distanceTo(controls.target)),
      );
      host.dataset.drawCalls = String(renderer.info.render.calls);
      host.dataset.triangles = String(renderer.info.render.triangles);
      host.dataset.fps = String(
        Math.round((fpsFrames * 1000) / (now - fpsStarted)),
      );
      fpsFrames = 0;
      fpsStarted = now;
    }
    if (controls.autoRotate && flightStarted) {
      flightFrames++;
      if (now - flightStarted >= 60000) {
        host.dataset.flightFps = (
          (flightFrames * 1000) /
          (now - flightStarted)
        ).toFixed(1);
        host.dataset.flightDuration = ((now - flightStarted) / 1000).toFixed(1);
      }
    }
    if (
      targetCamera ||
      controls.autoRotate ||
      settling < 3 ||
      lifeMoving ||
      weatherMoving ||
      travelMoving ||
      input.active ||
      zoomMoving
    )
      invalidate();
  }
  const motionChange = () => update(current);
  const visibilityChange = () => {
    previousTime = performance.now();
    if (document.hidden) {
      stopNavigation();
      cancelAnimationFrame(frame);
      frame = 0;
    } else {
      update(current);
      invalidate();
    }
  };
  reducedMotion.addEventListener('change', motionChange);
  document.addEventListener('visibilitychange', visibilityChange);
  controls.target.copy(
    point(
      ...manifest.areas.find(
        (a) => a.id === (collection.id === 'machu' ? 'machu' : 'urubamba'),
      )!.center,
    ),
  );
  camera.position
    .copy(controls.target)
    .add(new THREE.Vector3(6200, 5100, 7500));
  update(options);
  onReady(meta);
  return {
    travel: {
      ...travel.api,
      load(journey, onState) {
        navigation.reset();
        pointerZoom.reset();
        cancel();
        controls.autoRotate = false;
        travel.api.load(journey, onState);
      },
    },
    update,
    focus,
    getView,
    setView,
    async setCollection(next: Region, requestSignal: AbortSignal) {
      const [nextMeta, nextHeights] = await Promise.all([
        get(`/terrain/${next.id}.json`, requestSignal).then((r) =>
          r.json(),
        ) as Promise<TerrainMeta>,
        get(`/terrain/${next.id}.bin`, requestSignal).then(
          async (r) => new Float32Array(await r.arrayBuffer()),
        ),
      ]);
      if (requestSignal.aborted || disposed)
        throw new DOMException('Aborted', 'AbortError');
      measurement = {
        meta: nextMeta,
        heights: nextHeights,
        bounds: next.bounds,
      };
      collection = next;
      return nextMeta;
    },
    sample,
    probe,
    section,
    export() {
      environment.hideForExport(true);
      draw();
      const exported = document.createElement('canvas');
      exported.width = renderer.domElement.width;
      exported.height = renderer.domElement.height;
      const context = exported.getContext('2d')!;
      context.drawImage(renderer.domElement, 0, 0);
      const rect = renderer.domElement.getBoundingClientRect();
      context.scale(exported.width / rect.width, exported.height / rect.height);
      pins
        .filter(
          (pin) =>
            !pin.element.hidden && pin.element.style.visibility === 'visible',
        )
        .forEach((pin) => {
          const p = pin.element.getBoundingClientRect(),
            style = getComputedStyle(pin.element);
          context.fillStyle = style.backgroundColor;
          context.strokeStyle = style.borderColor;
          context.beginPath();
          context.roundRect(
            p.left - rect.left,
            p.top - rect.top,
            p.width,
            p.height,
            3,
          );
          context.fill();
          context.stroke();
          context.fillStyle = style.color;
          context.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
          context.textAlign = 'center';
          context.textBaseline = 'middle';
          context.fillText(
            pin.place.name,
            p.left - rect.left + p.width / 2,
            p.top - rect.top + p.height / 2,
          );
        });
      const credits = [
        'Terrain: USGS / NOAA via Mapzen. © OpenStreetMap contributors · openstreetmap.org/copyright',
        '© ESA WorldCover project 2021 / Contains modified Copernicus Sentinel data (2021) processed by ESA WorldCover consortium.',
        'Canopy: Meta & WRI CHMv2, 2026 release (CC BY 4.0), source imagery © Vantor. Buildings: Microsoft (CDLA Permissive 2.0). Inferred forms and activity are illustrative.',
      ];
      context.font = '9px sans-serif';
      context.textAlign = 'left';
      context.textBaseline = 'top';
      const lines: string[] = [];
      credits.forEach((credit) => {
        let line = '';
        credit.split(' ').forEach((word) => {
          const next = line ? `${line} ${word}` : word;
          if (context.measureText(next).width > rect.width - 38) {
            lines.push(line);
            line = word;
          } else line = next;
        });
        lines.push(line);
      });
      const h = lines.length * 12 + 12,
        y = rect.height - h - 10;
      context.fillStyle = 'rgba(19,35,31,0.88)';
      context.beginPath();
      context.roundRect(10, y, rect.width - 20, h, 3);
      context.fill();
      context.fillStyle = '#e4e9db';
      lines.forEach((line, i) => context.fillText(line, 17, y + 6 + i * 12));
      const link = document.createElement('a');
      link.download = `relief-world-${region.id}.png`;
      link.href = exported.toDataURL('image/png');
      link.click();
      environment.hideForExport(false);
      invalidate();
    },
    dispose() {
      disposed = true;
      cancelAnimationFrame(frame);

      tiles.forEach((tile) => {
        tile.loading?.abort();
        tile.detailLoading?.abort();
        tile.objects?.dispose();
        tile.ground?.dispose();
      });
      coarse.dispose();
      travel.dispose();
      environment.dispose();
      controls.dispose();
      pointerZoom.dispose();
      resize.disconnect();
      reducedMotion.removeEventListener('change', motionChange);
      document.removeEventListener('visibilitychange', visibilityChange);
      renderer.domElement.removeEventListener('keydown', keyboard);
      window.removeEventListener('keyup', keyup);
      window.removeEventListener('blur', stopNavigation);
      renderer.domElement.removeEventListener('blur', stopNavigation);
      renderer.domElement.removeEventListener(
        'pointerdown',
        cabPointerDown,
        true,
      );
      renderer.domElement.removeEventListener('pointermove', cabPointerMove);
      renderer.domElement.removeEventListener('pointerup', cabPointerUp, true);
      renderer.domElement.removeEventListener(
        'pointercancel',
        cabPointerUp,
        true,
      );
      renderer.domElement.removeEventListener('pointerdown', pointerStart);
      renderer.domElement.removeEventListener('pointerup', pointerPick);
      probeDot.geometry.dispose();
      probeMaterial.dispose();
      sectionLine.geometry.dispose();
      (sectionLine.material as THREE.Material).dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
      pins.forEach((pin) => pin.element.remove());
      for (const key of [
        'activeResources',
        'loadedTiles',
        'worldDetail',
        'flightFps',
        'flightDuration',
        'cameraHeight',
        'cameraDistance',
        'cameraClearance',
      ])
        delete host.dataset[key];
    },
  };
}
