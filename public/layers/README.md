# RELIEF geographic layers

These are bundled, offline map layers for the Sacred Valley and Machu Picchu. No live geographic service is used by the application.

## Land cover

Source: **ESA WorldCover 2021 v200**, 10 m categorical source imagery. The bundled class grids are resampled with nearest-neighbour selection to a 1024 × 1024 regional grid and a 513 × 513 Machu Picchu grid. Display grid spacing is not source accuracy. Category codes are unchanged from ESA; colors are art-directed. Each metadata file includes the bounds, original tile URLs, category key and processing description.

© ESA WorldCover project 2021 / Contains modified Copernicus Sentinel data (2021) processed by ESA WorldCover consortium.

Licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). [Data access and citation](https://esa-worldcover.org/en/data-access). [Dataset DOI](https://doi.org/10.5281/zenodo.7254221).

## Rivers, lakes and settlements

© OpenStreetMap contributors. Source snapshot: [Geofabrik Peru, 3 September 2026](https://download.geofabrik.de/south-america/peru-260903.osm.pbf). The regional extracts and derivative GeoJSON are available under [ODbL 1.0](https://opendatacommons.org/licenses/odbl/1-0/).

The `*-osm-source.json` files contain unsimplified extracted feature geometry and tags (invalid polygon topology repaired when needed) for the geographic subset used in each region. The `*-features.geojson` files clip these features to the terrain bounds and simplify geometry at 0.000025 degrees while preserving topology. These are geographic illustrations, not navigation datasets. River centerlines and water surfaces reflect mapped OSM geometry and may not exactly align with the elevation survey.

## Rebuilding

From the project root, run `python scripts/prepare-layers.py` using an environment installed from `scripts/requirements-geodata.txt` (prepared with Python 3.14). Public source downloads are cached under `/private/tmp/relief-layer-cache`; raw country and satellite source files are not included in the app bundle.
