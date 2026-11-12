"""Audit actual prepared assets; this does not modify the application checkout."""
import importlib.util
import json
from collections import Counter
from pathlib import Path

import numpy as np
from shapely.geometry import Point, Polygon, shape, box
from shapely.ops import transform, unary_union
from shapely.strtree import STRtree

spec = importlib.util.spec_from_file_location('features', Path(__file__).with_name('prepare-cusco-features.py'))
p = importlib.util.module_from_spec(spec)
spec.loader.exec_module(p)
c, m, base = p.c, p.m, p.base


def main():
    area = p.AREA
    tiles = area['tiles']
    assert len(tiles) == 24
    arrays, features, full_ids, reused = {}, [], set(), 0
    for tile in tiles:
        terrain = m.local_path(tile['terrain']['url'])
        arrays[tile['id']] = np.frombuffer(terrain.read_bytes(), dtype='<f4').reshape(129, 129)
        assert np.isfinite(arrays[tile['id']]).all()
        cover = np.frombuffer(m.local_path(tile['landcover']['url']).read_bytes(), dtype=np.uint8).reshape(200, 200)
        halo = np.frombuffer(m.local_path(tile['landcover']['haloUrl']).read_bytes(), dtype=np.uint8).reshape(216, 216)
        assert np.array_equal(cover, halo[8:208, 8:208])
        old = c.CHECKOUT / 'public' / tile['terrain']['url'].lstrip('/')
        if old.exists():
            assert old.read_bytes() == terrain.read_bytes()
            reused += 1
        values = json.loads(m.local_path(tile['features']).read_text())['features']
        assert values
        for value in values:
            props, geometry = value['properties'], shape(value['geometry'])
            assert geometry.is_valid, value['id']
            assert geometry.geom_type in ['Point', 'LineString', 'MultiLineString', 'Polygon', 'MultiPolygon'], (value['id'], geometry.geom_type)
            assert not any(k.startswith(('addr:', 'contact:')) or k in ['phone', 'email', 'operator', 'user', 'uid'] for k in props.get('tags', {}))
            if props['kind'] in ['building', 'tree', 'ruin']:
                assert value['id'] not in full_ids, value['id']
                full_ids.add(value['id'])
                w, s, e, n = tile['bounds']
                center = geometry.representative_point()
                assert w <= center.x < e and s < center.y <= n
            if props['source'] == 'chmv2':
                assert props['height'] >= 3 and props['inferred']
            if 'surfaceGrid' in value:
                grid = value['surfaceGrid']
                triangles = [Polygon([grid['vertices'][j] for j in grid['indices'][i:i+3]]) for i in range(0, len(grid['indices']), 3)]
                assert all(t.exterior.is_ccw for t in triangles)
                assert unary_union(triangles).symmetric_difference(geometry).area / geometry.area < 2e-5
        features.extend(values)
    edges = 0
    by_grid = {(t['col'], t['row']): t for t in tiles}
    for (col, row), tile in by_grid.items():
        if (col + 1, row) in by_grid:
            right = by_grid[(col + 1, row)]
            assert np.array_equal(arrays[tile['id']][:, -1], arrays[right['id']][:, 0])
            edges += 1
        if (col, row + 1) in by_grid:
            below = by_grid[(col, row + 1)]
            assert np.array_equal(arrays[tile['id']][-1, :], arrays[below['id']][0, :])
            edges += 1
    raw = json.loads((m.CACHE / 'osm-expansion-source.json').read_text())['features']
    mapped = [shape(f['geometry']) for f in raw if f['properties']['kind'] in ['building', 'ruin']]
    mapped_index = STRtree(mapped)
    extras = [shape(f['geometry']) for f in features if f['properties']['source'] == 'microsoft']
    ms_overlap = 0
    for geometry in extras:
        assert not any(geometry.intersection(mapped[i]).area > 0 for i in mapped_index.query(geometry))
    extra_index = STRtree(extras)
    for i, geometry in enumerate(extras):
        for j in extra_index.query(geometry):
            if j > i and geometry.intersection(extras[j]).area > 1e-15:
                ms_overlap += 1
    assert ms_overlap == 0, f'Microsoft internal overlapping pairs: {ms_overlap}'
    prohibited = p.open_space_geometry(raw)
    assert not any(prohibited.intersects(geometry) for geometry in extras)
    mask = p.canopy_exclusions(features, raw)
    project = base.metres_transform(p.CENTER)
    collisions = sum(mask.covers(transform(project, shape(f['geometry']))) for f in features if f['properties']['source'] == 'chmv2')
    assert collisions == 0, collisions
    airport = [f for f in features if f['properties']['kind'] == 'aeroway']
    airport_unique = {f['id']: f for f in airport}
    runways = [f for f in airport_unique.values() if f['properties']['aeroway'] == 'runway']
    assert len(runways) == 1
    assert runways[0]['id'] == 'way/4818929'
    assert runways[0]['properties']['width'] == 45
    assert runways[0]['properties']['length'] == 3400
    assert runways[0]['properties']['ref'] == '10/28'
    terminal = next(f for f in features if f['id'] == 'way/4818980')
    assert terminal['properties']['height'] == 8 and terminal['properties']['aeroway'] == 'terminal'
    assert not any(f['properties']['kind'] == 'road' and f['properties'].get('aeroway') in ['runway', 'taxiway', 'apron'] for f in features)
    airport_source = next(f for f in raw if f['id'] == 'way/614956903')
    assert box(*area['bounds']).covers(shape(airport_source['geometry']))
    result = {'tiles': len(tiles), 'reusedTerrainTilesByteIdentical': reused, 'exactHaloCenters': len(tiles),
              'matchedTerrainEdges': edges, 'completeFeatureIdsUnique': len(full_ids),
              'buildingSources': dict(Counter(f['properties']['source'] for f in features if f['properties']['kind'] == 'building')),
              'microsoftOverlapOsm': 0, 'microsoftInternalOverlaps': ms_overlap, 'microsoftOpenSpaceIntrusions': 0,
              'canopyExclusionCollisions': collisions,
              'airportUniqueFeatures': dict(Counter(f['properties']['aeroway'] for f in airport_unique.values())),
              'airportWhollyWithinBounds': True}
    m.write_json(m.OUTPUT / 'cusco-validation-report.json', result)
    print(json.dumps(result, indent=2))


if __name__ == '__main__':
    main()
