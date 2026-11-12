# RELIEF place photograph and identity pack

Prepared 5 September 2026. This directory is a research handoff only; it does not modify or publish the app.

## Integration

- `places.json`: 17 named towns, archaeological places, and infrastructure landmarks. Existing RELIEF IDs are preserved for Machu Picchu, Aguas Calientes, Urubamba, Ollantaytambo, Cusco, Sacsayhuamán, Pisac, and Moray.
- `pois.json`: 15 named public places/structures in Machu Picchu Pueblo and the sanctuary, keyed by real OpenStreetMap IDs. Each includes longitude/latitude, source URL, source tags, geometry, and an explicit identity binding.
- `photos/`: 21 JPEG photographs, 8.72 MB total. Copy these into the app's public `place-photos/` directory; the JSON already uses `/place-photos/<photoId>.jpg` paths.
- `photo-attribution.json`: author, license and license URL, Commons file page, original image URL, actual dimensions, photograph date, source metadata, exact named-place pin coordinates and coordinate source.
- `sources.json`: geographic dataset attribution and interpretation sources.

The five-field `photo` object matches `{url, alt, author, license, source}`. `photo.source` is the Commons file page; `place.source` is the interpretation source. Show `photoLicenseUrl` as a license link where possible. The additional fields explain date and geographic limits and can remain in a separate attribution registry.

## Attribution and reuse

All photographs were downloaded from Wikimedia Commons URLs for the requested app implementation. Their individual metadata identifies CC BY, CC BY-SA, or CC0 permission. Keep the author, license link, Commons file-page link, and image title in accessible attribution. Preserve ShareAlike licensing for any adaptation of a CC BY-SA image. Files are Commons thumbnails with no local crop or retouch; styling them in the UI must not erase required credit. These licenses apply to the individual images, not an assumption about unrelated official photographs.

Place coordinates and selected geometries come from the 3 September 2026 Geofabrik Peru OpenStreetMap snapshot. Retain “© OpenStreetMap contributors” with a link to https://www.openstreetmap.org/copyright and make the ODbL geographic subset available when distributing it. `pois.json` includes selected source geometry; `osm-named-candidates.json` preserves the bounded named-place source candidates. Neither includes private data.

## Identity and image limits

- Two named building footprints are directly identified: town hall `way/649704654` and central market `way/840941004`. Never attach these names to another footprint by proximity.
- Station, church, museum, and several temples are source point features. Their coordinates support a named pin; they do not prove which nearby unnamed building polygon is the same feature. `identityNote` makes this explicit.
- Hot springs, the plaza, Sun Gate, and Temple of the Moon have mapped feature geometry, but a site/plaza boundary is not automatically a building outline.
- The Temple of the Sun, Three Windows, railway station, church, and thermal-baths photographs depict those subjects. The Intihuatana photograph shows the terraced hill setting, not a close-up of the carved stone, and is labeled accordingly.
- Some photographs are historical: Ollantaytambo is from 1984; Yucay is from 2006; baths are from 2012. Dates are preserved, and these must not be represented as current condition surveys.
- The Pisac pin is the town, while its image shows the Q’alla Q’asa archaeological sector above town. The caption explicitly distinguishes them. Cusco's photograph shows Plaza de Armas and the cathedral as a setting view.
- No redistributable museum image was found in the bounded Commons searches. Ministry of Culture museum images had no verified reusable license and were not copied. Coya and Huayllabamba also have no specific verified photo in this pack. Do not replace these with an unlabeled photograph of another town.

## Chinchero airport status

Label this feature **Under construction**. The latest official construction update found is the Cusco regional government's 30 June 2026 tower-construction/funding announcement. MTC reported a control-tower contract on 5 May 2026, and its 31 March 2026 announcement described a 2027 opening target. These are not proof of current airport operation. Status was checked on 5 September 2026.

The airport photograph is a historical construction view from May 2023, taken across Chinchero rooftops. The caption says so. OSM marks the area as `landuse=construction` and notes imperfect boundary demarcation; the pin is a representative location, not a surveyed terminal entrance.

## Validation

All 21 JPEGs were decoded by macOS `sips`; dimensions in the manifest reflect the downloaded files rather than the requested thumbnail width. Every photograph has author, license, license URL, Commons file page, local file, and a sourced place coordinate. Exact temple, church, station, baths, Moray, Machu Picchu, and airport images were visually inspected. No remote media display bypass, repository edit, or publication occurred.
