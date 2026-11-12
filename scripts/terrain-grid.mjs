/** Web Mercator coordinates in global pixels; raster samples lie at pixel centres. */
export function globalPixel(lon, lat, zoom) {
  const scale = 256 * 2 ** zoom;
  return [
    ((lon + 180) / 360) * scale - 0.5,
    ((1 - Math.asinh(Math.tan((lat * Math.PI) / 180)) / Math.PI) / 2) * scale -
      0.5,
  ];
}
/** Bilinear sampling crosses tile boundaries instead of clamping at each tile edge. */
export function sampleTiles(tiles, px, py, tileSize = 256) {
  const x = Math.floor(px),
    y = Math.floor(py),
    fx = px - x,
    fy = py - y;
  const at = (cx, cy) => {
    const tile = tiles.get(
      `${Math.floor(cx / tileSize)}/${Math.floor(cy / tileSize)}`,
    );
    const i = ((cy % tileSize) * tileSize + (cx % tileSize)) * 4;
    return (
      tile.data[i] * 256 + tile.data[i + 1] + tile.data[i + 2] / 256 - 32768
    );
  };
  return (
    (at(x, y) * (1 - fx) + at(x + 1, y) * fx) * (1 - fy) +
    (at(x, y + 1) * (1 - fx) + at(x + 1, y + 1) * fx) * fy
  );
}
export function extrema(values) {
  let min = Infinity,
    max = -Infinity;
  for (const value of values) {
    min = Math.min(min, value);
    max = Math.max(max, value);
  }
  return { min, max };
}
