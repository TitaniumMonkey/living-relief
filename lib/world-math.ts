/** Region-centered east/south coordinates in metres; elevations remain independent. */
export function worldProjection(bounds: readonly number[]) {
  const lon = (bounds[0] + bounds[2]) / 2;
  const lat = (bounds[1] + bounds[3]) / 2;
  const longitudeMeters = 111320 * Math.cos((lat * Math.PI) / 180);
  return {
    project: (longitude: number, latitude: number): [number, number] => [
      (longitude - lon) * longitudeMeters,
      (lat - latitude) * 111320,
    ],
    geographic: (x: number, z: number): [number, number] => [
      lon + x / longitudeMeters,
      lat - z / 111320,
    ],
  };
}

/** Camera clearance uses absolute source elevation plus mapped structure height. */
export function cameraClearance(
  cameraHeight: number,
  terrainHeight: number,
  structureTop: number,
  clearance = 30,
) {
  return Math.max(
    cameraHeight,
    terrainHeight + clearance,
    structureTop + clearance,
  );
}

export function tileDistance(
  x: number,
  z: number,
  west: number,
  north: number,
  east: number,
  south: number,
) {
  return Math.hypot(
    Math.max(west - x, 0, x - east),
    Math.max(north - z, 0, z - south),
  );
}

/** Only boundaries facing the regional surface need elevation blending. */
export function exposedTileEdges(
  bounds: readonly number[],
  loaded: readonly (readonly number[])[],
) {
  const near = (a: number, b: number) => Math.abs(a - b) < 1e-9;
  const sameLatitude = (b: readonly number[]) =>
    near(b[1], bounds[1]) && near(b[3], bounds[3]);
  const sameLongitude = (b: readonly number[]) =>
    near(b[0], bounds[0]) && near(b[2], bounds[2]);
  return {
    west: !loaded.some((b) => near(b[2], bounds[0]) && sameLatitude(b)),
    east: !loaded.some((b) => near(b[0], bounds[2]) && sameLatitude(b)),
    north: !loaded.some((b) => near(b[1], bounds[3]) && sameLongitude(b)),
    south: !loaded.some((b) => near(b[3], bounds[1]) && sameLongitude(b)),
  };
}

export const naturalCover: Record<number, [number, number, number]> = {
  10: [59, 79, 49],
  20: [106, 120, 68],
  30: [126, 137, 81],
  40: [137, 148, 85],
  50: [153, 145, 126],
  60: [154, 145, 119],
  70: [226, 227, 219],
  80: [65, 103, 109],
  90: [87, 116, 80],
  95: [65, 95, 75],
  100: [133, 140, 95],
};
export const classifiedCover: Record<number, [number, number, number]> = {
  10: [32, 101, 62],
  20: [181, 149, 83],
  30: [160, 183, 101],
  40: [199, 183, 108],
  50: [166, 115, 96],
  60: [177, 171, 150],
  70: [236, 242, 231],
  80: [83, 135, 151],
  90: [90, 148, 128],
  95: [48, 121, 104],
  100: [154, 156, 110],
};

/** Natural color transitions blend observations; the classification raster stays unchanged. */
export function coverPixels(
  classes: Uint8Array,
  n: number,
  classified = false,
) {
  const bytes = new Uint8Array(n * n * 4);
  const palette = classified ? classifiedCover : naturalCover;
  const radius = classified ? 0 : 2;
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      const color = [0, 0, 0];
      let weight = 0;
      for (let dy = -radius; dy <= radius; dy++)
        for (let dx = -radius; dx <= radius; dx++) {
          const xx = Math.max(0, Math.min(n - 1, x + dx));
          const yy = Math.max(0, Math.min(n - 1, y + dy));
          const entry = palette[classes[yy * n + xx]] || naturalCover[60];
          const w = 1 / (1 + dx * dx + dy * dy);
          for (let i = 0; i < 3; i++) color[i] += entry[i] * w;
          weight += w;
        }
      const i = (y * n + x) * 4;
      for (let c = 0; c < 3; c++) bytes[i + c] = Math.round(color[c] / weight);
      bytes[i + 3] = 255;
    }
  return bytes;
}

/** Piecewise planar height of the rendered grid, including inserted geographic tile edges. */
export function sampleRectilinearSurface(
  xs: number[],
  ys: number[],
  elevations: Float32Array,
  lon: number,
  lat: number,
) {
  const interval = (values: number[], value: number, descending: boolean) => {
    let low = 0,
      high = values.length - 1;
    while (high - low > 1) {
      const middle = Math.floor((low + high) / 2);
      if (descending ? values[middle] > value : values[middle] < value)
        low = middle;
      else high = middle;
    }
    return low;
  };
  const x = interval(xs, lon, false),
    y = interval(ys, lat, true);
  const tx = Math.max(0, Math.min(1, (lon - xs[x]) / (xs[x + 1] - xs[x])));
  const ty = Math.max(0, Math.min(1, (ys[y] - lat) / (ys[y] - ys[y + 1])));
  const a = elevations[y * xs.length + x],
    b = elevations[(y + 1) * xs.length + x];
  const c = elevations[(y + 1) * xs.length + x + 1],
    d = elevations[y * xs.length + x + 1];
  return tx + ty <= 1
    ? a + tx * (d - a) + ty * (b - a)
    : c + (1 - tx) * (b - c) + (1 - ty) * (d - c);
}

/** Pixel coordinates for north-to-south geographic overlays on a ground texture. */
export function geographicPixel(
  bounds: readonly number[],
  size: number,
  lon: number,
  lat: number,
): [number, number] {
  return [
    ((lon - bounds[0]) / (bounds[2] - bounds[0])) * size,
    ((bounds[3] - lat) / (bounds[3] - bounds[1])) * size,
  ];
}

/** Object residency for a terrain tile, shared by loading and eviction. */
export function keepTileObjects(
  targetDistance: number,
  eyeDistance: number,
  orbitDistance: number,
  light: boolean,
  retained: boolean,
) {
  const radius = light ? (retained ? 3000 : 2200) : retained ? 7000 : 5500;
  return (
    Math.min(targetDistance, eyeDistance) < radius &&
    (eyeDistance < radius || orbitDistance < (retained ? 16000 : 13000))
  );
}
