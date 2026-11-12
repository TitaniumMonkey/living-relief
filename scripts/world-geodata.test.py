"""Synthetic geography regressions for the offline Living World preparation."""
import importlib.util
import math
import unittest
from pathlib import Path

from shapely.geometry import Point, box, mapping

spec = importlib.util.spec_from_file_location('prepare_world', Path(__file__).with_name('prepare-world.py'))
world = importlib.util.module_from_spec(spec)
spec.loader.exec_module(world)


def feature(geometry, kind='building', source='osm'):
    return {'type': 'Feature', 'id': 'synthetic', 'geometry': mapping(geometry),
            'properties': {'kind': kind, 'source': source}}


class WorldGeodataTests(unittest.TestCase):
    def test_tiles_cover_area_with_shared_exact_edges(self):
        area = world.area_definition('synthetic', 'Synthetic', [2, 3])
        tiles = {tile['id']: tile for tile in area['tiles']}
        self.assertEqual(len(tiles), 9)
        union = world.unary_union([box(*tile['bounds']) for tile in tiles.values()])
        self.assertLess(union.symmetric_difference(box(*area['bounds'])).area, 1e-12)
        self.assertEqual(tiles['0-0']['bounds'][2], tiles['1-0']['bounds'][0])
        self.assertEqual(tiles['1-0']['bounds'][1], tiles['1-1']['bounds'][3])
        width = (area['bounds'][2] - area['bounds'][0]) * 111320 * math.cos(math.radians(3))
        self.assertAlmostEqual(width, 6000, places=6)

    def test_microsoft_overlap_removes_duplicate_and_keeps_valid_new_footprint(self):
        mapped = [box(0, 0, 1, 1)]
        duplicate = feature(box(.2, .2, .9, .9), source='microsoft')
        adjoining = feature(box(1, 0, 2, 1), source='microsoft')
        separate = feature(box(3, 3, 4, 4), source='microsoft')
        self.assertEqual(world.supplemental_buildings([duplicate, adjoining, separate], mapped), [adjoining, separate])

    def test_canopy_exclusion_covers_buildings_roads_and_water_keeps_open_ground(self):
        features = [feature(box(-.00001, -.00001, .00001, .00001)),
                    feature(world.LineString([(.001, -.001), (.001, .001)]), 'road'),
                    feature(box(.002, 0, .0021, .0001), 'water')]
        mask = world.exclusion_geometry(features, [0, 0])
        self.assertTrue(mask.covers(Point(0, 0)))
        self.assertTrue(mask.covers(Point(111.32, 0)))
        self.assertTrue(mask.covers(Point(228, 5)))
        self.assertFalse(mask.covers(Point(60, 60)))

    def test_canopy_exclusion_preserves_polygon_courtyard(self):
        shell = [(-.001, -.001), (.001, -.001), (.001, .001), (-.001, .001), (-.001, -.001)]
        hole = [(-.0005, -.0005), (-.0005, .0005), (.0005, .0005), (.0005, -.0005), (-.0005, -.0005)]
        from shapely.geometry import Polygon
        mask = world.exclusion_geometry([feature(Polygon(shell, [hole]))], [0, 0])
        self.assertFalse(mask.covers(Point(0, 0)))
        self.assertTrue(mask.covers(Point(90, 0)))

    def test_curated_core_omits_generic_mass_but_keeps_outside_buildings_shelters_and_ruins(self):
        core = box(0, 0, 10, 10)
        generic = feature(box(2, 2, 3, 3))
        generic['properties']['buildingType'] = 'yes'
        outside = feature(box(12, 2, 13, 3))
        outside['properties']['buildingType'] = 'yes'
        shelter = feature(box(4, 4, 5, 5))
        shelter['properties']['buildingType'] = 'roof'
        civic = feature(box(6, 6, 7, 7))
        civic['properties']['buildingType'] = 'civic'
        ruin = feature(box(8, 8, 9, 9), 'ruin')
        ruin['properties']['buildingType'] = 'yes'
        kept, omitted = world.curated_core_buildings([generic, outside, shelter, civic, ruin], core)
        self.assertEqual(omitted, [generic])
        self.assertEqual(kept, [outside, shelter, civic, ruin])
        self.assertEqual(generic['properties']['kind'], 'building')


if __name__ == '__main__':
    unittest.main()
