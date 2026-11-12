"""Bundle a bounded OSM travel graph; no requests or runtime routing service."""
import argparse
import json
import gzip
import math
from pathlib import Path

BOUNDS = (-72.65, -13.6, -71.75, -13.05)
DRIVE, WALK, TRAIN = 1, 2, 4
DRIVING = {'motorway', 'motorway_link', 'trunk', 'trunk_link', 'primary',
           'primary_link', 'secondary', 'secondary_link', 'tertiary',
           'tertiary_link', 'unclassified', 'residential', 'living_street',
           'service', 'track', 'road'}
WALKING = DRIVING - {'motorway', 'motorway_link'} | {'pedestrian', 'footway', 'path', 'steps', 'bridleway', 'cycleway'}
DENIED = {'no', 'private'}


def masks(tags):
    """Return forward/reverse access masks for a mapped way."""
    if tags.get('railway') in {'rail', 'narrow_gauge'}:
        # Operating railways can be private property while carrying passengers.
        if tags.get('access') == 'no' or tags.get('service') in {'yard', 'spur', 'siding'}:
            return 0, 0
        return TRAIN, TRAIN
    if tags.get('access') in DENIED:
        return 0, 0
    road = tags.get('highway')
    drive = road in DRIVING and tags.get('motor_vehicle', tags.get('vehicle', 'yes')) not in DENIED and tags.get('motorcar', 'yes') not in DENIED
    walk = road in WALKING and tags.get('foot', 'yes') not in DENIED
    forward = reverse = (DRIVE if drive else 0) | (WALK if walk else 0)
    oneway = tags.get('oneway', 'yes' if tags.get('junction') == 'roundabout' or road == 'motorway' else 'no')
    if oneway in {'yes', '1', 'true'}:
        reverse &= ~DRIVE
    elif oneway == '-1':
        forward &= ~DRIVE
    if tags.get('oneway:foot') in {'yes', '1', 'true'}:
        reverse &= ~WALK
    elif tags.get('oneway:foot') == '-1':
        forward &= ~WALK
    return forward, reverse


def distance(a, b):
    lon1, lat1, lon2, lat2 = map(math.radians, (*a, *b))
    h = math.sin((lat2 - lat1) / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin((lon2 - lon1) / 2) ** 2
    return round(12742000 * math.asin(min(1, math.sqrt(h))), 2)


class Graph:
    def __init__(self):
        self.nodes = []
        self.index = {}
        self.edges = {}

    def add_way(self, refs, tags, coordinates):
        forward, reverse = masks(tags)
        tunnel = int(tags.get('tunnel', 'no') not in {'no', 'false', '0'})
        if not (forward or reverse):
            return
        for a, b in zip(refs, refs[1:]):
            # Do not bridge missing/out-of-bounds nodes with invented segments.
            if a not in coordinates or b not in coordinates or a == b:
                continue
            for ref in (a, b):
                if ref not in self.index:
                    self.index[ref] = len(self.nodes)
                    self.nodes.append(coordinates[ref])
            start, end = self.index[a], self.index[b]
            metres = distance(coordinates[a], coordinates[b])
            for u, v, mask in ((start, end, forward), (end, start, reverse)):
                if mask:
                    key = (u, v, tunnel)
                    previous = self.edges.get(key)
                    self.edges[key] = (metres, mask | (previous[1] if previous else 0))

    def export_edges(self):
        return [[u, v, length, mask, tunnel] for (u, v, tunnel), (length, mask) in self.edges.items()]


def prepare(pbf, output):
    import osmium
    graph = Graph()
    coordinates = {}
    stations = []

    class Nodes(osmium.SimpleHandler):
        def node(self, node):
            lon, lat = node.location.lon, node.location.lat
            if BOUNDS[0] <= lon <= BOUNDS[2] and BOUNDS[1] <= lat <= BOUNDS[3]:
                coordinates[node.id] = [round(lon, 7), round(lat, 7)]
                if node.tags.get('railway') in {'station', 'halt'}:
                    stations.append({'id': node.id, 'name': node.tags.get('name', ''), 'coordinate': coordinates[node.id]})

    class Ways(osmium.SimpleHandler):
        def way(self, way):
            tags = dict(way.tags)
            if tags.get('highway') or tags.get('railway') in {'rail', 'narrow_gauge'}:
                graph.add_way([n.ref for n in way.nodes], tags, coordinates)

    Nodes().apply_file(str(pbf))
    print(f'{len(coordinates):,} bounded source nodes', flush=True)
    Ways().apply_file(str(pbf))
    reader = osmium.io.Reader(str(pbf))
    header = reader.header()
    source_date = header.get('osmosis_replication_timestamp') or header.get('timestamp') or 'unknown'
    reader.close()
    source = {
        'url': 'https://download.geofabrik.de/south-america/peru.html',
        'date': source_date,
        'license': 'OpenStreetMap contributors · ODbL 1.0 · https://www.openstreetmap.org/copyright',
        'bounds': list(BOUNDS),
        'notes': ['One-time extract from the cached Peru OSM PBF. Includes operational railway=rail and railway=narrow_gauge (the mapped 914 mm PeruRail passenger line), excluding abandoned/disused/proposed lines. Directed driving and walking edges; railway edges permit illustrative travel in either direction. Rail access=private is retained because operating passenger tracks are private infrastructure; rail access=no and yard/spur/siding tracks are excluded. Road access and motor/foot restrictions are honored as tagged. Destination-only roads remain available for reaching destinations. No turn restrictions, schedules, traffic, conditional restrictions or live navigation; distances are mapped segment lengths, not travel-time guarantees. Missing/out-of-bounds segments are not connected artificially. Map data is not permission to enter restricted places.'],
    }
    output.mkdir(parents=True, exist_ok=True)
    payload = json.dumps({'source': source, 'nodes': graph.nodes, 'edges': graph.export_edges()}, separators=(',', ':')).encode()
    (output / 'network.json.gz').write_bytes(gzip.compress(payload, mtime=0))
    (output / 'source.json').write_text(json.dumps(source, indent=2) + '\n')
    (output / 'stations.json').write_text(json.dumps(stations, ensure_ascii=False, indent=2) + '\n')
    print(f'{len(graph.nodes):,} nodes, {len(graph.edges):,} directed edges; source {source_date}', flush=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--pbf', type=Path, default=Path('/private/tmp/relief-layer-cache/peru.osm.pbf'))
    parser.add_argument('--output', type=Path, default=Path('public/travel'))
    args = parser.parse_args()
    prepare(args.pbf, args.output)
