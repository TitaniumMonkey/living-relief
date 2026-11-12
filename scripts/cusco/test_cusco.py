import importlib.util
import unittest
from pathlib import Path
from shapely.geometry import box, mapping, shape
from shapely.ops import unary_union

spec = importlib.util.spec_from_file_location('features', Path(__file__).with_name('prepare-cusco-features.py'))
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)


class CuscoPreparationTest(unittest.TestCase):
    def test_overlapping_predictions_keep_exact_ground_coverage_and_separate_valid_building(self):
        footprints = [box(0, 0, 4, 4), box(3.9, 0, 8, 4), box(12, 0, 16, 4)]
        features = [{'type': 'Feature', 'id': f'microsoft/test/{i}', 'geometry': mapping(g),
                     'properties': {'kind': 'building', 'source': 'microsoft', 'inferred': True}}
                    for i, g in enumerate(footprints)]
        result = m.dissolve_microsoft_overlaps(features)
        self.assertEqual(len(result), 2)
        self.assertTrue(unary_union([shape(f['geometry']) for f in result]).equals(unary_union(footprints)))
        self.assertIn(features[-1], result)
        self.assertEqual(shape(result[0]['geometry']).intersection(shape(result[1]['geometry'])).area, 0)
        self.assertEqual(result[0]['properties']['sourceIds'], ['microsoft/test/0', 'microsoft/test/1'])

    def test_airport_geometry_preserves_mapped_width_without_inventing_missing_width(self):
        source = {'type': 'Feature', 'id': 'way/test', 'geometry': {'type': 'LineString', 'coordinates': [[0, 0], [1, 1]]},
                  'properties': {'kind': 'road', 'source': 'osm', 'aeroway': 'runway', 'tags': {'width': '45', 'length': '3400', 'ref': '10/28'}}}
        result = m.aeroway_feature(source)
        self.assertEqual(result['geometry'], source['geometry'])
        self.assertEqual(result['properties']['width'], 45)
        self.assertEqual(result['properties']['kind'], 'aeroway')
        source['properties']['tags'] = {}
        self.assertNotIn('width', m.aeroway_feature(source)['properties'])


if __name__ == '__main__':
    unittest.main()
