"""Stage the Sacred Valley GIS expansion outside the application checkout.

All writes stay below /private/tmp/relief-expansion. The existing checkout and
its Urubamba/Machu data are read-only inputs. Runtime assets use the existing
Float32 terrain / Uint8 categorical cover / GeoJSON feature formats.
"""
import argparse
import copy
import gzip
import importlib.util
import json
import math
from collections import Counter, defaultdict
from pathlib import Path

import numpy as np
import rasterio
import requests
from rasterio.transform import from_bounds
from rasterio.warp import reproject, Resampling, transform_bounds
from rasterio.windows import from_bounds as window_from_bounds
from shapely import constrained_delaunay_triangles, make_valid, prepare
from shapely.geometry import Point, LineString, box, shape, mapping
from shapely.ops import transform, unary_union
from shapely.strtree import STRtree

STAGE = Path('/private/tmp/relief-expansion')
CHECKOUT = Path(__file__).resolve().parents[2]
OUTPUT = STAGE / 'public/world'
CACHE = STAGE / 'cache'
spec = importlib.util.spec_from_file_location('world_base', Path(__file__).with_name('prepare-world-base.py'))
base = importlib.util.module_from_spec(spec)
spec.loader.exec_module(base)
LEGACY = json.loads((CHECKOUT / 'public/world/manifest.json').read_text())
LEGACY['areas'] = [area for area in LEGACY['areas'] if area['id'] in ['urubamba', 'machu']]
ORIGIN_LON = LEGACY['areas'][0]['bounds'][0]
ORIGIN_LAT = LEGACY['areas'][0]['bounds'][3]
STEP_LON = (LEGACY['areas'][0]['bounds'][2] - ORIGIN_LON) / 3
STEP_LAT = (ORIGIN_LAT - LEGACY['areas'][0]['bounds'][1]) / 3
CONFIG = [
    ('maras', 'Maras, Moray and Salineras', [-72.173, -13.319], 3, 3, 'full'),
    ('cusco', 'Cusco and Sacsayhuamán', [-71.978694, -13.512], 3, 3, 'full'),
    ('chinchero', 'Chinchero and the airport works', [-72.052, -13.400], 3, 3, 'full'),
    ('ollanta', 'Ollantaytambo', [-72.2636012, -13.2586458], 2, 2, 'full'),
    ('pisac', 'Pisac and its terraces', [-71.850496, -13.412], 2, 3, 'full'),
    ('yucay', 'Yucay', [-72.0847651, -13.3210838], 1, 1, 'light'),
    ('huayllabamba', 'Huayllabamba', [-72.0651037, -13.3382701], 1, 1, 'light'),
    ('calca', 'Calca', [-71.9560084, -13.3216818], 1, 1, 'light'),
    ('lamay', 'Lamay', [-71.9203033, -13.3645205], 1, 1, 'light'),
]
PUBLIC_TAGS = {
    'name', 'name:en', 'name:es', 'name:qu', 'official_name', 'alt_name',
    'building', 'building:levels', 'building:use', 'building:material',
    'height', 'min_height', 'roof:shape', 'roof:material', 'roof:colour',
    'roof:color', 'roof:height', 'building:colour', 'building:color',
    'material', 'colour', 'color', 'amenity', 'tourism', 'historic', 'ruins',
    'wikidata', 'wikipedia', 'heritage', 'start_date', 'landuse', 'natural',
    'water', 'waterway', 'highway', 'surface', 'barrier', 'width', 'aeroway',
    'construction', 'proposed', 'construction:aeroway', 'proposed:aeroway', 'craft', 'man_made', 'place',
    'archaeological_site', 'site_type', 'crop', 'trees', 'leaf_type', 'leaf_cycle',
}


def write_json(path, value):
    base.write_json(path, value)


def local_path(url):
    return STAGE / 'public' / url.lstrip('/')


def tile_bounds(col, row):
    return [ORIGIN_LON + STEP_LON * col, ORIGIN_LAT - STEP_LAT * (row + 1),
            ORIGIN_LON + STEP_LON * (col + 1), ORIGIN_LAT - STEP_LAT * row]


def manifest():
    result = copy.deepcopy(LEGACY)
    tile_index = {}
    for area in result['areas']:
        area['detail'] = 'full'
        for tile in area['tiles']:
            col, row = map(int, tile['id'].split('-'))
            tile.update(col=col, row=row, grid='valley' if area['id'] == 'urubamba' else 'machu',
                        areaId=area['id'], detail='full')
            tile['landcover']['haloUrl'] = tile['landcover']['url'].replace('.bin', '-halo.bin')
            if area['id'] == 'urubamba':
                tile_index[(col, row)] = tile
    for area_id, name, center, width, height, detail in CONFIG:
        gx = (center[0] - ORIGIN_LON) / STEP_LON
        gy = (ORIGIN_LAT - center[1]) / STEP_LAT
        first_col = math.floor(gx) - width // 2 if width % 2 else round(gx) - width // 2
        first_row = math.floor(gy) - height // 2 if height % 2 else round(gy) - height // 2
        tiles = []
        for row in range(first_row, first_row + height):
            for col in range(first_col, first_col + width):
                if (col, row) not in tile_index:
                    prefix = f'/world/grid/g{col}_{row}'
                    tile_index[(col, row)] = {
                        'id': f'g{col}_{row}', 'col': col, 'row': row, 'grid': 'valley',
                        'areaId': area_id, 'detail': detail, 'bounds': tile_bounds(col, row),
                        'terrain': {'url': f'{prefix}-terrain.bin', 'n': 129},
                        'landcover': {'url': f'{prefix}-landcover.bin', 'n': 200,
                                      'haloUrl': f'{prefix}-landcover-halo.bin'},
                        'features': f'{prefix}-features.json',
                    }
                tile = tile_index[(col, row)]
                if detail == 'full':
                    tile['detail'] = detail
                tiles.append(tile)
        bounds = [tiles[0]['bounds'][0], tiles[-1]['bounds'][1], tiles[-1]['bounds'][2], tiles[0]['bounds'][3]]
        result['areas'].append({'id': area_id, 'name': name, 'center': center,
                                'bounds': bounds, 'detail': detail, 'tiles': tiles,
                                'context': f'/world/{area_id}/context.geojson'})
    result['grid'] = {'id': 'valley', 'origin': [ORIGIN_LON, ORIGIN_LAT],
                      'step': [STEP_LON, STEP_LAT], 'nominalTileMeters': 2000,
                      'deduplicateBy': 'terrain.url', 'haloPixels': 8}
    for source in result['sources']:
        if source['name'] == 'Meta and WRI CHMv2':
            source['date'] = '2026 release; expanded-area source imagery 2016-08-05 through 2019-09-18; per-tile dates in canopy-coverage.json'
    result['notes'].extend([
        'Expanded areas share the existing Urubamba-aligned 2 km grid. Tile references are deduplicated by terrain URL; the distant Machu grid remains separate.',
        'Land-cover halo files have (n + 16) squared Uint8 samples, including an eight-pixel halo on every side. The n squared centre exactly preserves its original categories.',
        'Descriptive public OSM tags are retained; addresses, contacts, mapper identities and private metadata are excluded.',
        'Salineras and the Chinchero airport use mapped aggregate compound boundaries. Surface grids are 15 m display mesh partitions, not mapped individual salt ponds or an operational runway.',
        'Calca supplements sparse OSM building coverage with non-overlapping Microsoft footprints; buildings within archaeological or construction compounds are not added from machine detections.',
    ])
    return result


def unique_tiles(data, include_legacy=True):
    by_url = {}
    for area in data['areas']:
        if not include_legacy and area['id'] in ['urubamba', 'machu']:
            continue
        for tile in area['tiles']:
            by_url[tile['terrain']['url']] = tile
    return list(by_url.values())


def base_assets():
    data, elevation_cache = manifest(), {}
    for tile in unique_tiles(data):
        bounds = tile['bounds']
        path = local_path(tile['terrain']['url'])
        is_legacy = not tile['terrain']['url'].startswith('/world/grid/')
        if is_legacy:
            cover = np.frombuffer((CHECKOUT / 'public' / tile['landcover']['url'].lstrip('/')).read_bytes(), dtype=np.uint8).reshape(200, 200)
        else:
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(base.terrain_grid(bounds, 129, elevation_cache).tobytes())
            cover = base.landcover_grid(bounds, 200)
            local_path(tile['landcover']['url']).write_bytes(cover.tobytes())
            if not local_path(tile['features']).exists():
                write_json(local_path(tile['features']), {'type': 'FeatureCollection', 'features': []})
        dx, dy = (bounds[2] - bounds[0]) * .04, (bounds[3] - bounds[1]) * .04
        halo = base.landcover_grid([bounds[0] - dx, bounds[1] - dy, bounds[2] + dx, bounds[3] + dy], 216)
        halo[8:208, 8:208] = cover
        halo_path = local_path(tile['landcover']['haloUrl'])
        halo_path.parent.mkdir(parents=True, exist_ok=True)
        halo_path.write_bytes(halo.tobytes())
    write_json(OUTPUT / 'manifest.json', data)
    print(f"Staged {len(data['areas'])} areas; {len(unique_tiles(data))} unique tiles; legacy terrain/cover/features untouched.", flush=True)
    for area in data['areas'][2:]:
        print(area['id'], area['bounds'], len(area['tiles']), area['detail'], flush=True)


def properties(tags, kind):
    selected = {key: value for key, value in tags.items() if key in PUBLIC_TAGS}
    result = {'kind': kind, 'source': 'osm', 'tags': selected}
    for key in ['name', 'amenity', 'tourism', 'historic', 'wikidata', 'wikipedia', 'landuse', 'aeroway', 'material']:
        if key in selected:
            result[key] = selected[key]
    for tag, field in [('height', 'height'), ('building:levels', 'levels')]:
        value = base.number_tag(selected, tag)
        if value is not None and value > 0:
            result[field] = value
    for tag, field in [('building', 'buildingType'), ('roof:shape', 'roofShape'),
                       ('roof:material', 'roofMaterial'), ('roof:colour', 'roofColor'),
                       ('roof:color', 'roofColor'), ('building:colour', 'wallColor'),
                       ('building:color', 'wallColor'), ('building:material', 'wallMaterial'),
                       ('highway', 'highway')]:
        if tag in selected:
            result[field] = selected[tag]
    return result


def extract_osm():
    import osmium
    data = manifest()
    search_bounds = unary_union([box(*t['bounds']) for t in unique_tiles(data, False)])
    factory, features, unusable = osmium.geom.GeoJSONFactory(), [], []

    class Handler(osmium.SimpleHandler):
        def store(self, feature_id, geometry, kind, tags):
            if geometry.is_empty or not geometry.intersects(search_bounds):
                return
            if not geometry.is_valid:
                geometry = make_valid(geometry)
            features.append({'type': 'Feature', 'id': feature_id,
                             'geometry': mapping(geometry), 'properties': properties(dict(tags), kind)})

        def node(self, node):
            tags = node.tags
            if tags.get('natural') == 'tree':
                kind = 'tree'
            elif tags.get('tourism') or tags.get('historic') or (tags.get('amenity') and tags.get('name')) or tags.get('place') in ['city', 'town', 'village']:
                kind = 'context'
            else:
                return
            self.store(f'node/{node.id}', Point(node.location.lon, node.location.lat), kind, tags)

        def way(self, way):
            tags = way.tags
            if tags.get('highway'):
                kind = 'path' if tags['highway'] in ['path', 'footway', 'steps', 'pedestrian', 'bridleway', 'cycleway'] else 'road'
            elif tags.get('aeroway') in ['runway', 'taxiway'] or tags.get('construction:aeroway') in ['runway', 'taxiway']:
                kind = 'road'
            elif tags.get('waterway') in ['river', 'stream', 'canal', 'ditch']:
                kind = 'water'
            elif tags.get('barrier') == 'retaining_wall':
                kind = 'terrace'
            elif tags.get('barrier') == 'wall':
                kind = 'context_wall'
            else:
                return
            coordinates = [(node.lon, node.lat) for node in way.nodes]
            if len(coordinates) > 1:
                self.store(f'way/{way.id}', LineString(coordinates), kind, tags)

        def area(self, area):
            tags = area.tags
            if tags.get('historic') in ['ruins', 'archaeological_site'] or tags.get('ruins') == 'yes' or tags.get('building') == 'ruins':
                kind = 'ruin' if tags.get('building') or tags.get('historic') == 'ruins' else 'archaeological_boundary'
            elif tags.get('building') and tags.get('building') != 'no':
                kind = 'building'
            elif tags.get('landuse') in ['farmland', 'orchard', 'vineyard', 'farmyard', 'meadow']:
                kind = 'farmland'
            elif tags.get('landuse') == 'salt_pond' or tags.get('water') == 'salt_pond':
                kind = 'water'
            elif tags.get('natural') == 'water' or tags.get('waterway') == 'riverbank':
                kind = 'water'
            elif tags.get('landuse') or tags.get('aeroway') or tags.get('tourism') or tags.get('historic'):
                kind = 'context'
            else:
                return
            try:
                geometry = shape(json.loads(factory.create_multipolygon(area)))
            except RuntimeError:
                unusable.append(area.orig_id())
                return
            prefix = 'way' if area.from_way() else 'relation'
            self.store(f'{prefix}/{area.orig_id()}', geometry, kind, tags)

    Handler().apply_file(str(base.LAYER_CACHE / 'peru.osm.pbf'), locations=True, idx='flex_mem')
    write_json(CACHE / 'osm-expansion-source.json', {'type': 'FeatureCollection', 'features': features,
                                                  'sourceUrl': base.OSM_URL, 'sourceDate': '2026-09-03',
                                                  'unassemblableCountryAreaIds': unusable})
    print('Bounded source features:', dict(Counter(f['properties']['kind'] for f in features)), flush=True)
    for area in data['areas'][2:]:
        selected = [f for f in features if shape(f['geometry']).intersects(box(*area['bounds']))]
        print(area['id'], dict(Counter(f['properties']['kind'] for f in selected)), flush=True)
        named = [f for f in selected if f['properties'].get('name') and (f['properties'].get('historic') or 'sali' in f['properties']['name'].lower() or f['properties'].get('aeroway'))]
        print('Landmarks:', [(f['id'], f['properties'].get('name'), f['properties']['tags'], shape(f['geometry']).bounds) for f in named[:25]], flush=True)


def canopy_assets():
    data = manifest()
    sources, coverage = {}, []
    for tile in unique_tiles(data, False):
        bounds = tile['bounds']
        keys = sorted(base.covering_quadkeys(bounds, 10))
        target = np.zeros((320, 320), dtype=np.uint8)
        observation_shapes = []
        dates = set()
        for key in keys:
            url = f'{base.CANOPY_BASE}/chm/{key}.tif'
            crop_path = CACHE / f"canopy-{tile['id']}-{key}.tif"
            if not crop_path.exists():
                with rasterio.Env(GDAL_DISABLE_READDIR_ON_OPEN='EMPTY_DIR'):
                    with rasterio.open(url) as source:
                        native = transform_bounds('EPSG:4326', source.crs, *bounds)
                        window = window_from_bounds(*native, transform=source.transform).round_offsets().round_lengths()
                        window = window.intersection(rasterio.windows.Window(0, 0, source.width, source.height))
                        values = source.read(1, window=window)
                        profile = source.profile.copy()
                        profile.update(width=values.shape[1], height=values.shape[0], transform=source.window_transform(window), compress='deflate')
                        with rasterio.open(crop_path, 'w', **profile) as destination:
                            destination.write(values, 1)
            with rasterio.open(crop_path) as source:
                reproject(source=rasterio.band(source, 1), destination=target,
                          src_transform=source.transform, src_crs=source.crs,
                          dst_transform=from_bounds(*bounds, 320, 320), dst_crs='EPSG:4326',
                          dst_nodata=0, init_dest_nodata=False, resampling=Resampling.nearest)
            if key not in sources:
                meta = base.CACHE / f'canopy-metadata-{key}.geojson'
                if not meta.exists():
                    meta = CACHE / f'canopy-metadata-{key}.geojson'
                    base.download(f'{base.CANOPY_BASE}/metadata/{key}.geojson', meta)
                sources[key] = {'url': url, 'metadataUrl': f'{base.CANOPY_BASE}/metadata/{key}.geojson',
                                'metadata': json.loads(meta.read_text())['features']}
            for feature in sources[key]['metadata']:
                geometry = shape(feature['geometry'])
                if geometry.intersects(box(*bounds)):
                    observation_shapes.append(geometry)
                    dates.add(feature['properties']['acq_date'])
        extent = box(*bounds)
        fraction = unary_union(observation_shapes).intersection(extent).area / extent.area
        np.save(CACHE / f"canopy-{tile['id']}.npy", target)
        row = {'tile': tile['id'], 'observationDates': sorted(dates), 'observationCoverageFraction': fraction,
               'positivePixels': int(np.count_nonzero(target >= 3)), 'sampleCount': 320**2, 'sourceKeys': keys}
        coverage.append(row)
        print('Canopy', row, flush=True)
    write_json(OUTPUT / 'canopy-coverage.json', coverage)
    write_json(OUTPUT / 'canopy-sources.json', [{'quadkey': key, 'url': value['url'], 'metadataUrl': value['metadataUrl']} for key, value in sources.items()])


def prepare_features():
    data = manifest()
    tiles = [t for t in unique_tiles(data, False) if t['terrain']['url'].startswith('/world/grid/')]
    raw = json.loads((CACHE / 'osm-expansion-source.json').read_text())
    source_features = raw['features']
    source_geometries = [shape(f['geometry']) for f in source_features]
    source_index = STRtree(source_geometries)
    archaeological = unary_union([g for f, g in zip(source_features, source_geometries) if f['properties']['kind'] == 'archaeological_boundary'])
    features = []
    compound_kinds = {'way/66568490': 'saltpan', 'way/977105475': 'airfield'}
    for feature, geometry in zip(source_features, source_geometries):
        kind = feature['properties']['kind']
        if feature['id'] in compound_kinds:
            feature = copy.deepcopy(feature)
            feature['properties']['kind'] = compound_kinds[feature['id']]
            feature['properties']['surfaceDetail'] = 'Illustrative surface inside the mapped compound boundary; individual ponds and operational runways are not mapped.'
            features.append(feature)
            continue
        if kind in ['context', 'archaeological_boundary']:
            continue
        if kind == 'context_wall':
            if not archaeological.intersects(geometry):
                continue
            feature = copy.deepcopy(feature)
            feature['properties']['kind'] = 'ruin'
            feature['geometry'] = mapping(geometry.intersection(archaeological))
        features.append(copy.deepcopy(feature))
    features, microsoft_report = add_calca_footprints(features, data, archaeological, source_features)
    enriched = enrich_contained_pois(features, source_features)
    project = base.metres_transform([-72.12, -13.34])
    mask = base.exclusion_geometry(features, [-72.12, -13.34])
    construction = [transform(project, g) for f, g in zip(source_features, source_geometries)
                    if f['properties'].get('landuse') == 'construction' or f['id'] == 'way/66568490' or f['properties'].get('aeroway') in ['runway', 'taxiway', 'apron']]
    mapped_trees = [transform(project, shape(f['geometry'])) for f in features if f['properties']['kind'] == 'tree']
    mask = unary_union([mask] + construction + ([unary_union(mapped_trees).buffer(5)] if mapped_trees else []))
    prepare(mask)
    candidates = []
    for tile in tiles:
        heights = np.load(CACHE / f"canopy-{tile['id']}.npy")
        cover = base.landcover_grid(tile['bounds'], 320)
        rows, cols = np.where((heights >= 3) & ~np.isin(cover, [50, 70, 80]))
        for row, col in zip(rows, cols):
            global_row, global_col = tile['row'] * 320 + int(row), tile['col'] * 320 + int(col)
            score = ((global_row * 73856093) ^ (global_col * 19349663)) % 4294967291
            candidates.append((score, global_row, global_col, int(heights[row, col]), tile['id']))
    occupied, crown_features, exclusion_count = set(), [], 0
    for score, row, col, height, tile_id in sorted(candidates):
        if any((row + dr, col + dc) in occupied for dr in [-1, 0, 1] for dc in [-1, 0, 1]):
            continue
        lon = ORIGIN_LON + (col + .5) / 320 * STEP_LON
        lat = ORIGIN_LAT - (row + .5) / 320 * STEP_LAT
        if mask.covers(transform(project, Point(lon, lat))):
            exclusion_count += 1
            continue
        occupied.add((row, col))
        crown_features.append({'type': 'Feature', 'id': f'chmv2/grid/{row}-{col}',
                               'geometry': {'type': 'Point', 'coordinates': [round(lon, 8), round(lat, 8)]},
                               'properties': {'kind': 'tree', 'height': height, 'source': 'chmv2', 'inferred': True}})
    features.extend(crown_features)
    geometries = [shape(f['geometry']) for f in features]
    index = STRtree(geometries)
    tile_reports = []
    for tile in tiles:
        bounds = box(*tile['bounds'])
        output = []
        for idx in index.query(bounds):
            feature, geometry = features[idx], geometries[idx]
            if feature['properties']['kind'] in ['building', 'tree', 'ruin']:
                point = geometry.representative_point()
                w, s, e, n = tile['bounds']
                if not (w <= point.x < e and s < point.y <= n):
                    continue
            else:
                geometry = geometry.intersection(bounds)
            if geometry.geom_type == 'GeometryCollection':
                geometry = unary_union([g for g in geometry.geoms if g.geom_type in ['Polygon', 'LineString']])
            if geometry.is_empty:
                continue
            rendered = dict(feature, geometry=mapping(geometry))
            if feature['properties']['kind'] in ['saltpan', 'airfield']:
                rendered['surfaceGrid'] = surface_grid(geometry)
            output.append(rendered)
        write_json(local_path(tile['features']), {'type': 'FeatureCollection', 'features': output})
        tile_reports.append({'tile': tile['id'], 'counts': dict(Counter(f['properties']['kind'] for f in output)), 'bytes': local_path(tile['features']).stat().st_size})
    area_reports = []
    for area in data['areas'][2:]:
        bounds = box(*area['bounds'])
        selected = [source_features[idx] for idx in source_index.query(bounds) if source_geometries[idx].intersects(bounds)]
        contexts = [f for f in selected if f['properties']['kind'] in ['context', 'archaeological_boundary'] or f['properties'].get('name') or f['properties'].get('aeroway') or f['properties'].get('landuse') == 'salt_pond']
        write_json(OUTPUT / area['id'] / 'source-extract.json', {'type': 'FeatureCollection', 'features': selected, 'sourceUrl': base.OSM_URL, 'sourceDate': '2026-09-03', 'license': 'ODbL 1.0'})
        write_json(OUTPUT / area['id'] / 'context.geojson', {'type': 'FeatureCollection', 'features': contexts})
        report = {'id': area['id'], 'bounds': area['bounds'], 'detail': area['detail'], 'sourceCounts': dict(Counter(f['properties']['kind'] for f in selected))}
        area_reports.append(report)
        print('Area report', report, flush=True)
    write_json(OUTPUT / 'expansion-report.json', {'areas': area_reports, 'tiles': tile_reports,
                                                'canopyCandidates': len(candidates), 'inferredCrowns': len(crown_features),
                                                'excludedCanopyCandidates': exclusion_count,
                                                'buildingsWithContainedPois': enriched, 'microsoft': microsoft_report,
                                                'unassemblableCountryAreaIds': raw['unassemblableCountryAreaIds']})
    write_json(OUTPUT / 'manifest.json', data)
    print('Crown candidates', len(candidates), 'accepted', len(crown_features), 'excluded', exclusion_count, flush=True)


def enrich_contained_pois(features, source):
    """Attach public POI details only when their source point is inside a footprint."""
    points = [f for f in source if f['geometry']['type'] == 'Point' and f['properties'].get('name')
              and f['properties']['kind'] != 'tree']
    geometries = [shape(f['geometry']) for f in points]
    index, enriched = STRtree(geometries), 0
    for feature in features:
        if feature['properties']['kind'] != 'building':
            continue
        geometry = shape(feature['geometry'])
        contained = [points[i] for i in index.query(geometry) if geometry.contains(geometries[i])]
        if not contained:
            continue
        props = feature['properties']
        props['containedPois'] = [dict(id=p['id'], **{k: v for k, v in p['properties'].items()
                                                  if k not in ['kind', 'source']}) for p in contained]
        if len(contained) == 1:
            for key in ['name', 'amenity', 'tourism', 'historic', 'wikidata', 'wikipedia']:
                if key not in props and key in contained[0]['properties']:
                    props[key] = contained[0]['properties'][key]
        enriched += 1
    return enriched


def add_calca_footprints(features, data, archaeological, source_features):
    """Fill Calca's proven OSM coverage gap from the cached public Microsoft release."""
    area = next(a for a in data['areas'] if a['id'] == 'calca')
    bounds = box(*area['bounds'])
    mapped = [shape(f['geometry']) for f in features if f['properties']['kind'] in ['building', 'ruin']]
    prohibited = unary_union([archaeological] + [shape(f['geometry']) for f in source_features
                                               if f['properties'].get('landuse') == 'construction'])
    candidates, sources = [], []
    for source in json.loads((base.CACHE / 'microsoft-sources.json').read_text()):
        if source['QuadKey'] not in base.covering_quadkeys(area['bounds'], 9):
            continue
        sources.append(source)
        with gzip.open(base.CACHE / f"microsoft-{source['QuadKey']}.geojsonl.gz", 'rt') as handle:
            for line_index, line in enumerate(handle):
                value = json.loads(line)
                geometry = shape(value['geometry'])
                if not bounds.contains(geometry.representative_point()) or prohibited.intersects(geometry):
                    continue
                if not geometry.is_valid:
                    geometry = make_valid(geometry)
                props = {'kind': 'building', 'source': 'microsoft', 'inferred': True}
                if value['properties'].get('height', -1) > 0:
                    props['height'] = value['properties']['height']
                candidates.append({'type': 'Feature', 'id': f"microsoft/{source['QuadKey']}/{line_index}",
                                   'geometry': mapping(geometry), 'properties': props})
    kept = base.supplemental_buildings(candidates, mapped)
    write_json(OUTPUT / 'calca/microsoft-source-extract.json', {'type': 'FeatureCollection', 'features': candidates,
                                                              'sources': sources, 'license': 'CDLA Permissive 2.0'})
    return features + kept, {'area': 'calca', 'candidates': len(candidates), 'kept': len(kept),
                            'omittedOverlappingOsm': len(candidates) - len(kept), 'sources': sources}


def surface_grid(geometry, spacing=15):
    """Triangulate clipped metre-grid cells; these partitions are display geometry."""
    center = [ORIGIN_LON, ORIGIN_LAT]
    scale_x = 111320 * math.cos(math.radians(center[1]))
    projected = transform(base.metres_transform(center), geometry)
    west, south, east, north = projected.bounds
    vertices, indices, vertex_index = [], [], {}
    for x in range(math.floor(west / spacing), math.ceil(east / spacing)):
        for y in range(math.floor(south / spacing), math.ceil(north / spacing)):
            clipped = projected.intersection(box(x * spacing, y * spacing, (x + 1) * spacing, (y + 1) * spacing))
            if clipped.is_empty or clipped.area <= 0:
                continue
            for triangle in constrained_delaunay_triangles(clipped).geoms:
                coordinates = list(triangle.exterior.coords)[:3]
                if not triangle.exterior.is_ccw:
                    coordinates[1], coordinates[2] = coordinates[2], coordinates[1]
                face = []
                for px, py in coordinates:
                    key = (round(px, 7), round(py, 7))
                    if key not in vertex_index:
                        vertex_index[key] = len(vertices)
                        vertices.append([round(center[0] + px / scale_x, 9), round(center[1] + py / 111320, 9)])
                    face.append(vertex_index[key])
                a, b, c = [vertices[i] for i in face]
                signed_area = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])
                # Grid clipping can produce sub-millimetre slivers that collapse
                # after coordinate rounding; those have no rendered surface.
                if signed_area != 0:
                    indices.extend(face if signed_area > 0 else [face[0], face[2], face[1]])
    return {'vertices': vertices, 'indices': indices, 'spacingMeters': spacing}


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('step', choices=['base', 'osm', 'canopy', 'features'])
    args = parser.parse_args()
    {'base': base_assets, 'osm': extract_osm, 'canopy': canopy_assets, 'features': prepare_features}[args.step]()
