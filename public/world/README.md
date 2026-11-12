# Living World geographic assets

Two approximately 6 × 6 km areas contain local, attributed terrain, land cover,
buildings, roads, paths, water, farmland, archaeological structures, and canopy
samples. Each area has nine approximately 2 km tiles. Runtime uses only bundled
files; preparing the files requires public data downloads, but the app requires
no API key, subscription, or live map service.

## Data and attribution

| Data                    | Source and date                                                                                                                                                                        | License                                                                                  |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Elevation               | [Mapzen Terrain Tiles](https://registry.opendata.aws/terrain-tiles/), zoom 13, accessed September 5, 2026                                                                              | [Provider attribution](https://github.com/tilezen/joerd/blob/master/docs/attribution.md) |
| Land cover              | [ESA WorldCover 2021 v200](https://esa-worldcover.org/en/data-access)                                                                                                                  | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)                                |
| Geographic features     | © [OpenStreetMap contributors](https://www.openstreetmap.org/copyright); [Geofabrik Peru snapshot, September 3, 2026](https://download.geofabrik.de/south-america/peru-260903.osm.pbf) | ODbL 1.0                                                                                 |
| Supplemental footprints | [Microsoft Global ML Building Footprints](https://github.com/microsoft/GlobalMLBuildingFootprints), August 13, 2026 release                                                            | [CDLA Permissive 2.0](./CDLA-Permissive-2.0.txt)                                         |
| Canopy                  | [Meta and WRI CHMv2](https://registry.opendata.aws/dataforgood-fb-forestsv2/), 2026 release; Urubamba source imagery September 18, 2019; Machu source imagery May 30, 2018             | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)                                |

Terrain: SRTM and GMTED2010 data courtesy of the U.S. Geological Survey; global
ETOPO1 data from U.S. NOAA, supplied through Mapzen Terrain Tiles.

Land cover: © ESA WorldCover project 2021 / Contains modified Copernicus Sentinel
data (2021) processed by ESA WorldCover consortium.

Canopy: Meta and World Resources Institute (WRI), 2026, Version 2 High Resolution
Canopy Height Maps (CHMv2). Source imagery © Vantor. Accessed September 5, 2026.
These files derive local crown candidates from the released canopy-height data;
they contain no satellite imagery.

The selected upstream URLs appear in [source-details.json](./source-details.json).
The OSM-derived geographic extracts are available in
[Urubamba source extract](./urubamba/source-extract.json) and
[Machu source extract](./machu/source-extract.json). These retain geographic tags
used by the model, without OSM author, contact, or address fields. The OSM-derived
database portions and modifications remain available under ODbL 1.0.

## Representation and limits

- Terrain contains 129 × 129 little-endian Float32 metre samples per tile,
  north to south, including shared edge samples. Approximately 15.6 m sample
  spacing describes the display grid, not the accuracy of the underlying DEM.
  Bilinear interpolation reads original zoom-13 pixels across source tile edges.
- Land cover contains 200 × 200 Uint8 category samples per tile, north to south
  at cell centres. The approximately 10 m spacing retains the source product's
  scale. Categorical values use nearest-neighbour sampling, never invented
  intermediate categories. Natural material blending belongs to the renderer.
- Buildings use actual OSM or machine-detected Microsoft footprints. Microsoft
  shapes with any positive-area OSM building overlap are removed. OSM wins;
  adjacent non-overlapping structures remain. Unknown Microsoft height `-1` is
  omitted. Unmapped heights, roof forms, and surface appearance are illustrative.
- Broad archaeological-site boundaries are retained as source context only.
  Visible ruins come from mapped ruin footprints and mapped walls. Retaining
  walls inside mapped archaeological boundaries supply terrace geometry. This
  preserves present-day mapped shapes without reconstructing an inhabited site.
  Inside the mapped Ciudadela de Machu Picchu core, generic `building=yes`
  footprints without a specific building type are omitted from the rendered
  model rather than given unsupported modern massing. They remain in the source
  extract and are not reclassified as ruins. Explicit civic buildings and open
  roof shelters remain; `building=roof` is preserved for open shelter rendering.
- CHMv2 canopy heights guide inferred crown centres. Candidate locations sample
  positive canopy at approximately 6 m spacing and are thinned deterministically
  to a minimum approximately 12 m separation. Buildings, roads, paths, water,
  and mapped trees exclude conflicting inferred crowns. WorldCover built areas,
  snow, and water also exclude inferred crowns. Mapped OSM trees are retained.
  This is a spaced rendering sample, not an inventory of individual trees; tree
  species, crown geometry, and unrecorded heights are illustrative. The canopy
  observation dates differ from the OSM snapshot and do not represent live growth.
- Complete buildings, ruins, and tree points belong to one tile. Their full
  footprints may cross that tile edge. Linear and land-use overlays are clipped
  to tile bounds; neighbouring tiles share their edge coordinates.
- Animated life, weather, and lighting are scenery. None of these assets indicate
  observed people, vehicles, animals, current weather, or a trip itinerary.

[processing-report.json](./processing-report.json) records counts, duplicate
removal, canopy exclusions, and archaeological boundary coverage. The upstream
country snapshot contains unassemblable polygon areas, recorded in source
details; no replacement shapes are invented.

## Reproduce

Use the GIS packages in `scripts/requirements-layers.txt`. The V2 preparation
scripts populate the external caches for original Mapzen PNGs, ESA GeoTIFFs,
and the fixed Geofabrik PBF. Living World preparation then runs in this order:

```sh
python scripts/prepare-world.py base
python scripts/prepare-world.py download
python scripts/prepare-world.py osm
python scripts/prepare-world.py canopy
python scripts/prepare-world.py features
python scripts/world-geodata.test.py
node --test scripts/world-assets.test.mjs
```

`base` writes real terrain and land cover first so renderer development can begin.
`download` caches the selected Microsoft quadkeys and records CHMv2 source URLs.
`canopy` reads bounded windows from the public cloud-optimized rasters and keeps
the original observation-date metadata. `features` creates the final geographic
tile files and source extracts. Re-running `base` preserves existing feature files.

## Shared Peru expansion

The active manifest now includes nine additional areas on a shared tile grid. See [EXPANSION.md](EXPANSION.md) for coverage, source dates, licenses, limits and validation. Existing Urubamba and Machu terrain and vector data remain intact.
