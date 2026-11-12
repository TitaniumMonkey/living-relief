import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { Journey } from './travel.ts';
import { advanceJourney } from './travel.ts';
await test('the ride ships as ordinary JSON with a complete train-only route and no runtime graph', () => {
  const journey = JSON.parse(
    readFileSync(
      new URL('../public/travel/ollantaytambo-aguas.json', import.meta.url),
      'utf8',
    ),
  ) as Journey;
  assert.equal(journey.legs.length, 1);
  assert.equal(journey.legs[0].mode, 'train');
  assert.ok(journey.distance > 43000 && journey.distance < 43500);
  const leg = journey.legs[0];
  assert.equal(leg.coordinates.length, leg.cumulative.length);
  assert.equal(leg.coordinates.length, leg.tunnels.length);
  assert.ok(
    leg.cumulative.every((d, i) => i === 0 || d > leg.cumulative[i - 1]),
  );
  assert.equal(advanceJourney(journey, 0, 73, 60), journey.distance);
  assert.ok(advanceJourney(journey, 0, 73, 1) < journey.distance / 50);
});

await test('arrival stays on the inbound platform track without reversing into a siding', () => {
  const {
    legs: [leg],
  } = JSON.parse(
    readFileSync(
      new URL('../public/travel/ollantaytambo-aguas.json', import.meta.url),
      'utf8',
    ),
  ) as Journey;
  for (let i = 2; i < leg.coordinates.length; i++) {
    if (leg.distance - leg.cumulative[i] > 300) continue;
    const a = leg.coordinates[i - 2],
      b = leg.coordinates[i - 1],
      c = leg.coordinates[i];
    const x1 = (b[0] - a[0]) * Math.cos((b[1] * Math.PI) / 180),
      y1 = b[1] - a[1];
    const x2 = (c[0] - b[0]) * Math.cos((b[1] * Math.PI) / 180),
      y2 = c[1] - b[1];
    assert.ok(x1 * x2 + y1 * y2 > 0, `arrival reverses at vertex ${i}`);
  }
});
