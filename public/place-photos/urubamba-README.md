# Urubamba landmark pack

Prepared 2026-09-05 for RELIEF's local Living World. No application files were changed.

## Integration

- `places.json`: seven records matching `lib/place-pois.json`, including `detail: true` and exact OSM feature IDs. These belong to the **Sacred Valley** collection, not the Machu Picchu-only POI array.
- `photos/`: four CC BY-SA 4.0 JPEGs, 1.82 MiB total. Copy into `public/place-photos/` with the supplied filenames.
- `photo-attribution.json`: authors, license URLs, source pages, original URLs, image dates, thumbnail transformations, and SHA-256 hashes.
- `landmark-features.geojson`: the seven exact OSM source geometries and tags. This is separate from the app assets; nothing was written into the checkout.
- `coverage.json`: geometry, coordinate method, existing 3D coverage, and factual sources.

## Coverage and identity

| Place | Exact OSM identity | Existing selectable 3D footprint | Photograph |
|---|---|---|---|
| Plaza de Armas de Urubamba | way/1213384196 | No, square polygon | Church frontage on its northern edge; explicitly captioned as that view |
| Iglesia San Pedro Apóstol | way/788306774 | Yes, named building | Exact facade and bell wall, October 2019 |
| Santuario del Señor de Torrechayoc | node/460425455 | Point only | No reusable exact-subject image found |
| Mercado Modelo de Urubamba | way/331463104 | Yes, named building | Exact market interior, August 2026 |
| Mercado de Productores de Urubamba | way/970234139 | No, marketplace polygon | Exact producers' fair, August 2026 |
| Qespiwanka palace remains | way/664518719 | Yes, named ruin | No reusable exact-subject image found |
| Museo de Qespiwanka | node/9278423795 | Point only | No reusable exact-subject image found |

Coordinates come from the dated Geofabrik Peru OSM extract already used by RELIEF: `peru-260903.osm.pbf`. Polygon coordinates use a representative point inside the actual named polygon. Point records use the source point unchanged. No name was attached to the nearest unnamed building. A church, a hardware store, and stationery stores share variants of “Torrechayoc”; the selected node has `amenity=place_of_worship`, `denomination=catholic`, and `religion=christian`.

The new museum is distinct from the palace. Its Ministry of Culture source identifies Casa Hacienda Pino and five galleries about Qhapaq Ñan, the palace, and local traditions. The palace footprint's source name is “Palacio de Huayna Ccapac” and description “Quispeguanca”; municipal material uses Qespiwanka and Wayna Qhapaq.

## Photo review and gaps

All four bundled files were visually inspected. The plaza card deliberately shows the church frontage and steps on the square's north side, rather than claiming an overview of the entire square. The two market photographs are distinct named subjects. The producers' market photo contains a “Yucay” section sign, consistent with a market organized for growers from across the province; it is not a photograph of the town of Yucay.

The selected image licenses, attribution, and dates were read directly from Commons file metadata. All files are Wikimedia-generated 1280 px thumbnails with no additional crop or content edits. Credit links point to exact file pages, and the complete attribution file includes the CC BY-SA 4.0 license URL. Preserve those credits when the app is eventually published.

Bounded Commons category and filename searches did not find a reusable photograph of Torrechayoc sanctuary or the museum. The Quispiguanca category contained a cemetery photograph, a historical illustration of Huayna Cápac, and a general town view. Those were not used as pictures of the palace ruins. These three records therefore omit `photo` instead of showing the wrong place.

## Useful 3D references

The San Pedro photos show a stone facade, a stepped bell wall with three visible bell openings, entrance steps, white side walls, and a clay-tiled nave roof. These are visual references for an illustrative refinement, not measured survey dimensions. The exact footprint is provided. Mercado Modelo's photo verifies a large covered market with an upper gallery; it does not establish roof dimensions or height. The producers' market photo shows open-sided roofed stalls, but OSM provides a site boundary rather than individual stall footprints. Avoid treating the whole market polygon as one solid building.

## Primary factual sources

- [Urubamba municipality: San Pedro Apóstol and Plaza Mayor](https://www.gob.pe/institucion/muniurubamba/noticias/658740-municipalidad-de-urubamba-desarrollara-el-26-de-agosto-campana-integral-para-adultos-mayores)
- [Mincetur tourism inventory: Señor de Torrechayoc festival](https://consultasenlinea.mincetur.gob.pe/fichaInventario/index.aspx?cod_Ficha=13222)
- [Ministry of Production: Mercado Modelo](https://www.gob.pe/institucion/produce/noticias/1023105-produce-y-municipalidad-de-urubamba-firman-convenio-para-modernizar-mercado-beneficiando-a-mas-de-16-000-habitantes)
- [Urubamba municipality: producers' market](https://www.gob.pe/institucion/muniurubamba/noticias/1214955-urubamba-fortalece-su-economia-local-y-revalora-su-identidad-con-el-trabajo-de-sus-productores)
- [Urubamba municipality: Qespiwanka](https://www.gob.pe/institucion/muniurubamba/noticias/905318-quespiwanka-2023)
- [Cusco Directorate of Culture: Museo de Qespiwanka](https://www.culturacusco.gob.pe/post/museos/museo-de-qespiwanka/)

OSM geometry: © OpenStreetMap contributors, ODbL 1.0, [copyright and attribution](https://www.openstreetmap.org/copyright). This pack makes no claim to have surveyed the geometry.
