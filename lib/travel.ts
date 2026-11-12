export type TravelMode = 'drive' | 'walk' | 'train';
export type TravelPoint = {
  id: string;
  name: string;
  lon: number;
  lat: number;
};
export type TravelNetwork = {
  nodes: [number, number][];
  edges: [number, number, number, number, number][];
  source: { url: string; date: string; license: string; notes: string[] };
};
export type TravelLeg = {
  mode: TravelMode;
  coordinates: [number, number][];
  cumulative: number[];
  tunnels: boolean[];
  distance: number;
  startGap: number;
  endGap: number;
};
export type Journey = {
  from: TravelPoint;
  to: TravelPoint;
  legs: TravelLeg[];
  distance: number;
};
export type TravelState = {
  progress: number;
  paused: boolean;
  speed: number;
  view: 'ride' | 'overview' | 'onboard' | 'window';
  phase: 'boarding' | 'departing' | 'travelling' | 'paused' | 'arrived';
  transitioning: boolean;
  inTunnel: boolean;
  mode: TravelMode;
  complete: boolean;
  reducedMotion: boolean;
};
export type TravelAPI = {
  load(journey: Journey, onState: (state: TravelState) => void): void;
  configure(
    options: Partial<Pick<TravelState, 'paused' | 'speed' | 'view'>> & {
      showRoute?: boolean;
    },
  ): void;
  seek(progress: number): void;
  look(yaw: number, pitch: number): void;
  stop(): void;
};
export function directionsUrl(
  from: TravelPoint,
  to: TravelPoint,
  mode: TravelMode,
) {
  const query = new URLSearchParams({
    api: '1',
    origin: `${from.lat},${from.lon}`,
    destination: `${to.lat},${to.lon}`,
    travelmode:
      mode === 'train' ? 'transit' : mode === 'drive' ? 'driving' : 'walking',
  });
  return `https://www.google.com/maps/dir/?${query}`;
}
export function travelDistance(a: [number, number], b: [number, number]) {
  const radians = Math.PI / 180,
    lat = (b[1] - a[1]) * radians,
    lon = (b[0] - a[0]) * radians;
  const h =
    Math.sin(lat / 2) ** 2 +
    Math.cos(a[1] * radians) *
      Math.cos(b[1] * radians) *
      Math.sin(lon / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}
export function sampleLeg(leg: TravelLeg, distance: number) {
  const d = Math.max(0, Math.min(leg.distance, distance));
  let low = 0,
    high = leg.cumulative.length - 1;
  while (low + 1 < high) {
    const mid = (low + high) >> 1;
    if (leg.cumulative[mid] <= d) low = mid;
    else high = mid;
  }
  const t =
    (d - leg.cumulative[low]) / (leg.cumulative[high] - leg.cumulative[low]);
  const a = leg.coordinates[low],
    b = leg.coordinates[high];
  return {
    coordinate: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t] as [
      number,
      number,
    ],
    tunnel: leg.tunnels[high],
  };
}
export function advanceJourney(
  journey: Journey,
  distance: number,
  seconds: number,
  speed: number,
) {
  let d = distance,
    remaining = seconds * speed;
  for (const leg of journey.legs) {
    if (d >= leg.distance) {
      d -= leg.distance;
      continue;
    }
    const metresPerSecond =
      leg.mode === 'walk' ? 1.3 : leg.mode === 'train' ? 10 : 8.3;
    const available = (leg.distance - d) / metresPerSecond;
    if (remaining <= available)
      return Math.min(journey.distance, distance + remaining * metresPerSecond);
    distance += leg.distance - d;
    remaining -= available;
    d = 0;
  }
  return journey.distance;
}
