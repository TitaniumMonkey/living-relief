"""Geometry and source-data acceptance for the bounded railway asset build."""
import importlib.util
import json
import unittest
from pathlib import Path

import numpy as np
from shapely.geometry import box, shape
from shapely.ops import transform, unary_union

spec = importlib.util.spec_from_file_location('corridor_build', Path(__file__).with_name('prepare.py'))
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)


class CorridorTests(unittest.TestCase):
    def test_complete_buffer_and_no_town_overlap(self):
        tiles = m.definition()['tiles']
        coverage = unary_union([transform(m.PROJECT, box(*t['bounds'])) for t in tiles])
        self.assertLess(m.corridor().difference(coverage).area, .01)
        existing = [box(*t['bounds']) for a in m.CURRENT['areas'] for t in a['tiles']]
        for tile in m.new_tiles():
            self.assertLess(sum(box(*tile['bounds']).intersection(old).area for old in existing), 1e-12)

    def test_non_aligned_machu_partition_preserves_area(self):
        original, removed = [0, 0, 2, 2], [1, .5, 3, 1.5]
        parts = m.subtract_rectangle(original, removed)
        result = unary_union([box(*p) for p in parts])
        self.assertAlmostEqual(result.area, 3)
        self.assertEqual(result.intersection(box(*removed)).area, 0)
        self.assertEqual(sum(box(*p).area for p in parts), result.area)

    def test_original_elevation_shared_edges_and_cover_halos(self):
        tiles = m.new_tiles()
        data = {}
        for tile in tiles:
            terrain = np.fromfile(m.m.local_path(tile['terrain']['url']), dtype='<f4').reshape(129, 129)
            self.assertTrue(np.isfinite(terrain).all())
            self.assertGreater(float(terrain.min()), 1500)
            self.assertLess(float(terrain.max()), 6500)
            cover = np.fromfile(m.m.local_path(tile['landcover']['url']), dtype='uint8').reshape(200, 200)
            halo = np.fromfile(m.m.local_path(tile['landcover']['haloUrl']), dtype='uint8').reshape(216, 216)
            np.testing.assert_array_equal(cover, halo[8:208, 8:208])
            self.assertFalse((cover == 0).any())
            data[tile['id']] = terrain
        for a in tiles:
            for b in tiles:
                aw, ass, ae, an = a['bounds']
                bw, bs, be, bn = b['bounds']
                if abs(ae - bw) < 1e-10 and ass == bs and an == bn:
                    np.testing.assert_allclose(data[a['id']][:, -1], data[b['id']][:, 0], atol=.001)
                if abs(ass - bn) < 1e-10 and aw == bw and ae == be:
                    np.testing.assert_allclose(data[a['id']][-1], data[b['id']][0], atol=.001)

    def test_canopy_exclusions_and_mapped_building_identity(self):
        raw = json.loads((m.CACHE / 'osm-expansion-source.json').read_text())['features']
        source_by_id = {f['id']: f for f in raw}
        mask = m.base.exclusion_geometry(raw, m.CENTER)
        rail = transform(m.PROJECT, m.LineString(m.ROUTE)).buffer(4)
        m.prepare(mask)
        m.prepare(rail)
        counts = {'building': 0, 'tree': 0}
        for tile in m.new_tiles():
            for f in json.loads(m.m.local_path(tile['features']).read_text())['features']:
                kind = f['properties']['kind']
                if kind == 'building':
                    self.assertIn(f['id'], source_by_id)
                    self.assertEqual(f['geometry'], source_by_id[f['id']]['geometry'])
                    self.assertFalse(shape(f['geometry']).intersects(m.LineString(m.ROUTE)))
                    counts[kind] += 1
                if kind == 'tree' and f['properties']['source'] == 'chmv2':
                    point = transform(m.PROJECT, shape(f['geometry']))
                    self.assertFalse(mask.contains(point))
                    self.assertFalse(rail.contains(point))
                    self.assertGreaterEqual(f['properties']['height'], 3)
                    counts[kind] += 1
        self.assertGreater(counts['building'], 100)
        self.assertGreater(counts['tree'], 1000)


if __name__ == '__main__':
    unittest.main()
