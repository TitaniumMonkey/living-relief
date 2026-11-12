import type { Place } from './places';
import type { WorldFeature } from './world-types';
import { seeded } from './world-object-math.ts';

const plaster = [
  '#c7b990',
  '#eadfc6',
  '#b26c43',
  '#c09269',
  '#dccba9',
  '#8d9f91',
  '#91a8a7',
  '#d7ae6d',
  '#b98175',
  '#9b624e',
];
const roofs = [
  '#9b4730',
  '#b65b38',
  '#824634',
  '#bb714a',
  '#6b7775',
  '#85918e',
  '#ad7758',
  '#947b61',
];
const mappedColorNames: Record<string, string> = {
  'Color hueso': '#ddd4bd',
  light_blue: '#add8e6',
  reflective: '#c0c0c0',
};

/** Mapped finishes take precedence; the repeatable local palette is illustrative. */
export function buildingAppearance(feature: WorldFeature) {
  const random = seeded(feature.id);
  const wall = plaster[Math.floor(random() * plaster.length)];
  const roof = roofs[Math.floor(random() * roofs.length)];
  return {
    wall:
      mappedColorNames[feature.properties.wallColor ?? ''] ??
      feature.properties.wallColor ??
      wall,
    roof:
      mappedColorNames[feature.properties.roofColor ?? ''] ??
      feature.properties.roofColor ??
      roof,
    wallFinish:
      feature.properties.wallMaterial === 'brick' ? 'brick' : 'plaster',
    roofFinish: ['metal', 'metal_sheet', 'corrugated_metal'].includes(
      feature.properties.roofMaterial ?? '',
    )
      ? 'metal'
      : 'tile',
  };
}

export function googleMapsUrl(place: { lat: number; lon: number }) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${place.lat},${place.lon}`)}`;
}

export function featurePlace(
  feature: WorldFeature,
  lon: number,
  lat: number,
): Place {
  const properties = feature.properties;
  const airport = properties.kind === 'aeroway';
  const use =
    properties.amenity ?? properties.tourism ?? properties.buildingType;
  const described = use && use !== 'yes' ? use.replaceAll('_', ' ') : undefined;
  const origin =
    properties.source === 'osm'
      ? 'OpenStreetMap'
      : properties.source === 'microsoft'
        ? 'Microsoft footprints'
        : properties.source;
  return {
    id: `feature:${feature.id}`,
    featureId: feature.id,
    name:
      properties.name ??
      (airport ? `Mapped ${properties.aeroway}` : 'Mapped building'),
    lon,
    lat,
    kind: airport
      ? 'MAPPED AIRPORT SURFACE'
      : properties.kind === 'ruin'
        ? 'MAPPED ARCHAEOLOGICAL STRUCTURE'
        : 'MAPPED BUILDING',
    note: airport
      ? `Mapped ${properties.aeroway}. ${properties.width ? `Recorded width: ${properties.width} m.` : 'Surface width is illustrative.'} Paint is illustrative. Geometry: ${origin}.`
      : `${described ? `Mapped as ${described}.` : 'Its use is not recorded in the bundled source.'} ${properties.height ? `Recorded height: ${properties.height} m.` : 'Height and architectural finishes are illustrative.'} Footprint: ${origin}.`,
    source: /^(way|relation)\/\d+$/.test(feature.id)
      ? `https://www.openstreetmap.org/${feature.id}`
      : undefined,
  };
}
