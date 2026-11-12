import { PNG } from 'pngjs';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { globalPixel, sampleTiles, extrema } from './terrain-grid.mjs';
/** @type {Array<[string, [number, number, number, number], number, number]>} */
const regions = [
  ['valley', [-72.65, -13.6, -71.75, -13.05], 13, 1025],
  ['machu', [-72.605, -13.205, -72.485, -13.12], 13, 513],
];
await mkdir('public/terrain', { recursive: true });
await mkdir('/private/tmp/relief-tiles', { recursive: true });
for (const [id, bounds, zoom, n] of regions) {
  const [west, south, east, north] = bounds;
  const [x0, y0] = globalPixel(west, north, zoom);
  const [x1, y1] = globalPixel(east, south, zoom);
  /** @type {Array<[number, number]>} */
  const tasks = [];
  for (
    let x = Math.floor(x0 / 256);
    x <= Math.floor((Math.floor(x1) + 1) / 256);
    x++
  )
    for (
      let y = Math.floor(y0 / 256);
      y <= Math.floor((Math.floor(y1) + 1) / 256);
      y++
    )
      tasks.push([x, y]);
  const tiles = new Map();
  let next = 0;
  await Promise.all(
    Array.from({ length: 6 }, async () => {
      while (next < tasks.length) {
        const [x, y] = tasks[next++];
        const path = `/private/tmp/relief-tiles/${zoom}-${x}-${y}.png`;
        let bytes;
        try {
          bytes = await readFile(path);
        } catch (error) {
          if (error.code !== 'ENOENT') throw error;
          const response = await fetch(
            `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${zoom}/${x}/${y}.png`,
          );
          if (!response.ok)
            throw new Error(`Terrain ${response.status}: ${id}`);
          bytes = Buffer.from(await response.arrayBuffer());
          await writeFile(path, bytes);
        }
        tiles.set(`${x}/${y}`, PNG.sync.read(bytes));
      }
    }),
  );
  const heights = new Float32Array(n * n);
  for (let row = 0; row < n; row++)
    for (let col = 0; col < n; col++) {
      const [px, py] = globalPixel(
        west + ((east - west) * col) / (n - 1),
        north + ((south - north) * row) / (n - 1),
        zoom,
      );
      heights[row * n + col] = sampleTiles(tiles, px, py);
    }
  const { min, max } = extrema(heights);
  await writeFile(`public/terrain/${id}.bin`, Buffer.from(heights.buffer));
  await writeFile(
    `public/terrain/${id}.json`,
    JSON.stringify({
      id,
      bounds,
      zoom,
      n,
      min,
      max,
      source: 'Mapzen Terrain Tiles / AWS Open Data',
      accessed: new Date().toISOString().slice(0, 10),
      interpolation: 'bilinear across tile boundaries',
      layers: `/layers/${id}.json`,
      sampleSpacingMeters: Math.round(
        ((east - west) *
          111320 *
          Math.cos((((north + south) / 2) * Math.PI) / 180)) /
          (n - 1),
      ),
    }),
  );
  console.log(
    `${id}: ${n * n} samples, ${Math.round(min)}–${Math.round(max)} m, ${tiles.size} source tiles`,
  );
}
