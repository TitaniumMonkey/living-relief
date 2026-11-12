import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildingAppearance,
  featurePlace,
  googleMapsUrl,
} from './place-details.ts';
import type { WorldFeature } from './world-types.ts';
const feature: WorldFeature = {
  type: 'Feature',
  id: 'way/123',
  geometry: {
    type: 'Polygon',
    coordinates: [
      [
        [1, 2],
        [1.001, 2],
        [1.001, 2.001],
        [1, 2.001],
        [1, 2],
      ],
    ],
  },
  properties: {
    kind: 'building',
    source: 'OpenStreetMap',
    name: 'Example station',
    buildingType: 'train_station',
  },
};
void test('building selection reports source identity without inventing an unknown use', () => {
  assert.equal(featurePlace(feature, 1, 2).name, 'Example station');
  assert.equal(
    featurePlace(feature, 1, 2).source,
    'https://www.openstreetmap.org/way/123',
  );
  const anonymous = {
    ...feature,
    properties: { kind: 'building' as const, source: 'Microsoft' },
  };
  assert.equal(featurePlace(anonymous, 1, 2).name, 'Mapped building');
  assert.match(featurePlace(anonymous, 1, 2).note, /use is not recorded/);
});
void test('building materials retain mapped colors and remain stable between tile loads', () => {
  const mapped = {
    ...feature,
    properties: {
      ...feature.properties,
      wallColor: '#a45136',
      roofColor: '#405c70',
      roofMaterial: 'metal',
    },
  };
  assert.equal(buildingAppearance(mapped).wall, '#a45136');
  assert.equal(buildingAppearance(mapped).roof, '#405c70');
  assert.equal(buildingAppearance(mapped).roofFinish, 'metal');
  assert.deepEqual(buildingAppearance(feature), buildingAppearance(feature));
  assert.ok(
    new Set(
      Array.from(
        { length: 24 },
        (_, n) => buildingAppearance({ ...feature, id: `synthetic-${n}` }).roof,
      ),
    ).size > 3,
  );
});
void test('Google Maps link pins geographic coordinates without a key', () => {
  const url = new URL(googleMapsUrl({ lat: 2, lon: 1 }));
  assert.equal(url.host, 'www.google.com');
  assert.equal(url.searchParams.get('api'), '1');
  assert.equal(url.searchParams.get('query'), '2,1');
});

void test('mapped non-CSS finish names become renderable colors', () => {
  const appearance = buildingAppearance({
    ...feature,
    properties: {
      ...feature.properties,
      wallColor: 'light_blue',
      roofColor: 'reflective',
    },
  });
  assert.equal(appearance.wall, '#add8e6');
  assert.equal(appearance.roof, '#c0c0c0');
});

void test('airport surface selection describes mapped geometry instead of a building', () => {
  const place = featurePlace(
    {
      ...feature,
      properties: {
        kind: 'aeroway',
        source: 'osm',
        aeroway: 'runway',
        width: 45,
      },
    },
    1,
    2,
  );
  assert.equal(place.name, 'Mapped runway');
  assert.equal(place.kind, 'MAPPED AIRPORT SURFACE');
  assert.match(place.note, /45 m/);
  assert.doesNotMatch(place.note, /Height and architectural finishes/);
});
