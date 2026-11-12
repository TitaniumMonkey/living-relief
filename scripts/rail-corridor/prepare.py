"""Build a 3.2 km offline railway corridor without replacing existing town tiles."""
import argparse
import copy
import importlib.util
import json
import math
from collections import Counter
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import numpy as np
import rasterio
from rasterio.transform import from_bounds
from rasterio.warp import reproject, Resampling, transform_bounds
from rasterio.windows import from_bounds as window_from_bounds
from shapely import prepare
from shapely.geometry import LineString, Point, box, mapping, shape
from shapely.ops import transform, unary_union
from shapely.strtree import STRtree

ROOT = Path(__file__).resolve().parents[2]
STAGE = Path('/private/tmp/relief-rail-corridor')
CACHE = STAGE / 'cache'
OUTPUT = STAGE / 'public/world'
spec = importlib.util.spec_from_file_location('expansion', ROOT / 'scripts/expansion/prepare-expansion.py')
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)
base = m.base
m.STAGE, m.CACHE, m.OUTPUT = STAGE, CACHE, OUTPUT
CURRENT = json.loads((ROOT / 'public/world/manifest.json').read_text())
CURRENT['areas'] = [a for a in CURRENT['areas'] if a['id'] != 'rail-corridor']
ROUTE = json.loads((ROOT / 'public/travel/ollantaytambo-aguas.json').read_text())['legs'][0]['coordinates']
CENTER = [-72.4, -13.2]
PROJECT = base.metres_transform(CENTER)
SCALE_X = 111320 * math.cos(math.radians(CENTER[1]))
RADIUS = 3200
# Untagged source footprints cross the mapped railway; keep them in source-extract only.
RAIL_FOOTPRINT_CONFLICTS = {'way/787481745', 'way/789482155'}


def corridor():
    return transform(PROJECT, LineString(ROUTE)).buffer(RADIUS)


def subtract_rectangle(bounds, removed):
    """Partition a grid tile around the existing nonaligned Machu rectangle."""
    w, s, e, n = bounds
    a, b, c, d = removed
    if not box(*bounds).intersection(box(*removed)).area:
        return [bounds]
    parts = [[w, s, min(e, a), n], [max(w, c), s, e, n],
             [max(w, a), s, min(e, c), min(n, b)],
             [max(w, a), max(s, d), min(e, c), n]]
    return [p for p in parts if p[2] - p[0] > 1e-10 and p[3] - p[1] > 1e-10]


def definition():
    coverage = corridor()
    existing = {t['terrain']['url']: t for a in CURRENT['areas'] for t in a['tiles']}
    machu = next(a for a in CURRENT['areas'] if a['id'] == 'machu')
    xs, ys = zip(*ROUTE)
    west, east = min(xs) - RADIUS / SCALE_X, max(xs) + RADIUS / SCALE_X
    south, north = min(ys) - RADIUS / 111320, max(ys) + RADIUS / 111320
    tiles = []
    for row in range(math.floor((m.ORIGIN_LAT - north) / m.STEP_LAT), math.ceil((m.ORIGIN_LAT - south) / m.STEP_LAT)):
        for col in range(math.floor((west - m.ORIGIN_LON) / m.STEP_LON), math.ceil((east - m.ORIGIN_LON) / m.STEP_LON)):
            bounds = m.tile_bounds(col, row)
            if not transform(PROJECT, box(*bounds)).intersects(coverage):
                continue
            prefix = f'/world/grid/g{col}_{row}'
            if prefix + '-terrain.bin' in existing:
                tiles.append(copy.deepcopy(existing[prefix + '-terrain.bin']))
                continue
            parts = subtract_rectangle(bounds, machu['bounds'])
            for part_index, part in enumerate(parts):
                if not transform(PROJECT, box(*part)).intersects(coverage):
                    continue
                suffix = f'-rail{part_index}' if part != bounds else ''
                tile_id = f'g{col}_{row}{suffix}'
                stem = f'/world/grid/{tile_id}'
                tiles.append({'id': tile_id, 'col': col, 'row': row, 'grid': 'valley' if not suffix else 'rail-fringe',
                              'areaId': 'rail-corridor', 'detail': 'full', 'bounds': part,
                              'terrain': {'url': stem + '-terrain.bin', 'n': 129},
                              'landcover': {'url': stem + '-landcover.bin', 'n': 200, 'haloUrl': stem + '-landcover-halo.bin'},
                              'features': stem + '-features.json'})
    tiles.extend(copy.deepcopy(machu['tiles']))
    bounds = [min(t['bounds'][0] for t in tiles), min(t['bounds'][1] for t in tiles),
              max(t['bounds'][2] for t in tiles), max(t['bounds'][3] for t in tiles)]
    return {'id': 'rail-corridor', 'name': 'Ollantaytambo–Aguas Calientes railway corridor',
            'center': CENTER, 'bounds': bounds, 'detail': 'full', 'tiles': tiles,
            'context': '/world/rail-corridor/context.geojson'}


def new_tiles():
    return [t for t in definition()['tiles'] if t.get('areaId') == 'rail-corridor']


def raster_crop(url, output, bounds):
    if output.exists():
        return
    with rasterio.Env(GDAL_DISABLE_READDIR_ON_OPEN='EMPTY_DIR'):
        with rasterio.open(url) as source:
            native = transform_bounds('EPSG:4326', source.crs, *bounds)
            window = window_from_bounds(*native, transform=source.transform).round_offsets().round_lengths()
            window = window.intersection(rasterio.windows.Window(0, 0, source.width, source.height))
            values = source.read(1, window=window)
            profile = source.profile.copy()
            profile.update(width=values.shape[1], height=values.shape[0], transform=source.window_transform(window), compress='deflate')
            with rasterio.open(output, 'w', **profile) as target:
                target.write(values, 1)


def cover_grid(bounds, n):
    result = np.zeros((n, n), dtype=np.uint8)
    with rasterio.open(CACHE / 'worldcover.tif') as source:
        reproject(rasterio.band(source, 1), result, src_transform=source.transform, src_crs=source.crs,
                  dst_transform=from_bounds(*bounds, n, n), dst_crs='EPSG:4326', resampling=Resampling.nearest)
    if np.any(result == 0):
        raise ValueError('WorldCover source crop does not cover a requested cell')
    return result


def source_assets():
    CACHE.mkdir(parents=True, exist_ok=True)
    base.TERRAIN_CACHE.mkdir(parents=True, exist_ok=True)
    tiles = new_tiles()
    needed = set()
    for tile in tiles:
        w, s, e, n = tile['bounds']
        x0, x1 = [(v + 180) / 360 * 8192 for v in [w, e]]
        y0, y1 = [(1 - math.asinh(math.tan(math.radians(v))) / math.pi) / 2 * 8192 for v in [n, s]]
        needed.update((x, y) for x in range(math.floor(x0 - .5 / 256), math.floor(x1 + .5 / 256) + 1)
                      for y in range(math.floor(y0 - .5 / 256), math.floor(y1 + .5 / 256) + 1))
    def fetch(key):
        x, y = key
        base.download(f'https://elevation-tiles-prod.s3.amazonaws.com/terrarium/13/{x}/{y}.png', base.TERRAIN_CACHE / f'13-{x}-{y}.png')
    with ThreadPoolExecutor(max_workers=6) as pool:
        list(pool.map(fetch, needed))
    b = definition()['bounds']
    padded = [b[0] - .003, b[1] - .003, b[2] + .003, b[3] + .003]
    raster_crop('https://esa-worldcover.s3.eu-central-1.amazonaws.com/v200/2021/map/ESA_WorldCover_10m_2021_v200_S15W075_Map.tif', CACHE / 'worldcover.tif', padded)
    source_tiles = {}
    for tile in tiles:
        b = tile['bounds']
        dx, dy = (b[2] - b[0]) * .04, (b[3] - b[1]) * .04
        terrain = base.terrain_grid(b, 129, source_tiles)
        cover = cover_grid(b, 200)
        halo = cover_grid([b[0] - dx, b[1] - dy, b[2] + dx, b[3] + dy], 216)
        halo[8:208, 8:208] = cover
        for url, values in [(tile['terrain']['url'], terrain), (tile['landcover']['url'], cover), (tile['landcover']['haloUrl'], halo)]:
            path = m.local_path(url)
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(values.tobytes())
    print('Terrain and source classification ready:', len(tiles), 'new tiles;', len(needed), 'source DEM tiles', flush=True)


def canopy_assets():
    area = definition()
    sources = []
    for key in sorted(base.covering_quadkeys(area['bounds'], 10)):
        url = f'{base.CANOPY_BASE}/chm/{key}.tif'
        raster_crop(url, CACHE / f'canopy-{key}.tif', area['bounds'])
        meta = base.download(f'{base.CANOPY_BASE}/metadata/{key}.geojson', CACHE / f'canopy-metadata-{key}.geojson')
        sources.append({'quadkey': key, 'url': url, 'metadataUrl': f'{base.CANOPY_BASE}/metadata/{key}.geojson',
                        'metadata': [f for f in json.loads(meta.read_text())['features'] if shape(f['geometry']).intersects(box(*area['bounds']))]})
        print('Canopy source', key, flush=True)
    base.write_json(CACHE / 'canopy-sources.json', sources)


def extract_osm():
    m.manifest = lambda: {'areas': CURRENT['areas'][:2] + [definition()]}
    m.extract_osm()


def features():
    raw = json.loads((CACHE / 'osm-expansion-source.json').read_text())
    source = raw['features']
    objects = [f for f in source if f['id'] not in RAIL_FOOTPRINT_CONFLICTS and f['properties']['kind'] not in ['context', 'archaeological_boundary', 'context_wall']]
    m.enrich_contained_pois(objects, source)
    exclusion = base.exclusion_geometry(objects, CENTER)
    rail = transform(PROJECT, LineString(ROUTE)).buffer(4)
    exclusion = unary_union([exclusion, rail])
    prepare(exclusion)
    geometries = [shape(f['geometry']) for f in objects]
    index = STRtree(geometries)
    sources = json.loads((CACHE / 'canopy-sources.json').read_text())
    observations = [(shape(f['geometry']), f['properties']['acq_date']) for s in sources for f in s['metadata']]
    observed = unary_union([g for g, date in observations])
    coverage, reports, occupied = [], [], set()
    for tile in new_tiles():
        b = tile['bounds']
        extent = box(*b)
        n = 320
        heights = np.zeros((n, n), dtype=np.uint8)
        dates = set()
        for entry in sources:
            with rasterio.open(CACHE / f"canopy-{entry['quadkey']}.tif") as canopy:
                reproject(rasterio.band(canopy, 1), heights, src_transform=canopy.transform, src_crs=canopy.crs,
                          dst_transform=from_bounds(*b, n, n), dst_crs='EPSG:4326', dst_nodata=0,
                          init_dest_nodata=False, resampling=Resampling.nearest)
            dates.update(date for g, date in observations if g.intersects(extent))
        cover = cover_grid(b, n)
        rows, cols = np.where((heights >= 3) & ~np.isin(cover, [50, 70, 80]))
        output = []
        for idx in index.query(extent):
            f, g = objects[idx], geometries[idx]
            if f['properties']['kind'] in ['building', 'tree', 'ruin']:
                p = g.representative_point()
                if not (b[0] <= p.x < b[2] and b[1] < p.y <= b[3]):
                    continue
            else:
                g = g.intersection(extent)
            if not g.is_empty:
                output.append(dict(f, geometry=mapping(g)))
        # Consistent global metre cells thin the detected canopy, not the geographic terrain.
        for row, col in zip(rows, cols):
            lon, lat = b[0] + (int(col) + .5) / n * (b[2] - b[0]), b[3] - (int(row) + .5) / n * (b[3] - b[1])
            point = transform(PROJECT, Point(lon, lat))
            gx, gy = math.floor(point.x / 18), math.floor(point.y / 18)
            score = ((gx * 73856093) ^ (gy * 19349663)) & 0xffffffff
            if (gx, gy) in occupied or (point.x % 18) >= 6.25 or (point.y % 18) >= 6.25 or score % 4 == 0 or exclusion.covers(point):
                continue
            occupied.add((gx, gy))
            output.append({'type': 'Feature', 'id': f'chmv2/rail/{tile["id"]}/{row}/{col}',
                           'geometry': {'type': 'Point', 'coordinates': [round(lon, 8), round(lat, 8)]},
                           'properties': {'kind': 'tree', 'height': int(heights[row, col]), 'source': 'chmv2', 'inferred': True}})
        base.write_json(m.local_path(tile['features']), {'type': 'FeatureCollection', 'features': output})
        fraction = observed.intersection(extent).area / extent.area
        coverage.append({'tile': tile['id'], 'observationDates': sorted(dates), 'observationCoverageFraction': fraction,
                         'positivePixels': int(np.count_nonzero(heights >= 3)), 'sampleCount': n * n})
        reports.append({'tile': tile['id'], 'counts': dict(Counter(f['properties']['kind'] for f in output))})
        print(tile['id'], reports[-1]['counts'], flush=True)
    contexts = [f for f in source if f['properties']['kind'] in ['context', 'archaeological_boundary'] or f['properties'].get('name')]
    out = OUTPUT / 'rail-corridor'
    base.write_json(out / 'context.geojson', {'type': 'FeatureCollection', 'features': contexts})
    base.write_json(out / 'source-extract.json', dict(raw, license='ODbL 1.0'))
    base.write_json(out / 'canopy-coverage.json', coverage)
    base.write_json(out / 'sources.json', {'accessed': '2026-09-08', 'bufferMeters': RADIUS,
                    'terrain': {'url': 'https://registry.opendata.aws/terrain-tiles/', 'accessed': '2026-09-08', 'zoom': 13, 'license': 'Public-domain source data; https://github.com/tilezen/joerd/blob/master/docs/attribution.md'},
                    'worldcover': {'url': 'https://esa-worldcover.org/en/data-access', 'date': '2021 v200', 'license': 'CC BY 4.0', 'attribution': '© ESA WorldCover project 2021 / Contains modified Copernicus Sentinel data (2021) processed by ESA WorldCover consortium'},
                    'canopyLicense': 'CC BY 4.0; WRI and Meta CHMv2; 2018-05-30 source imagery',
                    'osm': {'url': base.OSM_URL, 'date': '2026-09-03', 'license': 'ODbL 1.0', 'attribution': '© OpenStreetMap contributors'},
                    'canopy': [{k: v for k, v in s.items() if k != 'metadata'} for s in sources],
                    'notes': ['Original Mapzen zoom 13 DEM, 129 squared mesh per 2 km tile. Sampling spacing is not survey accuracy.',
                              'WorldCover 2021 classes retain 10 m source sampling; natural materials are illustrative.',
                              'CHMv2-guided tree crowns and untagged building heights/roofs are illustrative. No buildings are invented to fill OSM gaps.']})
    base.write_json(out / 'report.json', {'newTiles': len(reports), 'tiles': reports, 'omittedRenderFootprints': sorted(RAIL_FOOTPRINT_CONFLICTS), 'omissionReason': 'Untagged OSM building footprints intersect the mapped railway centerline. Original source geometries retained; no buildings relocated.'})
    base.write_json(OUTPUT / 'rail-corridor-area.json', definition())


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('step', choices=['base', 'canopy', 'osm', 'features', 'plan'])
    step = parser.parse_args().step
    if step == 'plan':
        print(json.dumps({'newTiles': len(new_tiles()), 'area': definition()}, indent=2))
    else:
        {'base': source_assets, 'canopy': canopy_assets, 'osm': extract_osm, 'features': features}[step]()
