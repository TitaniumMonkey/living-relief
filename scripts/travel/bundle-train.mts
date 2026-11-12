import { readFileSync, writeFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { findTravelLeg } from '../../lib/travel-routing.ts';
const network = JSON.parse(
  gunzipSync(readFileSync('public/travel/network.json.gz')).toString(),
);
const from = {
  id: 'ollantaytambo',
  name: 'Ollantaytambo',
  lon: -72.2705005,
  lat: -13.2630725,
};
const to = {
  id: 'aguas-calientes',
  name: 'Aguas Calientes',
  lon: -72.5239692,
  lat: -13.1558504,
};
// Stop on the inbound mapped platform track, before the station switch reverses onto a siding.
const platformEnd = { ...to, lon: -72.5240549, lat: -13.1556404 };
const leg = findTravelLeg(network, from, platformEnd, 'train');
writeFileSync(
  'public/travel/ollantaytambo-aguas.json',
  JSON.stringify({
    from,
    to,
    distance: leg.distance,
    legs: [leg],
    source: network.source,
  }),
);
console.log(
  `Bundled ${leg.coordinates.length} mapped railway points, ${(leg.distance / 1000).toFixed(1)} km`,
);
