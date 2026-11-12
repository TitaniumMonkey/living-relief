export function displayResolution(
  sourceSize: number,
  quality: 'balanced' | 'high',
) {
  return Math.min(sourceSize, quality === 'high' ? 1025 : 513);
}

export function surfaceNormal(
  heights: Float32Array,
  n: number,
  x: number,
  y: number,
  width: number,
  depth: number,
  scale: number,
): [number, number, number] {
  const left = Math.max(0, x - 1),
    right = Math.min(n - 1, x + 1);
  const top = Math.max(0, y - 1),
    bottom = Math.min(n - 1, y + 1);
  const dx =
    ((Math.max(0, heights[y * n + right]) -
      Math.max(0, heights[y * n + left])) *
      scale) /
    (((right - left) * width) / (n - 1));
  const dz =
    ((Math.max(0, heights[bottom * n + x]) -
      Math.max(0, heights[top * n + x])) *
      scale) /
    (((bottom - top) * depth) / (n - 1));
  const length = Math.hypot(dx, 1, dz);
  return [-dx / length, 1 / length, -dz / length];
}

export function geographicPoint(
  bounds: readonly number[],
  lon: number,
  lat: number,
  width: number,
  depth: number,
): [number, number] {
  const [west, south, east, north] = bounds;
  return [
    ((lon - west) / (east - west) - 0.5) * width,
    ((north - lat) / (north - south) - 0.5) * depth,
  ];
}

export function insideBounds(
  bounds: readonly number[],
  lon: number,
  lat: number,
) {
  return (
    lon >= bounds[0] && lon <= bounds[2] && lat >= bounds[1] && lat <= bounds[3]
  );
}

export function sampleSurface(
  elevations: Float32Array,
  n: number,
  bounds: readonly number[],
  lon: number,
  lat: number,
) {
  const fx = Math.max(
    0,
    Math.min(n - 1, ((lon - bounds[0]) / (bounds[2] - bounds[0])) * (n - 1)),
  );
  const fy = Math.max(
    0,
    Math.min(n - 1, ((bounds[3] - lat) / (bounds[3] - bounds[1])) * (n - 1)),
  );
  const x = Math.min(n - 2, Math.floor(fx)),
    y = Math.min(n - 2, Math.floor(fy));
  const tx = fx - x,
    ty = fy - y;
  const a = elevations[y * n + x],
    b = elevations[(y + 1) * n + x];
  const c = elevations[(y + 1) * n + x + 1],
    d = elevations[y * n + x + 1];
  return tx + ty <= 1
    ? a + tx * (d - a) + ty * (b - a)
    : c + (1 - tx) * (b - c) + (1 - ty) * (d - c);
}

export function labelOverlapsUI(
  x: number,
  y: number,
  width: number,
  height: number,
  panels: { left: number; top: number; right: number; bottom: number }[],
) {
  return panels.some(
    (panel) =>
      x + width / 2 + 8 > panel.left &&
      x - width / 2 - 8 < panel.right &&
      y + 8 > panel.top &&
      y - height - 8 < panel.bottom,
  );
}
