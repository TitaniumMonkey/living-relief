"""Read-only connectivity checks against the produced mapped network."""
import heapq
import gzip
import json
import math
from pathlib import Path

graph = json.loads(gzip.decompress(Path('public/travel/network.json.gz').read_bytes()))


def nearby(a, b):
    return math.hypot((a[0] - b[0]) * 108300, (a[1] - b[1]) * 111195)


def check(name, start, finish, mode):
    adjacency = {}
    for u, v, distance, mask, tunnel in graph['edges']:
        if mask & mode:
            adjacency.setdefault(u, []).append((v, distance, tunnel))
    starts = heapq.nsmallest(8, ((nearby(graph['nodes'][n], start), n) for n in adjacency))
    ends = heapq.nsmallest(8, ((nearby(graph['nodes'][n], finish), n) for n in adjacency))
    goals = {n for _, n in ends}
    end = -1
    queue = starts.copy()
    heapq.heapify(queue)
    best, previous = {n: gap for gap, n in starts}, {}
    while queue:
        distance, u = heapq.heappop(queue)
        if distance != best[u]:
            continue
        if u in goals:
            end = u
            break
        for v, length, tunnel in adjacency.get(u, ()):
            value = distance + length
            if value < best.get(v, math.inf):
                best[v] = value
                previous[v] = (u, tunnel)
                heapq.heappush(queue, (value, v))
    count, tunnels, u = 1, 0, end
    while u in previous:
        u, tunnel = previous[u]
        tunnels += tunnel
        count += 1
    begin = u if end >= 0 else starts[0][1]
    final = end if end >= 0 else ends[0][1]
    result = {'route': name, 'connected': end in best,
              'mappedMetres': round(best[end] - nearby(graph['nodes'][begin], start), 1) if end in best else None,
              'sourceNodes': count, 'tunnelSegments': tunnels,
              'startSnapMetres': round(nearby(graph['nodes'][begin], start), 1),
              'endSnapMetres': round(nearby(graph['nodes'][final], finish), 1)}
    print(json.dumps(result))
    return result


if __name__ == '__main__':
    check('Ollantaytambo station to Machu Picchu Pueblo station', [-72.2705005, -13.2630725], [-72.5239692, -13.1558504], 4)
    check('Machu Picchu Pueblo station to Ollantaytambo station', [-72.5239692, -13.1558504], [-72.2705005, -13.2630725], 4)
    check('Cusco airport to Ollantaytambo town', [-71.9436718, -13.5378953], [-72.264, -13.258], 1)
    check('Ollantaytambo town to Urubamba', [-72.264, -13.258], [-72.116, -13.305], 1)
    check('Aguas Calientes to Machu Picchu', [-72.5239692, -13.1558504], [-72.545, -13.1631], 2)
