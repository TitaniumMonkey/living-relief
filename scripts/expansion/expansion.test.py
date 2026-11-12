"""Focused synthetic regressions for expansion geometry and metadata ownership."""
import importlib.util
import math
import unittest
from pathlib import Path

from shapely.geometry import Point, Polygon, box, shape, mapping
from shapely.ops import unary_union, transform

spec = importlib.util.spec_from_file_location('expansion', Path(__file__).with_name('prepare-expansion.py'))
expansion = importlib.util.module_from_spec(spec)
spec.loader.exec_module(expansion)


def feature(identifier, geometry, kind, **props):
    return {'type': 'Feature', 'id': identifier, 'geometry': mapping(geometry),
            'properties': {'kind': kind, 'source': 'osm', **props}}


class ExpansionTests(unittest.TestCase):
    def test_shared_global_grid_edges_and_no_interior_overlap(self):
        for col, row in [(-3, 2), (7, 12), (0, 0)]:
            current = expansion.tile_bounds(col, row)
            east = expansion.tile_bounds(col + 1, row)
            south = expansion.tile_bounds(col, row + 1)
            self.assertEqual(current[2], east[0])
            self.assertEqual(current[1], south[3])
            self.assertEqual(box(*current).intersection(box(*east)).area, 0)
            self.assertEqual(box(*current).intersection(box(*south)).area, 0)

    def test_poi_enrichment_requires_containment_and_preserves_source_name(self):
        building = feature('synthetic/building', Polygon([(0, 0), (4, 0), (4, 4), (0, 4)],
                                                        [[(1, 1), (3, 1), (3, 3), (1, 3)]]), 'building', name='Mapped Hall')
        points = [feature('synthetic/inside', Point(.5, .5), 'context', name='Library', amenity='library'),
                  feature('synthetic/courtyard', Point(2, 2), 'context', name='Courtyard'),
                  feature('synthetic/nearby', Point(4.01, 2), 'context', name='Nearby cafe'),
                  feature('synthetic/boundary', Point(4, 2), 'context', name='Boundary point')]
        self.assertEqual(expansion.enrich_contained_pois([building], points), 1)
        self.assertEqual(building['properties']['name'], 'Mapped Hall')
        self.assertEqual(building['properties']['amenity'], 'library')
        self.assertEqual([p['id'] for p in building['properties']['containedPois']], ['synthetic/inside'])

    def test_multiple_contained_pois_do_not_invent_one_building_identity(self):
        building = feature('synthetic/building', box(0, 0, 4, 4), 'building')
        points = [feature('synthetic/a', Point(1, 1), 'context', name='Gallery'),
                  feature('synthetic/b', Point(3, 3), 'context', name='Library')]
        expansion.enrich_contained_pois([building], points)
        self.assertNotIn('name', building['properties'])
        self.assertEqual(len(building['properties']['containedPois']), 2)

    def test_public_tags_keep_materials_without_addresses_or_contacts(self):
        props = expansion.properties({'name': 'Example Museum', 'roof:colour': '#345678',
                                      'building:material': 'brick', 'building:color': 'red',
                                      'addr:street': 'synthetic street', 'contact:phone': '000000',
                                      'height': '-1', 'building:levels': '2'}, 'building')
        self.assertEqual(props['wallColor'], 'red')
        self.assertEqual(props['wallMaterial'], 'brick')
        self.assertEqual(props['roofColor'], '#345678')
        self.assertEqual(props['levels'], 2)
        self.assertNotIn('height', props)
        self.assertNotIn('addr:street', props['tags'])
        self.assertNotIn('contact:phone', props['tags'])

    def test_surface_grid_covers_concavity_and_preserves_hole(self):
        center = [expansion.ORIGIN_LON, expansion.ORIGIN_LAT]
        scale_x = 111320 * math.cos(math.radians(center[1]))
        inverse = lambda x, y: (center[0] + x / scale_x, center[1] + y / 111320)
        polygon = Polygon([(0, 0), (50, 0), (50, 20), (30, 20), (30, 50), (0, 50)],
                          [[(5, 5), (10, 5), (10, 10), (5, 10)]])
        geographic = transform(inverse, polygon)
        grid = expansion.surface_grid(geographic)
        project = expansion.base.metres_transform(center)
        vertices = [project(*v) for v in grid['vertices']]
        triangles = [Polygon([vertices[j] for j in grid['indices'][i:i + 3]]) for i in range(0, len(grid['indices']), 3)]
        self.assertTrue(all(t.exterior.is_ccw for t in triangles))
        coverage = unary_union(triangles)
        self.assertLess(coverage.symmetric_difference(polygon).area, .03)
        self.assertFalse(coverage.covers(Point(7, 7)))
        self.assertLessEqual(max(max(math.dist(a, b) for a in t.exterior.coords for b in t.exterior.coords)
                                 for t in triangles), 15 * math.sqrt(2) + .001)

    def test_microsoft_overlap_keeps_osm_and_nonoverlapping_candidate(self):
        mapped = [box(0, 0, 2, 2)]
        candidates = [feature('synthetic/overlap', box(1, 1, 3, 3), 'building'),
                      feature('synthetic/separate', box(4, 4, 5, 5), 'building')]
        self.assertEqual([f['id'] for f in expansion.base.supplemental_buildings(candidates, mapped)],
                         ['synthetic/separate'])


if __name__ == '__main__':
    unittest.main()
