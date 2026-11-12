import type { GeoBounds, LayerGeometry } from './layers';

export type WorldOptions = {
  mode: 'relief' | 'world';
  buildings: boolean;
  ruins: boolean;
  trees: boolean;
  vegetation: boolean;
  animals: boolean;
  people: boolean;
  vehicles: boolean;
  timeOfDay: number;
  dayCycle: boolean;
  weather: 'clear' | 'cloudy' | 'mist' | 'rain';
  weatherIntensity: number;
  clouds: boolean;
  worldPaused: boolean;
  worldSpeed: number;
};

export const initialWorldOptions: WorldOptions = {
  mode: 'relief',
  buildings: true,
  ruins: true,
  trees: true,
  vegetation: true,
  animals: true,
  people: true,
  vehicles: true,
  timeOfDay: 14,
  dayCycle: false,
  weather: 'clear',
  weatherIntensity: 0.5,
  clouds: true,
  worldPaused: false,
  worldSpeed: 1,
};

export type WorldFeature = {
  type: 'Feature';
  inferredBasins?: {
    footprint: [number, number][][];
    pools: [number, number][][][];
    rims: [number, number][][][];
  }[];
  surfaceGrid?: {
    vertices: [number, number][];
    indices: number[];
    spacingMeters?: number;
  };
  id: string;
  geometry: LayerGeometry;
  properties: {
    kind:
      | 'building'
      | 'road'
      | 'path'
      | 'tree'
      | 'farmland'
      | 'water'
      | 'ruin'
      | 'terrace'
      | 'saltpan'
      | 'aeroway'
      | 'airfield';
    aeroway?: 'runway' | 'taxiway' | 'apron';
    width?: number;
    ref?: string;
    name?: string;
    height?: number;
    levels?: number;
    roofShape?: string;
    wallColor?: string;
    roofColor?: string;
    wallMaterial?: string;
    roofMaterial?: string;
    amenity?: string;
    tourism?: string;
    historic?: string;
    wikidata?: string;
    wikipedia?: string;
    buildingType?: string;
    highway?: string;
    source: string;
    inferred?: boolean;
  };
};

export type WorldFeatures = {
  type: 'FeatureCollection';
  features: WorldFeature[];
};

export type WorldTile = {
  id: string;
  bounds: GeoBounds;
  terrain: { url: string; n: number };
  landcover: { url: string; n: number; haloUrl?: string; halo?: number };
  features: string;
};

export type WorldArea = {
  id: string;
  detail?: 'full' | 'light';
  name: string;
  center: [number, number];
  bounds: GeoBounds;
  tiles: WorldTile[];
};

export type WorldManifest = {
  version: 1;
  areas: WorldArea[];
  sources: { name: string; url: string; date: string; license: string }[];
  notes: string[];
};

export type GeographicView = {
  lon: number;
  lat: number;
  distance: number;
  azimuth: number;
  polar: number;
};
