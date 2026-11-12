# Living Relief

An interactive collection of sculpted landscapes, opening in Peru’s Sacred Valley. Switch between a measured relief atlas and a cinematic Living World with mapped buildings, canopy-guided trees, agricultural surroundings, and illustrative activity. React, Three.js, and Vinext produce a fully static app. No database, runtime map subscription, API key, or live Overpass service is needed.

**RELIEF V3 adds a seated rail journey, smooth navigation, and leaner Living World rendering.**

## Run locally

Use Node 22.13+ (validated with Node 26.7.0).

- `npm install`
- `npm run dev -- --host 127.0.0.1 --port 4317`
- `npm run build` generates `dist/client`.
- `npm start` serves the production preview at http://127.0.0.1:4318/.

## Living World

The mode switch keeps Relief available and enables Living World for the Peru regions. Sacred Valley and Machu Picchu share one continuous Peru World. Their collection buttons retain separate measurement grids and camera shortcuts without rebuilding the scene. Detailed areas include Urubamba, Machu Picchu/Aguas Calientes, Maras/Moray/Salineras, Cusco/Sacsayhuamán and Alejandro Velasco Astete Airport, Chinchero, Ollantaytambo, and Pisac. Yucay, Huayllabamba, Calca, and Lamay have smaller areas. The fly-to menu includes nearby place markers; detailed coverage is bounded by the world manifest. Camera clearance is approximately 30 m above terrain or mapped buildings. No walking controls or building interiors are included; the rail journey has an illustrative passenger cabin.

Buildings, ruins, trees, ground vegetation, animals and birds, people, and vehicles have independent toggles. Buildings follow mapped footprints; missing heights and roof forms are illustrative. Tree placement is inferred from dated canopy coverage and heights, not an exact inventory of trunks or species. Activity is decorative and sparse; vehicles and walkers follow appropriate mapped routes near the camera. Pause world freezes activity; Resume world restarts it.

Living World ground blends natural materials over original 10 m WorldCover classes. The blocky classification display has been removed; its categories remain internal inputs for ground and vegetation. Nearby terrain uses tiled elevations from Mapzen source tiles, not an enlarged copy of the regional grid. Display sampling and modeled detail do not imply survey accuracy. Measurements retain the original source-grid interface.

Use a time slider or Dawn / Day / Dusk / Night presets, Clear / Cloudy / Valley mist / Rain weather, and an independent Clouds toggle. Soft world-positioned cloud banks remain visible from aerial views. A day/night cycle runs over four minutes when enabled. Pause world freezes autonomous motion; reduced motion also disables animation. Conditions are controllable scenery, not current conditions or a forecast. World mode uses true vertical proportions; returning to Relief restores its visual settings and geographic focus.

Data comes from the fixed OSM snapshot, Microsoft Global ML Building Footprints, ESA WorldCover 2021, and Meta/WRI CHMv2. The bounded world manifest records coverage, source URLs, licenses, dates, and limitations. Rendering loads nearby assets rather than contacting these providers at runtime.

The sanctuary uses actual mapped ruin footprints and retaining-wall lines. Wall heights, masonry, and 2.4 m tread cross-sections are illustrative; there is no archaeological elevation survey in this bundle. Ambiguous generic building footprints inside the curated sanctuary core remain in the source extract but are omitted from display. Explicitly mapped modern shelters and civic buildings remain. The canopy observations date to September 2019 around Urubamba and May 2018 around Machu Picchu; the CHMv2 release is 2026. These sources do not represent live conditions. Full attribution, redistribution terms, and reproducible preparation commands are in `public/world/README.md`.


## Explore

Drag to pan, scroll to zoom toward the cursor, and right-drag or Shift-drag to orbit. On the focused canvas, WASD and arrow keys pan; Shift + arrows orbit/tilt, + / - zoom, and Home resets. The navigation rail adds zoom buttons, north reset, and 2D/3D tilt without moving the geographic focus. Gallery mode hides the panels; Escape restores them. The four regions are the Sacred Valley, Machu Picchu, the Wasatch, and Tristan da Cunha.

**Look** controls Atlas, Copper, and Stone materials; contours; vertical exaggeration; light direction; sun height; Dawn, Day, and Dusk; optional atmosphere; and display quality. Dawn at Machu Picchu composes a warm, grazing view with receding mist and a slow orbit. Light and mist are artistic effects, not solar calculations or weather predictions. Reduced motion follows the device preference and can also be enabled in Look. It stops camera animation, orbit, and moving mist.

**Layers** offers water, settlements, curated Inca sites, and individual Living World object controls. Water and settlement labels start enabled. World terrain loads at most 20 nearby unique tiles, with two terrain requests in flight. Shared tile references are deduplicated; distant GPU objects and terrain patches are released. The regional surface fills inactive detailed areas.

**Story** replaces Peru’s pin slideshow with Cusco and Sacsayhuamán, Pisac, Urubamba, Moray, Ollantaytambo, and Machu Picchu. Each chapter includes a composed view and an official source. Use Next/Back or optional autoplay. Manual camera interaction pauses playback. These chapters are an interpretive journey, not an itinerary or a historical route; no connecting trails are invented. Text explains archaeological details that the elevation grid cannot resolve.

**Read the landscape** samples a cross-section between reference places. The line represents geographic context, not a road, railway, trail, or navigation instruction. Pointer and slider scrubbing highlight the measured position. The camera button exports a transparent PNG with active terrain shading, geographic layers, visible labels, and source credits; atmosphere and app panels are excluded.

Named places have photo cards with Wikimedia Commons author/license links; full image dates and licenses are in `public/place-photos/photo-attribution.json`. Building and ruin clicks resolve merged mesh triangles back to their source features. Exact known OSM IDs receive curated descriptions; mapped point landmarks keep separate markers rather than being assigned to unidentified nearby buildings. Unknown building uses stay unknown. All place cards open Google Maps without an API key.

Building colors are stable per feature. Mapped color/material tags override illustrative plaster, brick, terracotta, and metal finishes. Irregular modern footprints and courtyard blocks receive fitted pitched roofs with open courtyards; explicitly mapped flat roofs remain flat. Missing roof geometry is illustrative. Trees use deeper green foliage. Moray and Sacsayhuamán follow mapped wall lines. Salineras contains 2,768 three-dimensional salt basins with level pools, retaining rims and terrain-anchored foundations inside the mapped compound. Individual basin outlines are inferred and illustrative. Chinchero shows its mapped construction boundary on the older source DEM; runway and terminal layouts are not invented. The airport photo dates to May 2023 and its status links to official June 2026 construction reports.

## Terrain and rendering

Sacred Valley uses a 1,025 × 1,025 Float32 grid (~95 m spacing); Machu Picchu uses 513 × 513 (~25–26 m). Both are sampled from Mapzen Terrarium tiles at zoom 13 with bilinear interpolation across tile boundaries. Wasatch and Tristan da Cunha retain their 321 × 321 grids. `node scripts/prepare-terrain.mjs` regenerates the elevation bundle; raw downloads are cached outside the app.

Grid spacing is sampling density, **not survey resolution or vertical accuracy**. Elevations and locations are approximate. Surface normals derive from source elevations; they do not add surveyed detail. Ocean displays flat at zero, while original negative elevations remain in the measurement data.

Measurements always sample the full source grid. Balanced display geometry uses up to 513² samples; High uses up to 1025². Exaggeration and display quality never alter reported elevations or geographic distances. Source-derived normals, ambient occlusion, constrained shadow coverage, and contact shadows improve all four regions. Rendering stops when the view settles, except when optional orbit or animated atmosphere is active. Renderer resources are disposed when regions change.

Elevation sources: [Mapzen Terrain Tiles](https://registry.opendata.aws/terrain-tiles/), [Terrarium encoding](https://github.com/tilezen/joerd/blob/master/docs/formats.md), and [full attribution](https://github.com/tilezen/joerd/blob/master/docs/attribution.md). USGS supplies SRTM, GMTED2010, and 3DEP; NOAA supplies ETOPO1.

## Bundled geographic data

`public/layers` contains bounded Peru manifests, processed categorical rasters, terrain-draped GeoJSON, and the clipped OSM source extracts. `scripts/prepare-layers.py` and its pinned `scripts/requirements-layers.txt` regenerate these assets. See `public/layers/README.md` for source dates, processing, coverage, and limitations.

- **ESA WorldCover 2021 v200:** © ESA WorldCover project 2021 / Contains modified Copernicus Sentinel data (2021) processed by ESA WorldCover consortium. [CC BY 4.0 and data access](https://esa-worldcover.org/en/data-access). Forest, grassland, cropland, bare ground, settlement, snow, water, and other present classes are stylized, not aerial imagery.
- **OpenStreetMap:** © OpenStreetMap contributors, [ODbL](https://www.openstreetmap.org/copyright). Bounded extracts come from Geofabrik’s September 3, 2026 Peru snapshot. Mapping completeness varies; the source manifest records a skipped unassemblable water relation.

## Validation

- `npm test`: focused interpolation, dense-grid extrema, normal orientation, draped-overlay alignment, geographic measurements, and bundled data checks.
- `npm run check`: TypeScript.
- `npm run lint:app`: app, renderer, preparation scripts, tests, and the edited slider component.
- `npm run build`: static production export.







The bounded expansion pipeline is in `scripts/expansion/`. Its outputs and caches stay in `/private/tmp/relief-expansion`; it reads the two preserved source areas from this checkout. Run its `base`, `osm`, `canopy`, and `features` stages, then the audit, before merging staged assets.

City loading batches repeated window and road geometry, builds in short cancellable chunks, and waits for terrain seams before constructing objects. The CPU benchmark is `node --experimental-strip-types scripts/benchmark-city.mjs`; it isolates construction cost from network and terrain sampling.

### Train and city retention · September 2026

Travel uses the bundled OSM network with separate journey and scenery speed controls. The original PeruRail-style diesel and panoramic coach meshes use photo references linked in `public/travel/source.json`; proportions and consist are illustrative. A bounded instanced track pool shows the mapped 914 mm railway near the train, omits tunnel segments, and releases geometry when the world closes. Google Maps opens external directions only; no routing API, credentials, billing, or live feeds.

Full-detail towns load objects within 5.5 km of the camera or focus, retain them to 7 km, and hold fine ground beneath resident structures. This prevents short camera turns and zoom thresholds from repeatedly clearing and rebuilding city blocks. The terrain budget accommodates Cusco's 24 bundled tiles; distant areas still unload. Smaller towns use shorter radii.

### Dedicated train ride

Ride the train opens a single Ollantaytambo → Aguas Calientes journey, parked inside an illustrative panoramic carriage. Depart when ready, with gentle acceleration and braking at arrival. Window seat, driver’s cab, follow, and valley views use eased camera transitions. A responsive journey dock provides pause, resume, seek, skip, replay, and a 0.5×–240× pace slider, defaulting to 10× (approximately 7 minutes 12 seconds plus acceleration and braking). Drag or use WASD/arrows to look around inside; pan, orbit, and zoom outside while playback continues. Space pauses and 1–4 switch views. Returning to the platform boards again without departing. Arrival stops on the inbound station track before the reversing siding switch. Reduced motion disables automatic playback and uses direct camera changes. The route is an ordinary JSON asset generated once from the bundled OSM railway, with no runtime graph calculation or Google Maps UI in the ride.



### Railway landscape

The train corridor now has 90 additional detailed terrain tiles, covering a 3.2 km (about two-mile) buffer on each side of the mapped railway. It reuses the existing Ollantaytambo and Machu town assets. The additional 62 MB includes 2,990 mapped OSM building footprints, paths, roads, agricultural areas and water features, plus 229,355 canopy-guided tree instances. These assets stream only around the camera; the complete corridor is not loaded at once.

Terrain uses original Mapzen zoom 13 elevations at roughly 15.6 m mesh spacing, and surface categories retain WorldCover 2021 10 m sampling. CHMv2 canopy observations for this extension date to 2018-05-30. Tree crowns, species and untagged building heights/roofs remain illustrative. Two conflicting untagged building footprints that cross the railway are retained in the source extract but omitted from rendering. Source coverage, dates, exclusions and build instructions are recorded in `public/world/rail-corridor/` and `scripts/rail-corridor/`.

## License

Application code is MIT licensed. Geographic databases, terrain, canopy-derived assets, and photographs keep their separate upstream licenses and attribution. See `THIRD_PARTY_NOTICES.md`; the MIT license does not relicense those assets.
