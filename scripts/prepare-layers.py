"""Prepare offline ESA WorldCover 2021 and OpenStreetMap extracts (Geofabrik snapshot).
Run from project root using Python with rasterio, numpy, shapely, osmium and requests.
Source COGs and OSM snapshot are cached outside the project.
"""
import json
from collections import Counter
from datetime import date
from pathlib import Path
import numpy as np
import requests
import rasterio
from rasterio.warp import reproject, Resampling
from rasterio.transform import from_bounds
from shapely.geometry import LineString, Point, box, mapping
from shapely.ops import unary_union

ROOT = Path('public/layers')
CACHE = Path('/private/tmp/relief-layer-cache')
ROOT.mkdir(parents=True, exist_ok=True)
CACHE.mkdir(parents=True, exist_ok=True)
REGIONS = {'valley': ([-72.65, -13.6, -71.75, -13.05], 1024), 'machu': ([-72.605, -13.205, -72.485, -13.12], 513)}
CLASSES = [(10, 'Forest', '#385c45'), (20, 'Shrubland', '#839165'), (30, 'Grassland', '#b5ae79'),
           (40, 'Cropland', '#d6bc78'), (50, 'Built areas', '#bd8065'), (60, 'Bare ground', '#ada28f'),
           (70, 'Snow and ice', '#e1e9e5'), (80, 'Water', '#63999d'), (90, 'Wetland', '#7c9f86'),
           (95, 'Mangroves', '#486c59'), (100, 'Moss and lichen', '#afa98c')]
CREDIT = '© ESA WorldCover project 2021 / Contains modified Copernicus Sentinel data (2021) processed by ESA WorldCover consortium'
SOURCES = []
for tile in ['S15W075', 'S15W072']:
    url = f'https://esa-worldcover.s3.eu-central-1.amazonaws.com/v200/2021/map/ESA_WorldCover_10m_2021_v200_{tile}_Map.tif'
    path = CACHE / f'{tile}.tif'
    if not path.exists():
        response = requests.get(url, timeout=180)
        response.raise_for_status()
        path.write_bytes(response.content)
    SOURCES.append((path, url))
    print(f'WorldCover {tile}: {path.stat().st_size} bytes', flush=True)
for region, (bounds, n) in REGIONS.items():
    target = np.zeros((n, n), dtype=np.uint8)
    for path, _ in SOURCES:
        with rasterio.open(path) as source:
            reproject(source=rasterio.band(source, 1), destination=target,
                      src_transform=source.transform, src_crs=source.crs,
                      dst_transform=from_bounds(*bounds, n, n), dst_crs='EPSG:4326',
                      src_nodata=0, dst_nodata=0, init_dest_nodata=False, resampling=Resampling.nearest)
    if np.any(target == 0):
        raise ValueError(f'{region}: uncovered WorldCover cells')
    (ROOT / f'{region}-landcover.bin').write_bytes(target.tobytes())
    meta = {'n': n, 'bounds': bounds, 'source': 'ESA WorldCover 2021 v200', 'year': 2021,
            'dataUrl': f'/layers/{region}-landcover.bin', 'attribution': CREDIT,
            'classes': [{'value': v, 'label': label, 'color': color} for v, label, color in CLASSES],
            'processing': 'Nearest-neighbour categorical resampling of 10 m source to display grid; no interpolated classes.',
            'sourceUrls': [url for _, url in SOURCES], 'license': 'CC BY 4.0',
            'sourceUrl': 'https://esa-worldcover.org/en/data-access', 'accessed': str(date.today())}
    (ROOT / f'{region}-landcover.json').write_text(json.dumps(meta, separators=(',', ':')))
    print(f'{region}: landcover {dict(zip(*np.unique(target, return_counts=True)))}', flush=True)

# A fixed Geofabrik snapshot makes the processed extracts reproducible without a live query.
import osmium
from shapely.geometry import shape
PBF_URL = 'https://download.geofabrik.de/south-america/peru-260903.osm.pbf'
pbf_path = CACHE / 'peru.osm.pbf'
if not pbf_path.exists():
    response = requests.get(PBF_URL, timeout=240)
    response.raise_for_status()
    pbf_path.write_bytes(response.content)
west, south, east, north = REGIONS['valley'][0]
area_bounds = box(west, south, east, north)
factory = osmium.geom.GeoJSONFactory()
geometries = []
unusable_areas = []

class ExtractLayers(osmium.SimpleHandler):
    def store(self, osm_id, geometry, kind, tags):
        if geometry.is_empty or not geometry.intersects(area_bounds):
            return
        element = {'id': osm_id, 'tags': dict(tags), 'geometry': mapping(geometry)}
        from shapely import make_valid
        if not geometry.is_valid:
            geometry = make_valid(geometry)
        geometries.append((element, geometry, kind))

    def node(self, node):
        if node.tags.get('place') in ['city', 'town', 'village']:
            self.store(f'node/{node.id}', Point(node.location.lon, node.location.lat), 'settlement', node.tags)

    def way(self, way):
        if way.tags.get('waterway') in ['river', 'stream']:
            coords = [(n.lon, n.lat) for n in way.nodes]
            if len(coords) > 1:
                self.store(f'way/{way.id}', LineString(coords), 'river', way.tags)

    def area(self, area):
        if area.tags.get('natural') == 'water':
            try:
                geometry = shape(json.loads(factory.create_multipolygon(area)))
            except RuntimeError as error:
                if 'invalid area' not in str(error):
                    raise
                # The public snapshot contains invalid area 14524007; omit geometry that cannot be assembled.
                unusable_areas.append(area.orig_id())
                return
            kind = 'way' if area.from_way() else 'relation'
            self.store(f'{kind}/{area.orig_id()}', geometry, 'water', area.tags)

ExtractLayers().apply_file(str(pbf_path), locations=True, idx='flex_mem')
print(f'OSM source: {len(geometries)} geographic features intersect the region; {len(unusable_areas)} unassemblable water areas in the country snapshot', flush=True)
for region, (bounds, _) in REGIONS.items():
    area = box(*bounds)
    features, elements = [], []
    for element, geom, kind in geometries:
        clipped = geom.intersection(area)
        if clipped.is_empty:
            continue
        # Preserve the layer geometry family after clipping at the region boundary.
        if clipped.geom_type == 'GeometryCollection':
            parts = [g for g in clipped.geoms if g.geom_type in ('Polygon', 'MultiPolygon')]
            clipped = unary_union(parts)
        if clipped.is_empty or clipped.geom_type not in ['LineString', 'MultiLineString', 'Point', 'Polygon', 'MultiPolygon']:
            continue
        simplified = clipped.simplify(0.000025, preserve_topology=True)
        properties = {'kind': kind}
        if kind == 'river':
            properties['waterway'] = element['tags']['waterway']
        name = element.get('tags', {}).get('name')
        if name:
            properties['name'] = name
        features.append({'type': 'Feature', 'id': element['id'],
                         'properties': properties, 'geometry': mapping(simplified)})
        elements.append(element)
    collection = {'type': 'FeatureCollection', 'features': features,
                  'attribution': '© OpenStreetMap contributors', 'license': 'ODbL 1.0',
                  'sourceUrl': 'https://www.openstreetmap.org/copyright', 'accessed': str(date.today()),
                  'processing': 'Clipped to region; geometry simplified with topology preservation at 0.000025 degrees.',
                  'bounds': bounds}
    (ROOT / f'{region}-features.geojson').write_text(json.dumps(collection, separators=(',', ':')))
    (ROOT / f'{region}-osm-source.json').write_text(json.dumps({
        'type': 'FeatureCollection',
        'features': [{'type': 'Feature', 'id': e['id'], 'properties': e['tags'], 'geometry': e['geometry']} for e in elements],
        'sourceUrl': PBF_URL, 'sourceDate': '2026-09-03', 'countrySnapshotUnassemblableAreaIds': unusable_areas, 'license': 'ODbL 1.0',
        'attribution': '© OpenStreetMap contributors; extract from Geofabrik',
        'description': 'Unsimplified extracted geographic features before region clipping; invalid polygon topology repaired when needed.'}, separators=(',', ':')))
    (ROOT / f'{region}.json').write_text(json.dumps({
        'landcover': f'/layers/{region}-landcover.json', 'features': f'/layers/{region}-features.geojson',
        'sourceExtract': f'/layers/{region}-osm-source.json'}, separators=(',', ':')))
    print(f'{region}: {dict(Counter(f["properties"]["kind"] for f in features))}', flush=True)
