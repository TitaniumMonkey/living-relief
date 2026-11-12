export type LonLat = [number, number];
export function foundation(elevations: number[], height: number) {
  let base = -Infinity,
    bottom = Infinity;
  for (const elevation of elevations) {
    base = Math.max(base, elevation);
    bottom = Math.min(bottom, elevation);
  }
  return { base, bottom: bottom - 0.4, top: base + height };
}
export function buildingHeight(properties: {
  height?: number;
  levels?: number;
}) {
  return (
    properties.height ??
    (properties.levels === undefined ? 6 : properties.levels * 3)
  );
}
export function insideRing([x, y]: LonLat, ring: LonLat[]) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i],
      [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi)
      inside = !inside;
  }
  return inside;
}
export function canDrive(highway: string | undefined, area: string) {
  return (
    area !== 'machu' &&
    [
      'primary',
      'secondary',
      'tertiary',
      'residential',
      'unclassified',
      'service',
    ].includes(highway ?? '')
  );
}
export function routePosition(
  points: LonLat[],
  cumulative: number[],
  distance: number,
): LonLat {
  let segment = 1;
  while (segment < cumulative.length - 1 && cumulative[segment] < distance)
    segment++;
  const ratio =
    (distance - cumulative[segment - 1]) /
    (cumulative[segment] - cumulative[segment - 1]);
  return [
    points[segment - 1][0] +
      (points[segment][0] - points[segment - 1][0]) * ratio,
    points[segment - 1][1] +
      (points[segment][1] - points[segment - 1][1]) * ratio,
  ];
}
export function seeded(seed: string) {
  let state = 2166136261;
  for (const character of seed)
    state = Math.imul(state ^ character.charCodeAt(0), 16777619);
  return () => {
    state = (Math.imul(1664525, state) + 1013904223) | 0;
    return (state >>> 0) / 4294967296;
  };
}

export function supportsPitchedRoof(ring: LonLat[]) {
  if (ring.length !== 5) return false;
  let sign = 0;
  for (let i = 0; i < 4; i++) {
    const a = ring[i],
      b = ring[(i + 1) % 4],
      c = ring[(i + 2) % 4];
    const cross = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]);
    if (cross === 0 || (sign !== 0 && Math.sign(cross) !== sign)) return false;
    sign = Math.sign(cross);
  }
  return true;
}

export function grazingSlope(
  center: [number, number, number],
  east: [number, number, number],
  north: [number, number, number],
) {
  const dx = Math.hypot(east[0] - center[0], east[2] - center[2]);
  const dz = Math.hypot(north[0] - center[0], north[2] - center[2]);
  return Math.hypot((east[1] - center[1]) / dx, (north[1] - center[1]) / dz);
}

/** An illustrative narrow cross-section; its centerline remains the mapped retaining wall. */
export function terraceSection(
  a: [number, number, number],
  b: [number, number, number],
  sampleHeight: (x: number, z: number) => number,
  height: number,
  width = 2.4,
) {
  const length = Math.hypot(b[0] - a[0], b[2] - a[2]),
    nx = (b[2] - a[2]) / length,
    nz = (a[0] - b[0]) / length;
  const mx = (a[0] + b[0]) / 2,
    mz = (a[2] + b[2]) / 2;
  const side =
    sampleHeight(mx + nx * width, mz + nz * width) >=
    sampleHeight(mx - nx * width, mz - nz * width)
      ? 1
      : -1;
  const frontA: [number, number, number] = [
    a[0] + nx * 0.42 * side,
    a[1] + height,
    a[2] + nz * 0.42 * side,
  ];
  const frontB: [number, number, number] = [
    b[0] + nx * 0.42 * side,
    b[1] + height,
    b[2] + nz * 0.42 * side,
  ];
  const groundA: [number, number, number] = [
    a[0] + nx * (width + 0.42) * side,
    0,
    a[2] + nz * (width + 0.42) * side,
  ];
  const groundB: [number, number, number] = [
    b[0] + nx * (width + 0.42) * side,
    0,
    b[2] + nz * (width + 0.42) * side,
  ];
  groundA[1] = sampleHeight(groundA[0], groundA[2]);
  groundB[1] = sampleHeight(groundB[0], groundB[2]);
  const backA: [number, number, number] = [
    groundA[0],
    Math.max(frontA[1], groundA[1]),
    groundA[2],
  ];
  const backB: [number, number, number] = [
    groundB[0],
    Math.max(frontB[1], groundB[1]),
    groundB[2],
  ];
  return { frontA, frontB, backA, backB, groundA, groundB };
}
