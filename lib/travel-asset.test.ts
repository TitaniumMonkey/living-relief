import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gzipSync } from 'node:zlib';
import { readTravelNetwork } from './travel-asset.ts';
await test('bundled network loads with both static and HTTP gzip delivery', async () => {
  const json = JSON.stringify({
    nodes: [[0, 0]],
    edges: [],
    source: { date: 'synthetic' },
  });
  assert.deepEqual(
    await readTravelNetwork(new Response(gzipSync(json))),
    JSON.parse(json),
  );
  assert.deepEqual(
    await readTravelNetwork(
      new Response(json, { headers: { 'content-encoding': 'gzip' } }),
    ),
    JSON.parse(json),
  );
});
