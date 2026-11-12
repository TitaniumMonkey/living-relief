# Offline railway corridor

Builds original-source terrain, classification, mapped objects and canopy-guided vegetation for the full 3.2 km buffer around the bundled Ollantaytambo–Aguas Calientes railway. Existing town assets are inputs and are never replaced.

Use a temporary Python environment with `numpy rasterio shapely requests osmium`. Download the dated public Geofabrik Peru PBF to `/private/tmp/relief-layer-cache/peru.osm.pbf`. No accounts, keys, paid services or runtime source requests are used.

Run `prepare.py base`, `prepare.py canopy`, `prepare.py osm`, then `prepare.py features`. Sources and staged outputs are under `/private/tmp/relief-rail-corridor`; the source elevation PNG cache is `/private/tmp/relief-tiles`. Run `python -m unittest discover -s scripts/rail-corridor -p test_corridor.py` before copying staged `public/world/grid` and `public/world/rail-corridor` assets into the app. Append the staged `rail-corridor-area.json` to the manifest without changing existing areas.

Full 2 km tiles use the existing Urubamba grid. Rectangular fringe tiles stop exactly at the separate Machu grid boundary. The complete buffer, nonoverlap, original elevation shared edges, exact classification halos, footprint source identity and canopy exclusions are tested. Only nearby tiles are fetched by the existing renderer.

Survey accuracy does not improve merely because a mesh is denser: 129² samples per 2 km tile give roughly 15.6 m display spacing from original Mapzen zoom 13 source elevations. WorldCover categories use the 2021 10 m product. Building footprints are OSM; untagged heights and roof forms remain illustrative. Trees use measured CHMv2 canopy support and heights; individual crowns and species are inferred. Sparse OSM coverage stays sparse rather than being filled with invented buildings. Source dates, coverage and counts are bundled with the corridor.

Two untagged OSM footprints that cross the mapped railway are retained in the source extract and omitted from rendering; report.json records their IDs. The unblended Machu fringe mesh audit is in mesh-boundary-audit.json. Different nonaligned vertex sampling produces up to 3.36 m interpolation mismatch before renderer seam treatment; this is a display mesh issue, not a source terrain change. The actual renderer audit found a 2.813 m gap before shared boundary breakpoints and 0.0002303 m after the repair. See display-boundary-audit.json; the 19 audited High patches use 9.8% more vertices. The synthetic renderer regression covers all three detail levels and verifies source arrays remain unchanged.
