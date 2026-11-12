# Cusco city and Velasco Astete Airport expansion

This is a frozen, bounded GIS asset pack for the RELIEF Living World application. It does not contain application-code changes. All processing occurred outside the checkout.

## Integration

Merge `public/world/` into the app's `public/world/`. Replace **only** the existing manifest area with `id: "cusco"` using `public/world/cusco-area-patch.json`. Keep every other manifest area and source intact. The city expands from nine to 24 tiles: valley-grid columns 7–12 and rows 12–15, approximately 12 × 8 km. Fifteen tiles are new. Existing terrain, cover and halos are byte-identical; existing Cusco feature tiles intentionally gain fuller building coverage.

The intended rendered scope includes the historic centre, Sacsayhuamán, Wanchaq, the operational airport, San Sebastián and the connected eastern urban corridor. Full San Jerónimo and the farther metropolitan fringe remain outside this bounded pass. Outer row 15 and column 12 use `detail: "light"`; the central city and airport use full detail.

`airport-place.json` contains a sourced airport pin, exact terminal feature ID, and a broad camera framing. `copy-manifest.json` records exact changed/new paths, sizes and hashes. No previous reference build is changed by this pack.

## Source data and geographic meaning

- **Terrain:** original Mapzen Terrain Tiles at zoom 13, bilinear source-pixel interpolation, 129 × 129 samples per tile. Display spacing is approximately 15.6 m; it is not a survey-accuracy claim. New edges exactly match adjacent old/new grids.
- **Ground categories:** ESA WorldCover 2021 v200, native approximately 10 m sampling, 200 × 200 core samples plus an eight-pixel halo. CC BY 4.0. Material blending does not change these source categories.
- **OSM:** Geofabrik Peru extract dated 2026-09-03, ODbL 1.0. Full mapped footprints remain whole and are assigned to exactly one owner tile. Roads and other linear/surface features are clipped at tile boundaries. Only selected public descriptive tags are retained; contacts, addresses, mapper identities and private metadata are excluded.
- **Microsoft footprints:** Global ML Building Footprints release 2026-08-13, quadkey 210031023, CDLA Permissive 2.0. Of 76,626 bounded predictions, 1,691 intersect mapped open-space/archaeological/airport/construction areas and 33,851 overlap authoritative OSM footprints. The 41,084 remaining predictions dissolve into 36,767 non-overlapping footprint groups. Their exact combined ground coverage is retained; inferred internal divisions are not invented. Groups retain `sourceIds`. Unmapped heights/materials remain illustrative; if source height estimates vary within a group, the maximum estimate is explicitly identified.
- **Canopy:** Meta/WRI CHMv2, CC BY 4.0. Source observation dates and coverage are in `cusco/canopy-coverage.json`. Individual crowns are deterministically inferred within detected positive canopy; tree identity/species is illustrative. Placement excludes mapped buildings, roads, paths, water, airport surfaces, construction and existing mapped trees.

The previous city boundary and sparse central OSM footprints both contributed to the empty appearance. For example, central tile g8_13 contains 1,819 OSM footprints and substantial non-overlapping Microsoft coverage. These sources improve coverage; they do not prove a complete current building census. Mapped plazas, parks, fields, airport grounds and archaeological compounds are protected from machine-predicted additions.

## Operational airport

This is **Alejandro Velasco Astete Airport (CUZ / SPZO)**, inside Cusco. It is separate from Chinchero's construction compound. MTC's 22 January 2026 report describes current Cusco terminal/runway rehabilitation while the future Chinchero airport is being completed:

https://www.gob.pe/institucion/mtc/noticias/1339115-mtc-y-corpac-impulsan-la-rehabilitacion-del-aeropuerto-internacional-del-cusco

- Aerodrome boundary: OSM way/614956903, entirely inside the expanded tile envelope.
- Runway 10/28: way/4818929, actual mapped centre line, `width: 45` and `length: 3400` metres, asphalt.
- Eighteen mapped taxiway centre lines. Their widths are **not mapped** in this extract. Any filled display width is illustrative.
- Two mapped apron polygons: ways 4818963 and 447913430. Terrain-draping surface meshes partition their exact source outlines.
- Terminal: way/4818980, actual footprint, mapped height 8 m, two levels, concrete wall/roof materials and mapped colors. Its public airport-terminal label derives from the containing aerodrome and mapped terminal role; the footprint has no mapped name of its own.
- Four mapped jet-bridge footways remain source context; no invented surveyed bridge heights or airport interior geometry are supplied.

Runway, taxiway and apron features use **`kind: "aeroway"`** with `aeroway`, `ref`, `width`, `length`, `surface` fields only where mapped. They are separate from drivable roads. Do not populate them with ordinary road vehicles.

## Validation and reproducibility

Run `scripts/test_cusco.py` for focused synthetic regressions. `scripts/audit-cusco.py` audits real prepared assets for exact tile edges/halo centres, preserved old grids, complete-feature ownership, footprint deduplication, mapped open-space preservation, canopy exclusions, airport identity/dimensions, and source-polygon mesh coverage/winding. See `public/world/cusco-validation-report.json` for final results.

Preparation steps use `/private/tmp/relief-gis/bin/python`:

1. `scripts/prepare-cusco.py base`
2. `scripts/prepare-cusco.py osm`
3. `scripts/prepare-cusco.py canopy`
4. `scripts/prepare-cusco-features.py microsoft`
5. `scripts/prepare-cusco-features.py features`
6. `scripts/audit-cusco.py`

The original public inputs are reused from read-only caches at `/private/tmp/relief-layer-cache`, `/private/tmp/relief-world-cache` and `/private/tmp/relief-tiles`. Existing canopy crops are copied from the frozen prior expansion cache before any new range reads. Only the new staging directory is written.

The `source-extract.json` and `microsoft-source-extract.json` files are provenance downloads, not initial runtime fetches. Runtime loads selected grid assets only. This expansion has substantially more city geometry; camera-distance culling and coarse distant building representations remain important.
