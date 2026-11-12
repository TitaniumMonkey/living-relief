import importlib.util
from pathlib import Path
import unittest
from shapely.geometry import Polygon
from shapely.ops import unary_union

spec = importlib.util.spec_from_file_location('saltworks', Path(__file__).with_name('prepare-saltworks.py'))
saltworks = importlib.util.module_from_spec(spec)
spec.loader.exec_module(saltworks)


class SaltworksTests(unittest.TestCase):
    def test_basins_preserve_boundary_holes_and_do_not_overlap(self):
        boundary = Polygon([(0, 0), (100, 0), (87, 85), (30, 100), (0, 50)],
                           holes=[[(35, 30), (55, 30), (55, 50), (35, 50)]])
        basins = saltworks.pond_cells(boundary, .41)
        self.assertGreater(len(basins), 150)
        union = unary_union([b[0] for b in basins])
        self.assertLess(union.difference(boundary).area, 1e-8)
        self.assertAlmostEqual(union.area, sum(b[0].area for b in basins), places=7)
        for footprint, pools, rims in basins:
            self.assertTrue(footprint.covers(pools))
            self.assertAlmostEqual(pools.area + rims.area, footprint.area, places=8)
        repeat = saltworks.pond_cells(boundary, .41)
        self.assertEqual([b[0].wkt for b in basins], [b[0].wkt for b in repeat])


if __name__ == '__main__':
    unittest.main()
