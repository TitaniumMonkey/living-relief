"""Build source-attributed Cusco features and validate the supplemental city fabric."""
import argparse
import copy
import gzip
import importlib.util
import json
import math
from collections import Counter
from pathlib import Path

import numpy as np
from shapely import make_valid, prepare
from shapely.geometry import Point, box, mapping, shape
from shapely.ops import transform, unary_union
from shapely.strtree import STRtree

spec = importlib.util.spec_from_file_location('cusco', Path(__file__).with_name('prepare-cusco.py'))
c = importlib.util.module_from_spec(spec)
spec.loader.exec_module(c)
m, base = c.m, c.m.base
AREA = c.manifest()['areas'][-1]
CENTER = [-71.96, -13.53]


def microsoft_candidates():
    bounds, candidates, sources = box(*AREA['bounds']), [], []
    for source in json.loads((base.CACHE / 'microsoft-sources.json').read_text()):
        if source['QuadKey'] not in base.covering_quadkeys(AREA['bounds'], 9):
            continue
        sources.append(source)
        with gzip.open(base.CACHE / f"microsoft-{source['QuadKey']}.geojsonl.gz", 'rt') as handle:
            for index, line in enumerate(handle):
                value = json.loads(line)
                geometry = shape(value['geometry'])
                if not bounds.covers(geometry.representative_point()):
                    continue
                if not geometry.is_valid:
                    geometry = make_valid(geometry)
                props = {'kind': 'building', 'source': 'microsoft', 'inferred': True}
                if value['properties'].get('height', -1) > 0:
                    props['height'] = value['properties']['height']
                candidates.append({'type': 'Feature', 'id': f"microsoft/{source['QuadKey']}/{index}",
                                   'geometry': mapping(geometry), 'properties': props})
    m.write_json(m.CACHE / 'microsoft-cusco-candidates.json', {
        'type': 'FeatureCollection', 'features': candidates, 'sources': sources,
        'license': 'CDLA Permissive 2.0'})
    print('Microsoft Cusco candidates', len(candidates), flush=True)


def open_space_geometry(source):
    """Keep mapped plazas, fields, recreation areas, archaeology and airfields open."""
    polygons = []
    for feature in source:
        props, geometry = feature['properties'], shape(feature['geometry'])
        tags = props.get('tags', {})
        if geometry.geom_type not in ['Polygon', 'MultiPolygon']:
            continue
        if (props['kind'] == 'archaeological_boundary'
                or props.get('aeroway') in ['aerodrome', 'runway', 'taxiway', 'apron']
                or props.get('landuse') in ['construction', 'cemetery', 'recreation_ground', 'farmland', 'orchard', 'meadow']
                or props['kind'] == 'water'
                or tags.get('highway') == 'pedestrian'
                or tags.get('leisure') in ['park', 'garden', 'pitch', 'playground', 'swimming_pool', 'dog_park', 'common']):
            polygons.append(geometry)
    return unary_union(polygons)


def aeroway_feature(feature):
    """Keep source airport geometry and dimensions separate from drivable streets."""
    feature = copy.deepcopy(feature)
    props = feature['properties']
    props['kind'] = 'aeroway'
    props['geometryDetail'] = 'Mapped OSM geometry; widths are supplied only when mapped.'
    for key in ['width', 'length']:
        value = base.number_tag(props.get('tags', {}), key)
        if value is not None and value > 0:
            props[key] = value
    for key in ['ref', 'surface', 'lit']:
        if key in props.get('tags', {}):
            props[key] = props['tags'][key]
    return feature


def dissolve_microsoft_overlaps(features):
    """Retain exact detected ground coverage without duplicate overlapping walls."""
    geometries = [shape(f['geometry']) for f in features]
    index, parents = STRtree(geometries), list(range(len(features)))
    def root(i):
        while parents[i] != i:
            parents[i] = parents[parents[i]]
            i = parents[i]
        return i
    for i, geometry in enumerate(geometries):
        for j in index.query(geometry):
            if j > i and geometry.intersection(geometries[j]).area > 0:
                parents[root(int(j))] = root(i)
    groups = {}
    for i in range(len(features)):
        groups.setdefault(root(i), []).append(i)
    result = []
    for members in groups.values():
        if len(members) == 1:
            result.append(features[members[0]])
            continue
        source_ids = sorted(features[i]['id'] for i in members)
        geometry = unary_union([geometries[i] for i in members])
        properties = {'kind': 'building', 'source': 'microsoft', 'inferred': True,
                      'sourceIds': source_ids,
                      'geometryDetail': 'Exact union of overlapping Microsoft footprint predictions; internal building divisions are not resolved.'}
        heights = [features[i]['properties']['height'] for i in members if 'height' in features[i]['properties']]
        if heights:
            properties['height'] = max(heights)
            properties['heightDetail'] = 'Maximum source estimate within the dissolved prediction group.'
        result.append({'type': 'Feature', 'id': source_ids[0] + '/union',
                       'geometry': mapping(geometry), 'properties': properties})
    return result


def canopy_exclusions(features, source):
    project = base.metres_transform(CENTER)
    mask = base.exclusion_geometry(features, CENTER)
    additional = []
    for feature in source:
        props = feature['properties']
        geometry = transform(project, shape(feature['geometry']))
        if props.get('aeroway') in ['aerodrome', 'runway', 'taxiway', 'apron']:
            if geometry.geom_type.endswith('LineString'):
                width = base.number_tag(props.get('tags', {}), 'width')
                geometry = geometry.buffer((width / 2 if width else 4) + 2)
            additional.append(geometry)
        elif props.get('landuse') == 'construction':
            additional.append(geometry)
        elif props['kind'] == 'tree':
            additional.append(geometry.buffer(5))
    result = unary_union([mask] + additional)
    prepare(result)
    return result


def prepare_features():
    raw = json.loads((m.CACHE / 'osm-expansion-source.json').read_text())
    source = raw['features']
    geometries = [shape(f['geometry']) for f in source]
    archaeological = unary_union([g for f, g in zip(source, geometries)
                                 if f['properties']['kind'] == 'archaeological_boundary'])
    features = []
    # OSM emits closed aeroway ways both as lines and areas. Prefer their area.
    aeroway_areas = {f['id'] for f in source if f['properties'].get('aeroway') in ['runway', 'taxiway', 'apron']
                    and f['geometry']['type'] in ['Polygon', 'MultiPolygon']}
    for feature, geometry in zip(source, geometries):
        props, kind = feature['properties'], feature['properties']['kind']
        if props.get('aeroway') in ['runway', 'taxiway', 'apron']:
            if feature['id'] in aeroway_areas and geometry.geom_type.endswith('LineString'):
                continue
            features.append(aeroway_feature(feature))
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

    ms = json.loads((m.CACHE / 'microsoft-cusco-candidates.json').read_text())
    prohibited = open_space_geometry(source)
    eligible = [f for f in ms['features'] if not prohibited.intersects(shape(f['geometry']))]
    mapped = [shape(f['geometry']) for f in features if f['properties']['kind'] in ['building', 'ruin']]
    non_overlapping_osm = base.supplemental_buildings(eligible, mapped)
    supplement = dissolve_microsoft_overlaps(non_overlapping_osm)
    features.extend(supplement)
    enriched = m.enrich_contained_pois(features, source)
    project = base.metres_transform(CENTER)
    mask = canopy_exclusions(features, source)
    candidates = []
    for tile in AREA['tiles']:
        heights = np.load(m.CACHE / f"canopy-{tile['id']}.npy")
        cover = base.landcover_grid(tile['bounds'], 320)
        rows, cols = np.where((heights >= 3) & ~np.isin(cover, [50, 70, 80]))
        for row, col in zip(rows, cols):
            gr, gc = tile['row'] * 320 + int(row), tile['col'] * 320 + int(col)
            score = ((gr * 73856093) ^ (gc * 19349663)) % 4294967291
            candidates.append((score, gr, gc, int(heights[row, col])))
    occupied, crowns, excluded = set(), [], 0
    for _, row, col, height in sorted(candidates):
        if any((row + dr, col + dc) in occupied for dr in [-1, 0, 1] for dc in [-1, 0, 1]):
            continue
        lon = m.ORIGIN_LON + (col + .5) / 320 * m.STEP_LON
        lat = m.ORIGIN_LAT - (row + .5) / 320 * m.STEP_LAT
        if mask.covers(transform(project, Point(lon, lat))):
            excluded += 1
            continue
        occupied.add((row, col))
        crowns.append({'type': 'Feature', 'id': f'chmv2/grid/{row}-{col}',
                       'geometry': {'type': 'Point', 'coordinates': [round(lon, 8), round(lat, 8)]},
                       'properties': {'kind': 'tree', 'height': height, 'source': 'chmv2', 'inferred': True}})
    features.extend(crowns)
    geometries = [shape(f['geometry']) for f in features]
    index = STRtree(geometries)
    reports = []
    for tile in AREA['tiles']:
        bounds, output = box(*tile['bounds']), []
        for idx in index.query(bounds):
            feature, geometry = features[idx], geometries[idx]
            if feature['properties']['kind'] in ['building', 'tree', 'ruin']:
                p = geometry.representative_point()
                w, s, e, n = tile['bounds']
                if not (w <= p.x < e and s < p.y <= n):
                    continue
            else:
                geometry = geometry.intersection(bounds)
            if geometry.geom_type == 'GeometryCollection':
                geometry = unary_union([g for g in geometry.geoms if g.geom_type in ['Polygon', 'LineString']])
            if geometry.is_empty:
                continue
            rendered = dict(feature, geometry=mapping(geometry))
            if feature['properties']['kind'] == 'aeroway' and geometry.geom_type in ['Polygon', 'MultiPolygon']:
                rendered['surfaceGrid'] = m.surface_grid(geometry)
            output.append(rendered)
        m.write_json(m.local_path(tile['features']), {'type': 'FeatureCollection', 'features': output})
        reports.append({'tile': tile['id'], 'counts': dict(Counter(f['properties']['kind'] for f in output)),
                        'sources': dict(Counter(f['properties']['source'] for f in output if f['properties']['kind'] == 'building')),
                        'bytes': m.local_path(tile['features']).stat().st_size})

    contexts = [f for f in source if f['properties']['kind'] in ['context', 'archaeological_boundary']
                or f['properties'].get('name') or f['properties'].get('aeroway')]
    airport = [f for f in source if f['properties'].get('aeroway')]
    m.write_json(m.OUTPUT / 'cusco/source-extract.json', raw | {'license': 'ODbL 1.0'})
    m.write_json(m.OUTPUT / 'cusco/context.geojson', {'type': 'FeatureCollection', 'features': contexts})
    m.write_json(m.OUTPUT / 'cusco/airport-source-extract.json', {'type': 'FeatureCollection', 'features': airport,
                 'sourceUrl': base.OSM_URL, 'sourceDate': '2026-09-03', 'license': 'ODbL 1.0'})
    m.write_json(m.OUTPUT / 'cusco/microsoft-source-extract.json', {'type': 'FeatureCollection', 'features': supplement,
                 'sources': ms['sources'], 'license': ms['license']})
    report = {'area': AREA, 'sourceCounts': dict(Counter(f['properties']['kind'] for f in source)),
              'renderedUnique': dict(Counter(f['properties']['kind'] for f in features)), 'tiles': reports,
              'microsoft': {'candidates': len(ms['features']), 'excludedMappedOpenSpace': len(ms['features']) - len(eligible),
                            'excludedOverlapOsm': len(eligible) - len(non_overlapping_osm),
                            'acceptedSourcePredictions': len(non_overlapping_osm),
                            'dissolvedOverlapGroups': sum('sourceIds' in f['properties'] for f in supplement),
                            'added': len(supplement), 'sources': ms['sources']},
              'canopy': {'candidates': len(candidates), 'crowns': len(crowns), 'excluded': excluded},
              'buildingsWithContainedPois': enriched,
              'unassemblableCountryAreaIds': raw['unassemblableCountryAreaIds']}
    m.write_json(m.OUTPUT / 'cusco-expansion-report.json', report)
    print(json.dumps({k: v for k, v in report.items() if k not in ['area', 'tiles']}, ensure_ascii=False, indent=2), flush=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('step', choices=['microsoft', 'features'])
    args = parser.parse_args()
    {'microsoft': microsoft_candidates, 'features': prepare_features}[args.step]()
