"""Stage an aligned Cusco city and operational airport expansion; no app writes."""
import argparse
import copy
import importlib.util
import json
import shutil
from pathlib import Path

import numpy as np

STAGE = Path('/private/tmp/relief-cusco-expansion')
CHECKOUT = Path(__file__).resolve().parents[2]
FROZEN = Path('/private/tmp/relief-expansion')
spec = importlib.util.spec_from_file_location('expansion', Path(__file__).with_name('prepare-expansion.py'))
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)
CURRENT = json.loads((CHECKOUT / 'public/world/manifest.json').read_text())


def manifest():
    data = copy.deepcopy(CURRENT)
    existing = {t['terrain']['url']: t for a in data['areas'] for t in a['tiles']}
    tiles = []
    for row in range(12, 16):
        for col in range(7, 13):
            prefix = f'/world/grid/g{col}_{row}'
            url = prefix + '-terrain.bin'
            tile = copy.deepcopy(existing.get(url, {
                'id': f'g{col}_{row}', 'col': col, 'row': row,
                'grid': 'valley', 'areaId': 'cusco', 'bounds': m.tile_bounds(col, row),
                'terrain': {'url': url, 'n': 129},
                'landcover': {'url': prefix + '-landcover.bin', 'n': 200,
                              'haloUrl': prefix + '-landcover-halo.bin'},
                'features': prefix + '-features.json',
            }))
            tile['detail'] = 'full' if col <= 11 and row <= 14 else 'light'
            tiles.append(tile)
    area = {'id': 'cusco', 'name': 'Cusco, Sacsayhuamán and Velasco Astete Airport',
            'center': [-71.962, -13.525],
            'bounds': [tiles[0]['bounds'][0], tiles[-1]['bounds'][1],
                       tiles[-1]['bounds'][2], tiles[0]['bounds'][3]],
            'detail': 'full', 'tiles': tiles, 'context': '/world/cusco/context.geojson'}
    # Reused helpers operate only on Cusco; the deliverable is an area patch.
    data['areas'] = [a for a in data['areas'] if a['id'] in ['urubamba', 'machu']] + [area]
    return data


m.manifest = manifest


def base_assets():
    source_tiles = {}
    data = manifest()
    for tile in data['areas'][-1]['tiles']:
        paths = [tile['terrain']['url'], tile['landcover']['url'], tile['landcover']['haloUrl']]
        if (CHECKOUT / 'public' / paths[0].lstrip('/')).exists():
            for url in paths:
                out = m.local_path(url)
                out.parent.mkdir(parents=True, exist_ok=True)
                shutil.copyfile(CHECKOUT / 'public' / url.lstrip('/'), out)
            print(tile['id'], 'reused exact terrain and cover', flush=True)
            continue
        bounds = tile['bounds']
        terrain = m.base.terrain_grid(bounds, 129, source_tiles)
        cover = m.base.landcover_grid(bounds, 200)
        dx, dy = (bounds[2] - bounds[0]) * .04, (bounds[3] - bounds[1]) * .04
        halo = m.base.landcover_grid([bounds[0] - dx, bounds[1] - dy, bounds[2] + dx, bounds[3] + dy], 216)
        halo[8:208, 8:208] = cover
        for url, value in zip(paths, [terrain, cover, halo]):
            m.local_path(url).write_bytes(value.tobytes())
        print(tile['id'], 'sampled original DEM and cover', float(np.min(terrain)), float(np.max(terrain)), flush=True)
    m.write_json(m.OUTPUT / 'cusco-area-patch.json', data['areas'][-1])


def canopy_assets():
    for source in (FROZEN / 'cache').glob('canopy-*'):
        # All existing source crops are read-only inputs copied into this run.
        if source.name.startswith('canopy-g') and not any(source.name.startswith(f"canopy-{t['id']}.") or source.name.startswith(f"canopy-{t['id']}-") for t in manifest()['areas'][-1]['tiles']):
            continue
        if source.suffix in ['.npy', '.tif', '.geojson']:
            shutil.copyfile(source, m.CACHE / source.name)
    m.canopy_assets()


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('step', choices=['base', 'osm', 'canopy'])
    args = parser.parse_args()
    {'base': base_assets, 'osm': m.extract_osm, 'canopy': canopy_assets}[args.step]()
