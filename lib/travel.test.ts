import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  advanceJourney,
  directionsUrl,
  sampleLeg,
  type Journey,
  type TravelNetwork,
  type TravelPoint,
} from './travel.ts';
import { findTravelLeg } from './travel-routing.ts';
const p = (id: string, lon: number): TravelPoint => ({
  id,
  name: id,
  lon,
  lat: 0,
});
const network: TravelNetwork = {
  source: {
    url: 'https://example.test/map',
    date: '2026-01-01',
    license: 'synthetic',
    notes: [],
  },
  nodes: [
    [0, 0],
    [0.01, 0],
    [0.02, 0],
    [0.01, 0.01],
  ],
  edges: [
    [0, 1, 1112, 1, 0],
    [1, 2, 1112, 1, 0],
    [1, 3, 1112, 2, 0],
    [3, 1, 1112, 2, 0],
  ],
};
await test('route search respects direction, travel mode and dead-end destinations', () => {
  const leg = findTravelLeg(network, p('start', 0), p('end', 0.02), 'drive');
  assert.deepEqual(leg.coordinates, network.nodes.slice(0, 3));
  assert.throws(() =>
    findTravelLeg(network, p('end', 0.02), p('start', 0), 'drive'),
  );
  assert.throws(() =>
    findTravelLeg(network, p('start', 0), p('end', 0.02), 'train'),
  );
});
await test('playback speed and leg transitions preserve distance, endpoints and separate transfer legs', () => {
  const leg = {
    mode: 'train' as const,
    coordinates: [
      [0, 0],
      [0.01, 0],
    ] as [number, number][],
    cumulative: [0, 100],
    tunnels: [false, true],
    distance: 100,
    startGap: 0,
    endGap: 0,
  };
  const j: Journey = {
    from: p('a', 0),
    to: p('b', 0.01),
    legs: [leg, { ...leg, mode: 'walk' }],
    distance: 200,
  };
  assert.equal(advanceJourney(j, 0, 1, 2), 20);
  assert.equal(advanceJourney(j, 0, 11, 1), 101.3);
  assert.equal(advanceJourney(j, 190, 100, 2), 200);
  assert.deepEqual(sampleLeg(leg, 50), {
    coordinate: [0.005, 0],
    tunnel: true,
  });
  assert.deepEqual(sampleLeg(leg, 100).coordinate, [0.01, 0]);
  const url = new URL(directionsUrl(p('a', 0), p('b', 0.01), 'train'));
  assert.equal(url.searchParams.get('travelmode'), 'transit');
  assert.equal(url.searchParams.get('destination'), '0,0.01');
});
