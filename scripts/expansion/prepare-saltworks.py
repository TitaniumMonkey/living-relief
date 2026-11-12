"""Prepare illustrative pond geometry inside the mapped Maras compound.

Individual ponds are not a survey. The OSM compound and source DEM constrain
their extent and general slope; shared jittered cells provide repeatable basins.
"""
import json
import math
from pathlib import Path

import numpy as np
from shapely import affinity
from shapely.geometry import Polygon, shape
from shapely.ops import transform


def polygon_parts(geometry):
    if geometry.geom_type == 'Polygon':
        return [geometry]
    return [p for p in geometry.geoms if p.geom_type == 'Polygon']


def pond_cells(boundary, angle=0):
    """Return disjoint, inset basins clipped to the source, including holes."""
    center = boundary.centroid
    domain = affinity.rotate(boundary, -angle, origin=center, use_radians=True)
    west, south, east, north = domain.bounds
    width, depth = 7.2, 4.8

    def corner(col, row):
        # Shared corners keep neighboring cells contiguous before the inset.
        x = (col + math.sin(col * 113.1 + row * 71.7) * .16) * width
        y = (row + math.sin(col * 31.3 + row * 151.7) * .15) * depth
        return (x, y)

    result = []
    for row in range(math.floor(south / depth) - 1, math.ceil(north / depth) + 1):
        for col in range(math.floor(west / width) - 1, math.ceil(east / width) + 1):
            cell = Polygon([corner(col, row), corner(col + 1, row),
                            corner(col + 1, row + 1), corner(col, row + 1)])
            clipped = cell.intersection(domain).buffer(-.08, join_style=2)
            if clipped.is_empty:
                continue
            for footprint in polygon_parts(clipped):
                pool = footprint.buffer(-.24, join_style=2)
                if footprint.area < 5 or pool.is_empty:
                    continue
                rotate = lambda g: affinity.rotate(g, angle, origin=center, use_radians=True)
                result.append((rotate(footprint), rotate(pool),
                               rotate(footprint.difference(pool))))
    return result


def prepare(root):
    manifest = json.loads((root / 'world/manifest.json').read_text())
    seen = set()
    for area in manifest['areas']:
        for tile in area['tiles']:
            path = root / tile['features'].lstrip('/')
            if path in seen:
                continue
            seen.add(path)
            collection = json.loads(path.read_text())
            changed = False
            for feature in collection['features']:
                if feature['properties']['kind'] != 'saltpan':
                    continue
                geographic = shape(feature['geometry'])
                lon0, lat0 = geographic.centroid.coords[0]
                scale_x = 111320 * math.cos(math.radians(lat0))
                forward = lambda x, y: ((np.asarray(x) - lon0) * scale_x,
                                        (np.asarray(y) - lat0) * 111320)
                inverse = lambda x, y: (np.asarray(x) / scale_x + lon0,
                                        np.asarray(y) / 111320 + lat0)
                boundary = transform(forward, geographic)
                west, south, east, north = tile['bounds']
                n = tile['terrain']['n']
                dem = np.fromfile(root / tile['terrain']['url'].lstrip('/'), dtype='<f4').reshape(n, n)
                points = np.asarray(boundary.exterior.coords)
                samples = []
                for x, y in points:
                    lon, lat = inverse(x, y)
                    xx = (lon - west) / (east - west) * (n - 1)
                    yy = (north - lat) / (north - south) * (n - 1)
                    ix, iy = min(n - 2, int(xx)), min(n - 2, int(yy))
                    fx, fy = xx - ix, yy - iy
                    samples.append((dem[iy, ix] * (1-fx) + dem[iy, ix+1] * fx) * (1-fy)
                                   + (dem[iy+1, ix] * (1-fx) + dem[iy+1, ix+1] * fx) * fy)
                centered = points - points.mean(axis=0)
                slope = np.linalg.lstsq(np.column_stack([centered, np.ones(len(points))]),
                                       np.asarray(samples), rcond=None)[0]
                angle = math.atan2(slope[1], slope[0]) + math.pi / 2

                def rings(p):
                    geographic = transform(inverse, p)
                    return [[[round(x, 9), round(y, 9)] for x, y in r.coords]
                            for r in [geographic.exterior, *geographic.interiors]]

                basins = []
                for footprint, pool, rim in pond_cells(boundary, angle):
                    basins.append({'footprint': rings(footprint),
                                   'pools': [rings(p) for p in polygon_parts(pool)],
                                   'rims': [rings(p) for p in polygon_parts(rim)]})
                feature['inferredBasins'] = basins
                feature['properties']['pondLayout'] = 'Illustrative geometry within the mapped compound; not surveyed individual ponds.'
                changed = True
                print(f'{feature["id"]}: {len(basins)} illustrative 3D basins')
            if changed:
                path.write_text(json.dumps(collection, separators=(',', ':'), ensure_ascii=False))


if __name__ == '__main__':
    prepare(Path(__file__).resolve().parents[2] / 'public')
