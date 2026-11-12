"""Measure unblended mesh interpolation differences at the separate Machu grid."""
import importlib.util
import json
from pathlib import Path

import numpy as np

spec = importlib.util.spec_from_file_location('corridor', Path(__file__).with_name('prepare.py'))
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)


def sample(tile, lon, lat):
    path = m.ROOT / 'public' / tile['terrain']['url'].lstrip('/')
    heights = np.fromfile(path, dtype='<f4').reshape(129, 129)
    west, south, east, north = tile['bounds']
    x = np.clip((lon - west) / (east - west) * 128, 0, 128)
    y = np.clip((north - lat) / (north - south) * 128, 0, 128)
    ix, iy = np.minimum(127, x.astype(int)), np.minimum(127, y.astype(int))
    fx, fy = x - ix, y - iy
    return ((heights[iy, ix] * (1 - fx) + heights[iy, ix + 1] * fx) * (1 - fy)
            + (heights[iy + 1, ix] * (1 - fx) + heights[iy + 1, ix + 1] * fx) * fy)


def audit():
    reports = []
    machu = next(area for area in m.CURRENT['areas'] if area['id'] == 'machu')
    for tile in m.new_tiles():
        for neighbor in machu['tiles']:
            west, south, east, north = tile['bounds']
            w, s, e, n = neighbor['bounds']
            lon = lat = None
            if (abs(east - w) < 1e-10 or abs(west - e) < 1e-10) and min(north, n) > max(south, s):
                lon = np.full(513, east if abs(east - w) < 1e-10 else west)
                lat = np.linspace(max(south, s), min(north, n), 513)
            if (abs(north - s) < 1e-10 or abs(south - n) < 1e-10) and min(east, e) > max(west, w):
                lat = np.full(513, north if abs(north - s) < 1e-10 else south)
                lon = np.linspace(max(west, w), min(east, e), 513)
            if lon is not None:
                difference = float(np.max(np.abs(sample(tile, lon, lat) - sample(neighbor, lon, lat))))
                reports.append({'corridorTile': tile['id'], 'machuTile': neighbor['id'],
                                'maximumUnblendedMeshDifferenceMeters': difference})
    return reports


if __name__ == '__main__':
    print(json.dumps(audit(), indent=2))
