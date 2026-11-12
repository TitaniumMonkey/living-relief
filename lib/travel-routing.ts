import {
  travelDistance,
  type TravelLeg,
  type TravelMode,
  type TravelNetwork,
  type TravelPoint,
} from './travel.ts';
const masks = { drive: 1, walk: 2, train: 4 };
/** Routes only over bundled, mode-eligible directed OSM edges; never bridges a disconnected graph. */
export function findTravelLeg(
  network: TravelNetwork,
  from: TravelPoint,
  to: TravelPoint,
  mode: TravelMode,
): TravelLeg {
  const adjacency: [number, number, number][][] = Array.from(
    { length: network.nodes.length },
    () => [],
  );
  const incoming = new Uint8Array(network.nodes.length);
  for (const [a, b, length, mask, tunnel] of network.edges)
    if (mask & masks[mode]) {
      adjacency[a].push([b, length, tunnel]);
      incoming[b] = 1;
    }
  const candidates = (point: TravelPoint, arrival = false) => {
    const nearest: { i: number; d: number }[] = [];
    for (let i = 0; i < network.nodes.length; i++)
      if (arrival ? incoming[i] : adjacency[i].length) {
        const d = travelDistance(network.nodes[i], [point.lon, point.lat]);
        if (nearest.length < 8 || d < nearest[nearest.length - 1].d) {
          nearest.push({ i, d });
          nearest.sort((a, b) => a.d - b.d);
          if (nearest.length > 8) nearest.pop();
        }
      }
    return nearest;
  };
  const starts = candidates(from),
    ends = candidates(to, true),
    limit = mode === 'train' ? 1200 : mode === 'drive' ? 700 : 250;
  if (
    !starts.length ||
    starts[0].d > limit ||
    !ends.length ||
    ends[0].d > limit
  )
    throw new Error(
      'No mapped route near this place for the selected travel mode. Try walking or another nearby stop.',
    );
  const goals = new Map(
    ends.filter((p) => p.d <= limit).map((p) => [p.i, p.d]),
  );
  const distances = new Float64Array(network.nodes.length).fill(Infinity),
    prev = new Int32Array(network.nodes.length).fill(-1),
    tunnels = new Uint8Array(network.nodes.length);
  const heap: [number, number][] = [];
  const push = (item: [number, number]) => {
    let i = heap.length;
    heap.push(item);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (heap[p][0] <= item[0]) break;
      heap[i] = heap[p];
      i = p;
    }
    heap[i] = item;
  };
  const pop = () => {
    const first = heap[0],
      last = heap.pop()!;
    if (heap.length) {
      let i = 0;
      while (i * 2 + 1 < heap.length) {
        let j = i * 2 + 1;
        if (j + 1 < heap.length && heap[j + 1][0] < heap[j][0]) j++;
        if (heap[j][0] >= last[0]) break;
        heap[i] = heap[j];
        i = j;
      }
      heap[i] = last;
    }
    return first;
  };
  for (const p of starts.filter((p) => p.d <= limit)) {
    distances[p.i] = p.d * 50;
    push([p.d * 50, p.i]);
  }
  let goal = -1,
    best = Infinity;
  while (heap.length) {
    const [d, a] = pop();
    if (d !== distances[a]) continue;
    if (d > best) break;
    if (goals.has(a) && d + goals.get(a)! * 50 < best) {
      goal = a;
      best = d + goals.get(a)! * 50;
    }
    for (const [b, length, tunnel] of adjacency[a])
      if (d + length < distances[b]) {
        distances[b] = d + length;
        prev[b] = a;
        tunnels[b] = tunnel;
        push([distances[b], b]);
      }
  }
  if (goal < 0)
    throw new Error(
      'The bundled map has no connected route for these stops and this mode. Open Google Maps for current directions.',
    );
  const indices: number[] = [];
  for (let i = goal; i >= 0; i = prev[i]) indices.push(i);
  indices.reverse();
  if (indices.length < 2)
    throw new Error(
      'These stops resolve to the same route access point. Choose places farther apart.',
    );
  const coordinates = indices.map((i) => network.nodes[i]),
    cumulative = [0];
  for (let i = 1; i < coordinates.length; i++)
    cumulative.push(
      cumulative[i - 1] + travelDistance(coordinates[i - 1], coordinates[i]),
    );
  return {
    mode,
    coordinates,
    cumulative,
    tunnels: indices.map((i) => Boolean(tunnels[i])),
    distance: cumulative.at(-1)!,
    startGap: travelDistance(coordinates[0], [from.lon, from.lat]),
    endGap: travelDistance(coordinates.at(-1)!, [to.lon, to.lat]),
  };
}
