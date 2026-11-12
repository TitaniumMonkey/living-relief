/** Sample an evenly spaced north-to-south elevation grid in geographic coordinates. */
export function sampleGrid(
  heights: Float32Array,
  n: number,
  bounds: readonly number[],
  lon: number,
  lat: number,
) {
  const [west, south, east, north] = bounds;
  const fx = Math.max(
    0,
    Math.min(n - 1, ((lon - west) / (east - west)) * (n - 1)),
  );
  const fy = Math.max(
    0,
    Math.min(n - 1, ((north - lat) / (north - south)) * (n - 1)),
  );
  const x = Math.min(n - 2, Math.floor(fx)),
    y = Math.min(n - 2, Math.floor(fy)),
    tx = fx - x,
    ty = fy - y;
  const top = heights[y * n + x] * (1 - tx) + heights[y * n + x + 1] * tx;
  const bottom =
    heights[(y + 1) * n + x] * (1 - tx) + heights[(y + 1) * n + x + 1] * tx;
  return top * (1 - ty) + bottom * ty;
}
export function distanceKm(
  a: { lat: number; lon: number },
  b: { lat: number; lon: number },
) {
  const r = Math.PI / 180,
    dLat = (b.lat - a.lat) * r,
    dLon = (b.lon - a.lon) * r;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}
