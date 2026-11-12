import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location('network', Path(__file__).with_name('prepare-network.py'))
network = importlib.util.module_from_spec(spec)
spec.loader.exec_module(network)


class NetworkTests(unittest.TestCase):
    def test_driving_oneway_keeps_walk_reverse(self):
        self.assertEqual(network.masks({'highway': 'residential', 'oneway': 'yes'}), (3, 2))
        self.assertEqual(network.masks({'highway': 'residential', 'oneway': '-1'}), (2, 3))

    def test_access_restrictions_and_private_passenger_rail(self):
        self.assertEqual(network.masks({'highway': 'service', 'access': 'private'}), (0, 0))
        self.assertEqual(network.masks({'highway': 'residential', 'motor_vehicle': 'no'}), (2, 2))
        self.assertEqual(network.masks({'highway': 'footway', 'foot': 'no'}), (0, 0))
        self.assertEqual(network.masks({'railway': 'rail', 'access': 'private'}), (4, 4))
        self.assertEqual(network.masks({'railway': 'narrow_gauge', 'gauge': '914', 'usage': 'tourism'}), (4, 4))
        self.assertEqual(network.masks({'railway': 'rail', 'service': 'yard'}), (0, 0))
        self.assertEqual(network.masks({'railway': 'abandoned'}), (0, 0))

    def test_preserves_bends_and_does_not_bridge_missing_nodes(self):
        graph = network.Graph()
        coords = {1: [0, 0], 2: [.001, .001], 3: [.002, 0], 5: [.004, 0]}
        graph.add_way([1, 2, 3, 4, 5], {'highway': 'path'}, coords)
        self.assertEqual(graph.nodes, [[0, 0], [.001, .001], [.002, 0]])
        self.assertEqual(len(graph.export_edges()), 4)
        self.assertAlmostEqual(graph.export_edges()[0][2], 157.25, delta=.1)

    def test_combines_access_masks_without_erasing_tunnel_flag(self):
        graph = network.Graph()
        coords = {1: [0, 0], 2: [.001, 0]}
        graph.add_way([1, 2], {'highway': 'footway', 'tunnel': 'yes'}, coords)
        graph.add_way([1, 2], {'highway': 'service', 'tunnel': 'yes'}, coords)
        self.assertEqual(graph.export_edges(), [[0, 1, 111.19, 3, 1], [1, 0, 111.19, 3, 1]])


if __name__ == '__main__':
    unittest.main()
