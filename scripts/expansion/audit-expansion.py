"""Audit prepared GIS assets without modifying the application checkout."""
import importlib.util
import json
from collections import Counter
from pathlib import Path

import numpy as np
from shapely.geometry import Point, Polygon, box, shape
from shapely.ops import transform, unary_union
from shapely.strtree import STRtree

ROOT = Path('/private/tmp/relief-expansion')
spec = importlib.util.spec_from_file_location('expansion', Path(__file__).with_name('prepare-expansion.py'))
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)


def read_asset(url):
    staged = m.local_path(url)
    return staged if staged.exists() else m.CHECKOUT / 'public' / url.lstrip('/')


def main():
    data = json.loads((m.OUTPUT / 'manifest.json').read_text())
    tiles = m.unique_tiles(data)
    assert len(tiles) == 59
    tile_bounds = [box(*t['bounds']) for t in tiles]
    for i, left in enumerate(tile_bounds):
        for right in tile_bounds[i + 1:]:
            assert left.intersection(right).area < 1e-14, 'terrain tile interior overlap'
    grids, halo_count = {}, 0
    for tile in tiles:
        elevation = np.frombuffer(read_asset(tile['terrain']['url']).read_bytes(), dtype='<f4').reshape(129, 129)
        assert np.isfinite(elevation).all()
        grids[tile['terrain']['url']] = elevation
        cover = np.frombuffer(read_asset(tile['landcover']['url']).read_bytes(), dtype=np.uint8).reshape(200, 200)
        halo = np.frombuffer(read_asset(tile['landcover']['haloUrl']).read_bytes(), dtype=np.uint8).reshape(216, 216)
        assert np.array_equal(cover, halo[8:208, 8:208]), tile['id']
        halo_count += 1
    matched_edges = 0
    for i, a in enumerate(tiles):
        aw, ass, ae, an = a['bounds']
        for b in tiles[i + 1:]:
            bw, bs, be, bn = b['bounds']
            ag, bg = grids[a['terrain']['url']], grids[b['terrain']['url']]
            if abs(ass - bs) < 1e-12 and abs(an - bn) < 1e-12:
                if abs(ae - bw) < 1e-12:
                    assert np.array_equal(ag[:, -1], bg[:, 0]), (a['id'], b['id'])
                    matched_edges += 1
                elif abs(be - aw) < 1e-12:
                    assert np.array_equal(bg[:, -1], ag[:, 0]), (a['id'], b['id'])
                    matched_edges += 1
            if abs(aw - bw) < 1e-12 and abs(ae - be) < 1e-12:
                if abs(ass - bn) < 1e-12:
                    assert np.array_equal(ag[-1, :], bg[0, :]), (a['id'], b['id'])
                    matched_edges += 1
                elif abs(bs - an) < 1e-12:
                    assert np.array_equal(bg[-1, :], ag[0, :]), (a['id'], b['id'])
                    matched_edges += 1
    features, full_ids, surfaces = [], set(), []
    per_area = []
    for area in data['areas'][2:]:
        area_features = []
        for tile in area['tiles']:
            values = json.loads(read_asset(tile['features']).read_text())['features']
            assert values, f"placeholder feature tile: {tile['id']}"
            for value in values:
                props, geometry = value['properties'], shape(value['geometry'])
                assert geometry.is_valid, value['id']
                assert geometry.geom_type in ['Point', 'LineString', 'MultiLineString', 'Polygon', 'MultiPolygon'], (value['id'], geometry.geom_type)
                assert all(np.isfinite(geometry.bounds)), value['id']
                assert not any(k.startswith(('addr:', 'contact:')) or k in ['phone', 'email', 'operator', 'user', 'uid'] for k in props.get('tags', {})), value['id']
                if props['kind'] in ['building', 'tree', 'ruin']:
                    assert value['id'] not in full_ids, value['id']
                    full_ids.add(value['id'])
                if props['source'] == 'chmv2':
                    assert props['height'] >= 3 and props.get('inferred') is True
                if 'surfaceGrid' in value:
                    grid = value['surfaceGrid']
                    triangles = [Polygon([grid['vertices'][j] for j in grid['indices'][i:i + 3]])
                                 for i in range(0, len(grid['indices']), 3)]
                    assert all(t.exterior.is_ccw for t in triangles), value['id']
                    coverage = unary_union(triangles)
                    assert coverage.symmetric_difference(geometry).area / geometry.area < 2e-5, value['id']
                    surfaces.append({'id': value['id'], 'tile': tile['id'], 'vertices': len(grid['vertices']), 'triangles': len(triangles)})
                area_features.append(value)
            features.extend(values)
        per_area.append({'id': area['id'], 'counts': dict(Counter(f['properties']['kind'] for f in area_features)),
                         'mappedBuildings': sum(f['properties']['kind'] == 'building' and f['properties']['source'] == 'osm' for f in area_features),
                         'microsoftBuildings': sum(f['properties']['kind'] == 'building' and f['properties']['source'] == 'microsoft' for f in area_features),
                         'namedBuildings': sum(f['properties']['kind'] == 'building' and bool(f['properties'].get('name')) for f in area_features)})
    # Public-source geometry audit, separate from synthetic test fixtures.
    raw = json.loads((m.CACHE / 'osm-expansion-source.json').read_text())['features']
    center = [-72.12, -13.34]
    project = m.base.metres_transform(center)
    mask = m.base.exclusion_geometry(features, center)
    extra = [transform(project, shape(f['geometry'])) for f in raw if f['properties'].get('landuse') == 'construction' or f['id'] == 'way/66568490']
    mapped_trees = [transform(project, shape(f['geometry'])) for f in raw if f['properties']['kind'] == 'tree']
    mask = unary_union([mask] + extra + [unary_union(mapped_trees).buffer(5)])
    from shapely import prepare
    prepare(mask)
    crown_points = [transform(project, shape(f['geometry'])) for f in features if f['properties']['source'] == 'chmv2']
    collisions = sum(mask.covers(p) for p in crown_points)
    assert collisions == 0, f'canopy exclusions: {collisions}'
    mapped = [shape(f['geometry']) for f in raw if f['properties']['kind'] in ['building', 'ruin']]
    tree = STRtree(mapped)
    supplements = [f for f in features if f['properties']['source'] == 'microsoft']
    assert all(not any(shape(f['geometry']).intersection(mapped[i]).area > 0 for i in tree.query(shape(f['geometry']))) for f in supplements)
    result = {'uniqueTiles': len(tiles), 'exactHaloCenters': halo_count, 'matchedTerrainEdges': matched_edges,
              'counts': dict(Counter(f['properties']['kind'] for f in features)), 'canopyExclusionCollisions': collisions,
              'areas': per_area, 'surfaces': surfaces}
    m.write_json(m.OUTPUT / 'validation-report.json', result)
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
