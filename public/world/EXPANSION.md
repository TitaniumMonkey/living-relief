# RELIEF expansion asset pack

Prepared locally on 2026-09-05. The application checkout was read-only throughout preparation.

## Integration

Merge `public/world/` from this staging directory into the app's `public/world/` without deleting existing files. The new manifest references both original areas and nine added areas. Original Urubamba/Machu terrain, categorical cover, features and source extracts are not included or replaced; only their new halo files are supplied.

Keep the four scripts in this staging directory for reproducibility. `prepare-expansion.py` runs `base`, `osm`, `canopy`, then `features`; it imports `prepare-world-base.py`. All script outputs remain under `/private/tmp/relief-expansion`. The pipeline reads the fixed local GIS caches and only the canopy step needs bounded public COG requests. Do not copy the cache into the app.

## Asset contract

- 59 unique physical tiles: 18 preserved, 41 added. Deduplicate by `terrain.url`.
- Exact Urubamba-aligned valley grid; distant Machu retains its separate grid. Tiles include `col`, `row`, `grid`, `areaId`, and `detail`. Full detail: maras, cusco, chinchero, ollanta, pisac. Light detail: yucay, huayllabamba, calca, lamay.
- Terrain: little-endian Float32, 129² endpoint samples, north to south. Direct bilinear sampling of Mapzen zoom 13, including source-tile edges. Approximate 15.6 m display spacing is not survey accuracy.
- Land cover: Uint8 200² cell-centre categories from ESA WorldCover 2021's original approximately 10 m product. `haloUrl` contains 216² categories with an 8-pixel halo. Its central 200² samples exactly equal the original tile.
- Features: original GeoJSON footprint geometry. Complete buildings, trees and ruin structures are assigned once by representative point. Linear and area layers are clipped at tile boundaries. Split line counts are tile parts, not distinct source objects.
- `surfaceGrid` is top-level on saltpan/airfield features: `{vertices: [longitude,latitude][], indices: number[], spacingMeters: 15}`. Triangles face upward in east/up/south world coordinates. These are display partitions of source polygons, not mapped ponds or runways.
- Building metadata includes source tags plus flat `name`, `amenity`, `tourism`, `historic`, `wikidata`, `wikipedia`, `roofColor`, `roofMaterial`, `wallColor`, and `wallMaterial` when available. 741 footprints gained public POI details only through actual point containment. Multiple POIs are retained in `containedPois`; no nearest-building guessing. There are 795 named rendered buildings.

## Added coverage

| Area ID | Buildings | Trees | Ruin features | Terrace parts |
| --- | ---: | ---: | ---: | ---: |
| maras | 1,463 | 2,138 | 16 | 37 |
| cusco | 9,663 | 24,374 | 172 | 30 |
| chinchero | 7,215 | 12,403 | 17 | 70 |
| ollanta | 633 | 9,016 | 20 | 186 |
| pisac | 3,076 | 7,305 | 16 | 119 |
| yucay | 1,634 | 1,098 | 14 | 29 |
| huayllabamba | 826 | 1,270 | 0 | 2 |
| calca | 3,236 | 2,031 | 0 | 1 |
| lamay | 1,090 | 828 | 0 | 0 |

Total: 28,836 buildings (25,634 OSM and 3,202 Microsoft), 60,463 trees (59,843 inferred canopy crowns and 620 mapped trees), 255 ruin features and 474 terrace parts. The added source/runtime pack is about 49 MiB uncompressed; runtime feature tiles are at most 1.69 MiB. Only locally needed runtime tiles need loading; source extracts are attribution/audit assets.

## Source limits

Moray includes 31 mapped retaining-wall lines intersecting its main archaeological boundary and 36 nearby ring/terrace lines overall. Sacsayhuamán's boundary intersects 163 mapped wall lines, 3 retaining-wall lines and 1 explicit ruin. Wall portions inside archaeological boundaries are used as ruin geometry; the source extracts preserve original wall tags. Wall heights and stone forms are illustrative unless tagged.

Salineras (`way/66568490`) is an actual mapped quarry/compound polygon; no individual salt-pan outlines are present. Its source terrain spans roughly 2,909–3,014 m, with median sampled slope 21.7° and 90th percentile 30.0°. Surface material partitions must remain illustrative. Chinchero airport (`way/977105475`) is mapped construction ground; no operational runway geometry is present. The older source DEM spans roughly 3,679–3,765 m there and does not resolve current earthworks. Both original source polygons are retained separately from their render meshes.

Calca's selected cell has only 35 intersecting OSM buildings (34 owned by the cell); 3,202 non-overlapping Microsoft footprints fill that specific gap, with 60 overlapping candidates omitted in favor of OSM. No machine footprints were added within archaeological or construction compounds. The Microsoft candidate extract is retained separately.

Canopy imagery dates range from 2016-08-05 to 2019-09-18. Observation coverage is effectively complete in every added tile (minimum fraction 0.999999696). Positive source canopy height guides candidate positions; selected crown centres and tree shapes/species remain inferred. Crowns are excluded from mapped buildings, ruins, roads, paths, water, salt works, construction ground and mapped-tree buffers. Heights/levels, roofs and material tags are sparse: source building heights exist on 39 records, levels on 53, and roof shape on 5. Do not present default building forms as surveyed.

The country OSM parser encountered 39 unassemblable area records; this does not establish 39 gaps inside the bounded areas. Coverage is not claimed exhaustive. Buildings at an outer boundary whose representative point lies outside the detailed footprint are intentionally omitted from the runtime tile.

## Provenance and redistribution

- Terrain: [Mapzen Terrain Tiles](https://registry.opendata.aws/terrain-tiles/), zoom 13 Terrarium. Retain the existing app's per-source terrain attribution; original observation dates and accuracy vary.
- Land cover: [ESA WorldCover 2021 v200](https://esa-worldcover.org/en/data-access), CC BY 4.0. Attribution: © ESA WorldCover project 2021 / Contains modified Copernicus Sentinel data (2021) processed by ESA WorldCover consortium.
- Vector geography: © OpenStreetMap contributors, [ODbL 1.0](https://www.openstreetmap.org/copyright), fixed [Geofabrik Peru 2026-09-03 extract](https://download.geofabrik.de/south-america/peru-260903.osm.pbf). Per-area source extracts retain the bounded source geometry and public descriptive tags. Addresses, contact data and mapper identities are excluded.
- Calca supplement: [Microsoft Global ML Building Footprints](https://github.com/microsoft/GlobalMLBuildingFootprints), 2026-08-13 release, CDLA Permissive 2.0. Keep the existing `CDLA-Permissive-2.0.txt`. Selected source URL and release metadata are in `calca/microsoft-source-extract.json` and `expansion-report.json`.
- Canopy: [Meta and WRI CHMv2](https://registry.opendata.aws/dataforgood-fb-forestsv2/), 2026 release, CC BY 4.0; source imagery © Vantor, with actual observation dates in `canopy-coverage.json`. Global source quadkeys 2100310230 and 2100310231; COG/metadata URLs are in `canopy-sources.json`.

## Verification

Six synthetic tests cover negative-index tile alignment, POI containment/courtyards, multiple-POI identity, public-tag filtering, footprint deduplication and terrain-facing mesh coverage with a hole. `audit-expansion.py` verifies the actual staged pack: all 59 halo centres match exactly, 74 shared terrain edges match exactly, terrain is finite, no terrain tile interiors overlap, complete structures are unique, canopy exclusion collisions are zero, Microsoft/OSM building overlaps are zero, and surface mesh coverage matches its valid source footprint. The audit also checks upward winding. See `validation-report.json`, `expansion-report.json` and `landmark-coverage.json`.
