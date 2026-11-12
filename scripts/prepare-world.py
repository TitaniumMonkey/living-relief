"""Prepare bounded offline Living World assets from public geographic sources.

Run with the GIS environment documented in public/world/README.md. Inputs are
cached outside the project. The base, download, and features steps are separate
so renderer development does not depend on the large public source downloads.
"""
import argparse
import csv
import gzip
import json
import math
from collections import Counter
from pathlib import Path

import numpy as np
import rasterio
import requests
from rasterio.transform import from_bounds
from rasterio.warp import reproject, Resampling, transform_bounds
from rasterio.windows import from_bounds as window_from_bounds
from shapely import make_valid, prepare
from shapely.geometry import LineString, Point, box, mapping, shape
from shapely.ops import transform, unary_union
from shapely.strtree import STRtree

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / 'public/world'
CACHE = Path('/private/tmp/relief-world-cache')
LAYER_CACHE = Path('/private/tmp/relief-layer-cache')
TERRAIN_CACHE = Path('/private/tmp/relief-tiles')
MS_INDEX = 'https://bfppub.blob.core.windows.net/%24web/2026-08-13/dataset-links.csv'
CANOPY_BASE = 'https://dataforgood-fb-data.s3.amazonaws.com/forests/v2/global/dinov3_global_chm_v2_ml3'
OSM_URL = 'https://download.geofabrik.de/south-america/peru-260903.osm.pbf'
AREAS = [('urubamba', 'Urubamba and the valley farms', [-72.116, -13.305]),
         ('machu', 'Machu Picchu and Aguas Calientes', [-72.535, -13.159])]


def area_definition(area_id, name, center):
    lon, lat = center
    dx = 3000 / (111320 * math.cos(math.radians(lat)))
    dy = 3000 / 111320
    west, south, east, north = lon - dx, lat - dy, lon + dx, lat + dy
    tiles = []
    for row in range(3):
        for col in range(3):
            tile_id = f'{col}-{row}'
            bounds = [west + (east - west) * col / 3, north - (north - south) * (row + 1) / 3,
                      west + (east - west) * (col + 1) / 3, north - (north - south) * row / 3]
            url = f'/world/{area_id}/{tile_id}'
            tiles.append({'id': tile_id, 'bounds': bounds,
                          'terrain': {'url': f'{url}-terrain.bin', 'n': 129},
                          'landcover': {'url': f'{url}-landcover.bin', 'n': 200},
                          'features': f'{url}-features.json'})
    return {'id': area_id, 'name': name, 'center': center,
            'bounds': [west, south, east, north], 'tiles': tiles}


def definitions():
    return [area_definition(*area) for area in AREAS]


def write_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + '.tmp')
    temporary.write_text(json.dumps(value, separators=(',', ':'), ensure_ascii=False))
    temporary.replace(path)


def quadkey(lon, lat, zoom):
    x = int((lon + 180) / 360 * 2 ** zoom)
    y = int((1 - math.asinh(math.tan(math.radians(lat))) / math.pi) / 2 * 2 ** zoom)
    return ''.join(str(((x >> i) & 1) + 2 * ((y >> i) & 1)) for i in range(zoom - 1, -1, -1))


def covering_quadkeys(bounds, zoom):
    west, south, east, north = bounds
    return {quadkey(lon, lat, zoom) for lon in [west, east] for lat in [south, north]}


def download(url, path):
    if not path.exists():
        response = requests.get(url, timeout=240)
        response.raise_for_status()
        path.write_bytes(response.content)
    return path


def terrain_grid(bounds, n, tile_cache):
    """Sample real Terrarium pixels bilinearly across source tile boundaries."""
    west, south, east, north = bounds
    scale = 256 * 2 ** 13
    lons, lats = np.meshgrid(np.linspace(west, east, n), np.linspace(north, south, n))
    px = (lons + 180) / 360 * scale - .5
    py = (1 - np.arcsinh(np.tan(np.radians(lats))) / math.pi) / 2 * scale - .5
    x, y = np.floor(px).astype(int), np.floor(py).astype(int)

    def pixel(cx, cy):
        values = np.zeros_like(px)
        for tx, ty in set(zip((cx // 256).flat, (cy // 256).flat)):
            if (tx, ty) not in tile_cache:
                with rasterio.open(TERRAIN_CACHE / f'13-{tx}-{ty}.png') as source:
                    rgb = source.read().astype(np.float32)
                    tile_cache[(tx, ty)] = rgb[0] * 256 + rgb[1] + rgb[2] / 256 - 32768
            selected = (cx // 256 == tx) & (cy // 256 == ty)
            values[selected] = tile_cache[(tx, ty)][cy[selected] % 256, cx[selected] % 256]
        return values

    fx, fy = px - x, py - y
    values = ((pixel(x, y) * (1 - fx) + pixel(x + 1, y) * fx) * (1 - fy)
              + (pixel(x, y + 1) * (1 - fx) + pixel(x + 1, y + 1) * fx) * fy)
    return values.astype('<f4')


def landcover_grid(bounds, n):
    target = np.zeros((n, n), dtype=np.uint8)
    for filename in ['S15W075.tif', 'S15W072.tif']:
        with rasterio.open(LAYER_CACHE / filename) as source:
            reproject(source=rasterio.band(source, 1), destination=target,
                      src_transform=source.transform, src_crs=source.crs,
                      dst_transform=from_bounds(*bounds, n, n), dst_crs='EPSG:4326',
                      src_nodata=0, dst_nodata=0, init_dest_nodata=False, resampling=Resampling.nearest)
    if np.any(target == 0):
        raise ValueError('WorldCover has an uncovered target cell')
    return target


def base_assets():
    areas, source_tiles = definitions(), {}
    for area in areas:
        directory = OUTPUT / area['id']
        directory.mkdir(parents=True, exist_ok=True)
        for tile in area['tiles']:
            terrain = terrain_grid(tile['bounds'], tile['terrain']['n'], source_tiles)
            (ROOT / 'public' / tile['terrain']['url'].lstrip('/')).write_bytes(terrain.tobytes())
            landcover = landcover_grid(tile['bounds'], tile['landcover']['n'])
            (ROOT / 'public' / tile['landcover']['url'].lstrip('/')).write_bytes(landcover.tobytes())
            feature_path = ROOT / 'public' / tile['features'].lstrip('/')
            if not feature_path.exists():
                write_json(feature_path, {'type': 'FeatureCollection', 'features': []})
        print(f"{area['id']}: terrain and 10 m land cover ready", flush=True)
    manifest = {
        'version': 1, 'areas': areas,
        'sources': [
            {'name': 'Mapzen Terrain Tiles / USGS and NOAA', 'url': 'https://registry.opendata.aws/terrain-tiles/',
             'date': 'accessed 2026-09-05', 'license': 'Public-domain source data; see per-source attribution'},
            {'name': 'ESA WorldCover 2021 v200', 'url': 'https://esa-worldcover.org/en/data-access',
             'date': '2021', 'license': 'CC BY 4.0'},
            {'name': 'OpenStreetMap / Geofabrik Peru extract', 'url': OSM_URL,
             'date': '2026-09-03', 'license': 'ODbL 1.0'},
            {'name': 'Microsoft Global ML Building Footprints', 'url': MS_INDEX,
             'date': '2026-08-13 release; imagery dates vary', 'license': 'CDLA Permissive 2.0'},
            {'name': 'Meta and WRI CHMv2', 'url': 'https://registry.opendata.aws/dataforgood-fb-forestsv2/',
             'date': '2026 release; Urubamba imagery 2019-09-18; Machu imagery 2018-05-30', 'license': 'CC BY 4.0'},
        ],
        'notes': [
            'Terrain is sampled from original Mapzen zoom 13 pixels, with bilinear interpolation across tile boundaries. The 15.6 m display spacing is not survey accuracy.',
            'WorldCover categories are nearest-neighbour samples from the 2021 10 m product. Display material blending does not alter those categories.',
            'Building footprints are mapped OSM or Microsoft machine-detected shapes. Unmapped heights, roof forms and surface materials are illustrative.',
            'CHMv2 guides canopy coverage and height. Selected crown centres, individual trees and species are inferred; this is not a tree inventory.',
            'Animals, birds, people, vehicles, weather and lighting are illustrative scenery, not live observations.',
        ],
    }
    write_json(OUTPUT / 'manifest.json', manifest)


def download_sources():
    CACHE.mkdir(parents=True, exist_ok=True)
    index = download(MS_INDEX, CACHE / 'microsoft-index.csv')
    ms_keys = set.union(*(covering_quadkeys(a['bounds'], 9) for a in definitions()))
    with index.open() as handle:
        selected = [row for row in csv.DictReader(handle) if row['Location'] == 'Peru' and row['QuadKey'] in ms_keys]
    for row in selected:
        download(row['Url'], CACHE / f"microsoft-{row['QuadKey']}.geojsonl.gz")
        print(f"Microsoft {row['QuadKey']}: {row['Size']}", flush=True)
    write_json(CACHE / 'microsoft-sources.json', selected)
    download('https://raw.githubusercontent.com/Community-Data-License-Agreements/Releases/main/CDLA-Permissive-2.0.txt',
             OUTPUT / 'CDLA-Permissive-2.0.txt')
    canopy_keys = set.union(*(covering_quadkeys(a['bounds'], 10) for a in definitions()))
    for key in sorted(canopy_keys):
        # Only bounded windows are downloaded later through GDAL's COG range reads.
        url = f'{CANOPY_BASE}/chm/{key}.tif'
        response = requests.head(url, timeout=30)
        response.raise_for_status()
        print(f"CHMv2 {key}: {response.headers.get('Content-Length')} source bytes", flush=True)
    write_json(CACHE / 'canopy-sources.json', [{'quadkey': k, 'url': f'{CANOPY_BASE}/chm/{k}.tif'} for k in sorted(canopy_keys)])


def crop_canopy():
    """Read only COG blocks intersecting the two areas; keep original metre heights."""
    for area in definitions():
        bounds = area['bounds']
        files, metadata = [], []
        for key in sorted(covering_quadkeys(bounds, 10)):
            crop = CACHE / f"canopy-{area['id']}-{key}.tif"
            url = f'{CANOPY_BASE}/chm/{key}.tif'
            if not crop.exists():
                with rasterio.Env(GDAL_DISABLE_READDIR_ON_OPEN='EMPTY_DIR'):
                    with rasterio.open(url) as source:
                        native = transform_bounds('EPSG:4326', source.crs, *bounds)
                        window = window_from_bounds(*native, transform=source.transform).round_offsets().round_lengths()
                        window = window.intersection(rasterio.windows.Window(0, 0, source.width, source.height))
                        values = source.read(1, window=window)
                        profile = source.profile.copy()
                        profile.update(width=values.shape[1], height=values.shape[0],
                                       transform=source.window_transform(window), compress='deflate')
                        with rasterio.open(crop, 'w', **profile) as destination:
                            destination.write(values, 1)
            files.append(str(crop))
            meta_path = download(f'{CANOPY_BASE}/metadata/{key}.geojson', CACHE / f'canopy-metadata-{key}.geojson')
            data = json.loads(meta_path.read_text())
            # Metadata polygons use EPSG:4326 in the public source.
            selected = [f for f in data['features'] if shape(f['geometry']).intersects(box(*bounds))]
            metadata.extend(selected)
            with rasterio.open(crop) as source:
                values = source.read(1)
                print(f"{area['id']} CHMv2 crop: {values.shape}, {np.count_nonzero(values >= 3)} pixels >=3m, max {values.max()}m", flush=True)
        write_json(CACHE / f"canopy-{area['id']}.json", {'files': files, 'metadata': metadata})
        print(f"{area['id']} observation metadata: {len(metadata)} intersecting shapes", flush=True)


def metres_transform(center):
    lon, lat = center
    scale = 111320 * math.cos(math.radians(lat))
    return lambda x, y, z=None: ((np.asarray(x) - lon) * scale, (np.asarray(y) - lat) * 111320)


def number_tag(tags, name):
    value = tags.get(name)
    if value is None:
        return None
    # The OSM boundary contains values such as '5 m' and decimal commas.
    try:
        return float(value.lower().replace('metres', '').replace('m', '').replace(',', '.').strip())
    except ValueError:
        return None


def extract_osm():
    import osmium
    areas = definitions()
    bounds = unary_union([box(*a['bounds']) for a in areas])
    factory, extracted, unusable = osmium.geom.GeoJSONFactory(), [], []

    class Handler(osmium.SimpleHandler):
        def store(self, feature_id, geometry, kind, tags):
            if geometry.is_empty or not geometry.intersects(bounds):
                return
            if not geometry.is_valid:
                geometry = make_valid(geometry)
            properties = {'kind': kind, 'source': 'osm'}
            if kind == 'building':
                properties['buildingType'] = tags['building']
            if tags.get('name'):
                properties['name'] = tags['name']
            for tag, field in [('height', 'height'), ('building:levels', 'levels')]:
                value = number_tag(tags, tag)
                if value is not None and value > 0:
                    properties[field] = value
            if tags.get('roof:shape'):
                properties['roofShape'] = tags['roof:shape']
            if tags.get('highway'):
                properties['highway'] = tags['highway']
            extracted.append({'type': 'Feature', 'id': feature_id, 'geometry': mapping(geometry), 'properties': properties})

        def node(self, node):
            if node.tags.get('natural') == 'tree':
                self.store(f'node/{node.id}', Point(node.location.lon, node.location.lat), 'tree', node.tags)

        def way(self, way):
            tags = way.tags
            if tags.get('highway'):
                kind = 'path' if tags['highway'] in ['path', 'footway', 'steps', 'pedestrian', 'bridleway', 'cycleway'] else 'road'
            elif tags.get('waterway') in ['river', 'stream', 'canal', 'ditch']:
                kind = 'water'
            elif tags.get('barrier') in ['retaining_wall', 'wall']:
                kind = 'unclassified_terrace' if tags.get('barrier') == 'retaining_wall' else 'unclassified_wall'
            else:
                return
            points = [(n.lon, n.lat) for n in way.nodes]
            if len(points) > 1:
                self.store(f'way/{way.id}', LineString(points), kind, tags)

        def area(self, area):
            tags = area.tags
            if tags.get('historic') in ['ruins', 'archaeological_site'] or tags.get('ruins') == 'yes' or tags.get('building') == 'ruins':
                # Site boundaries are not individual standing structures: keep them in source metadata only.
                kind = 'ruin' if tags.get('building') or tags.get('historic') == 'ruins' else 'archaeological_boundary'
            elif tags.get('building') and tags.get('building') != 'no':
                kind = 'building'
            elif tags.get('landuse') == 'terrace':
                kind = 'terrace'
            elif tags.get('landuse') in ['farmland', 'orchard', 'vineyard', 'farmyard', 'meadow']:
                kind = 'farmland'
            elif tags.get('natural') == 'water' or tags.get('waterway') == 'riverbank':
                kind = 'water'
            else:
                return
            try:
                geometry = shape(json.loads(factory.create_multipolygon(area)))
            except RuntimeError:
                unusable.append(area.orig_id())
                return
            prefix = 'way' if area.from_way() else 'relation'
            self.store(f'{prefix}/{area.orig_id()}', geometry, kind, tags)

    Handler().apply_file(str(LAYER_CACHE / 'peru.osm.pbf'), locations=True, idx='flex_mem')
    write_json(CACHE / 'osm-world-source.json', {'type': 'FeatureCollection', 'features': extracted,
                                               'sourceUrl': OSM_URL, 'sourceDate': '2026-09-03',
                                               'unassemblableCountryAreaIds': unusable})
    print('OSM bounded source:', dict(Counter(f['properties']['kind'] for f in extracted)), flush=True)


def supplemental_buildings(candidates, mapped):
    """OSM is authoritative where footprints overlap; retain non-overlapping ML data."""
    tree = STRtree(mapped)
    kept = []
    for feature in candidates:
        geometry = shape(feature['geometry'])
        if any(geometry.intersection(mapped[i]).area > 0 for i in tree.query(geometry)):
            continue
        kept.append(feature)
    return kept


def curated_core_buildings(features, core):
    """Omit unsupported generic masses from the curated core; do not call them ruins."""
    kept, omitted = [], []
    for feature in features:
        properties = feature['properties']
        if (properties['kind'] == 'building' and properties.get('buildingType') == 'yes'
                and core.covers(shape(feature['geometry']).representative_point())):
            omitted.append(feature)
        else:
            kept.append(feature)
    return kept, omitted


def exclusion_geometry(features, center):
    project = metres_transform(center)
    masks = []
    for feature in features:
        kind = feature['properties']['kind']
        geometry = transform(project, shape(feature['geometry']))
        if kind in ['building', 'ruin', 'terrace']:
            masks.append(geometry.buffer(2))
        elif kind == 'road':
            masks.append(geometry.buffer(4))
        elif kind == 'path':
            masks.append(geometry.buffer(1.5))
        elif kind == 'water':
            masks.append(geometry.buffer(8 if geometry.geom_type.endswith('LineString') else 1))
    return unary_union(masks)


def generate_trees(area, features, canopy_files):
    """Select repeatable positive-canopy samples; centres are inferred, not surveyed."""
    project = metres_transform(area['center'])
    exclusion = exclusion_geometry(features, area['center'])
    mapped = [transform(project, shape(f['geometry'])) for f in features if f['properties']['kind'] == 'tree']
    if mapped:
        exclusion = unary_union([exclusion, unary_union(mapped).buffer(5)])
    prepare(exclusion)
    west, south, east, north = area['bounds']
    # Six-metre samples locate actual positive canopy. A deterministic thinning
    # prevents a regular visible grid and leaves at least 12 m between crowns.
    n = 1000
    heights = np.zeros((n, n), dtype=np.uint8)
    for file in canopy_files:
        with rasterio.open(file) as source:
            reproject(source=rasterio.band(source, 1), destination=heights,
                      src_transform=source.transform, src_crs=source.crs,
                      dst_transform=from_bounds(*area['bounds'], n, n), dst_crs='EPSG:4326',
                      dst_nodata=0, init_dest_nodata=False, resampling=Resampling.nearest)
    local_cover = landcover_grid(area['bounds'], n)
    rows, cols = np.where((heights >= 3) & ~np.isin(local_cover, [50, 70, 80]))
    scores = ((rows.astype(np.uint64) * 73856093) ^ (cols.astype(np.uint64) * 19349663)) % 4294967291
    order = np.argsort(scores)
    accepted, occupied = [], set()
    excluded = 0
    for i in order:
        row, col = int(rows[i]), int(cols[i])
        if any((row + dr, col + dc) in occupied for dr in [-1, 0, 1] for dc in [-1, 0, 1]):
            continue
        lon = west + (col + .5) / n * (east - west)
        lat = north - (row + .5) / n * (north - south)
        point = Point(lon, lat)
        if exclusion.covers(transform(project, point)):
            excluded += 1
            continue
        occupied.add((row, col))
        accepted.append({'type': 'Feature', 'id': f"chmv2/{area['id']}/{row}-{col}",
                         'geometry': {'type': 'Point', 'coordinates': [round(lon, 8), round(lat, 8)]},
                         'properties': {'kind': 'tree', 'source': 'chmv2', 'height': int(heights[row, col]), 'inferred': True}})
    return accepted, {'sampledCanopyPixels': len(rows), 'inferredCrowns': len(accepted), 'excludedCandidates': excluded}


def feature_assets():
    osm = json.loads((CACHE / 'osm-world-source.json').read_text())
    microsoft = []
    areas = definitions()
    all_bounds = unary_union([box(*area['bounds']) for area in areas])
    for source in json.loads((CACHE / 'microsoft-sources.json').read_text()):
        with gzip.open(CACHE / f"microsoft-{source['QuadKey']}.geojsonl.gz", 'rt') as handle:
            for index, line in enumerate(handle):
                feature = json.loads(line)
                geometry = shape(feature['geometry'])
                if not geometry.intersects(all_bounds):
                    continue
                if not geometry.is_valid:
                    geometry = make_valid(geometry)
                properties = {'kind': 'building', 'source': 'microsoft', 'inferred': True}
                height = feature['properties'].get('height', -1)
                if height > 0:
                    properties['height'] = height
                microsoft.append({'type': 'Feature', 'id': f"microsoft/{source['QuadKey']}/{index}",
                                  'geometry': mapping(geometry), 'properties': properties})
    report = {}
    for area in areas:
        bounds = box(*area['bounds'])
        source_features = [f for f in osm['features'] if shape(f['geometry']).intersects(bounds)]
        boundaries = [shape(f['geometry']) for f in source_features if f['properties']['kind'] == 'archaeological_boundary']
        archaeological = unary_union(boundaries)
        core = unary_union([shape(f['geometry']) for f in source_features if f['id'] == 'way/157376572'])
        features = []
        for feature in source_features:
            feature = dict(feature, properties=dict(feature['properties']))
            kind = feature['properties']['kind']
            if kind == 'archaeological_boundary':
                continue
            if kind in ['unclassified_wall', 'unclassified_terrace']:
                if not archaeological.intersects(shape(feature['geometry'])):
                    continue
                feature['properties']['kind'] = 'ruin' if kind == 'unclassified_wall' else 'terrace'
            features.append(feature)
        features, omitted = curated_core_buildings(features, core)
        mapped = [shape(f['geometry']) for f in features if f['properties']['kind'] in ['building', 'ruin']]
        candidates = [f for f in microsoft if shape(f['geometry']).intersects(bounds)
                      and not archaeological.intersects(shape(f['geometry']))]
        supplement = supplemental_buildings(candidates, mapped)
        features.extend(supplement)
        canopy = json.loads((CACHE / f"canopy-{area['id']}.json").read_text())
        crowns, canopy_report = generate_trees(area, features + omitted, canopy['files'])
        features.extend(crowns)
        geometries = [shape(f['geometry']) for f in features]
        spatial_index = STRtree(geometries)
        emitted, tile_parts = {}, Counter()
        for tile in area['tiles']:
            tile_bounds = box(*tile['bounds'])
            tile_features = []
            for index in spatial_index.query(tile_bounds):
                feature, geometry = features[index], geometries[index]
                if feature['properties']['kind'] in ['building', 'tree', 'ruin']:
                    # Keep complete structures in one tile rather than cutting roofs.
                    point = geometry.representative_point()
                    w, s, e, n = tile['bounds']
                    if not (w <= point.x < e and s < point.y <= n):
                        continue
                elif not geometry.intersects(tile_bounds):
                    continue
                else:
                    geometry = geometry.intersection(tile_bounds)
                if geometry.geom_type == 'GeometryCollection':
                    geometry = unary_union([g for g in geometry.geoms if g.geom_type in ['Polygon', 'LineString']])
                if geometry.is_empty:
                    continue
                tile_features.append(dict(feature, geometry=mapping(geometry)))
                emitted[feature['id']] = feature['properties']['kind']
                tile_parts[feature['properties']['kind']] += 1
            write_json(ROOT / 'public' / tile['features'].lstrip('/'), {'type': 'FeatureCollection', 'features': tile_features})
        report[area['id']] = {'features': dict(Counter(f['properties']['kind'] for f in features)),
                             'renderedUniqueFeatures': dict(Counter(emitted.values())),
                             'renderedTileParts': dict(tile_parts),
                             'microsoftCandidates': len(candidates), 'microsoftAdded': len(supplement),
                             'microsoftOverlappingOsmRemoved': len(candidates) - len(supplement),
                             'canopy': canopy_report,
                             'curatedCoreOmittedGenericBuildingIds': [f['id'] for f in omitted],
                             'archaeologicalBoundaryCount': len(boundaries)}
        write_json(OUTPUT / area['id'] / 'source-extract.json', {
            'type': 'FeatureCollection', 'features': source_features + supplement,
            'sourceDate': '2026-09-03 OSM; Microsoft 2026-08-13 release',
            'canopyObservationMetadata': [dict(f, geometry=mapping(shape(f['geometry']).intersection(bounds))) for f in canopy['metadata']],
            'curatedCoreOmittedGenericBuildingIds': [f['id'] for f in omitted],
            'description': 'Bounded geographic source features. No OSM author, contact or address fields are retained.'})
        print(area['id'], report[area['id']], flush=True)
    write_json(OUTPUT / 'processing-report.json', report)
    write_json(OUTPUT / 'source-details.json', {
        'osm': {'url': OSM_URL, 'date': '2026-09-03', 'unassemblableCountryAreaIds': osm['unassemblableCountryAreaIds']},
        'microsoft': json.loads((CACHE / 'microsoft-sources.json').read_text()),
        'canopy': json.loads((CACHE / 'canopy-sources.json').read_text()),
        'worldcover': [f'https://esa-worldcover.s3.eu-central-1.amazonaws.com/v200/2021/map/ESA_WorldCover_10m_2021_v200_{tile}_Map.tif'
                      for tile in ['S15W075', 'S15W072']],
        'terrain': {'urlPattern': 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/13/{x}/{y}.png', 'zoom': 13},
    })


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('step', choices=['base', 'download', 'osm', 'canopy', 'features'])
    args = parser.parse_args()
    {'base': base_assets, 'download': download_sources, 'osm': extract_osm,
     'canopy': crop_canopy, 'features': feature_assets}[args.step]()
