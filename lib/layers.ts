export type GeoBounds = [number, number, number, number];
export type RegionLayers = {
  landcover: string;
  features: string;
  sourceExtract: string;
};
export type LandcoverMeta = {
  n: number;
  bounds: GeoBounds;
  source: string;
  year: number;
  dataUrl: string;
  classes: { value: number; label: string; color: string }[];
  attribution: string;
};
export type LayerPosition = [number, number];
export type LayerGeometry =
  | { type: 'Point'; coordinates: LayerPosition }
  | { type: 'LineString'; coordinates: LayerPosition[] }
  | { type: 'MultiLineString'; coordinates: LayerPosition[][] }
  | { type: 'Polygon'; coordinates: LayerPosition[][] }
  | { type: 'MultiPolygon'; coordinates: LayerPosition[][][] };
export type LayerFeature = {
  type: 'Feature';
  id?: string;
  properties: {
    kind: 'river' | 'water' | 'settlement';
    name?: string;
    waterway?: 'river' | 'stream';
  };
  geometry: LayerGeometry;
};
export type LayerFeatureCollection = {
  type: 'FeatureCollection';
  features: LayerFeature[];
  attribution?: string;
};
