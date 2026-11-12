# Offline travel network

The generator reads the cached Geofabrik Peru extract and writes a bounded,
directed network with original OSM node geometry. It makes no network request.
The generated `network.json.gz` is deterministic gzip-compressed JSON. Only the
compressed asset is bundled; browsers decode it using `DecompressionStream`.

```sh
/private/tmp/relief-gis/bin/python scripts/travel/prepare-network.py
/private/tmp/relief-gis/bin/python -m unittest discover -s scripts/travel -p 'test_*.py'
/private/tmp/relief-gis/bin/python scripts/travel/verify-network.py
```

`nodes` are longitude/latitude pairs. Each edge is
`[from, to, metres, accessMask, tunnelFlag]`; bits are drive=1, walk=2, train=4.
Driving obeys mapped one-way tags. Walking stays bidirectional except explicit
`oneway:foot`. Road access=no/private and mapped motor/foot prohibitions remove
the affected edges. Driving destination access remains available for reaching
destinations.

The PeruRail line is **railway=narrow_gauge**, gauge=914, in OSM. Both operational
standard rail and narrow gauge are included, with yard, spur and siding tracks
excluded. Rail access=private remains eligible because passenger tracks can be
privately owned; this is a visualization, not permission to enter track property.
No abandoned, proposed or disused railways are included. Train edges permit both
directions for the return journey; they do not encode operating permission or a
timetable.

The asset preserves genuine disconnected components. Endpoints can be near a
mapped road, platform or footpath without touching its centerline, so the route
consumer must report endpoint gaps and refuse missing connectivity rather than
draw invented connectors. A road route between Aguas Calientes and the main
valley is not guaranteed; the rail journey uses the mapped passenger railway.
Turn restrictions, conditional restrictions, traffic and schedules are absent.

Source and replication timestamp are in the graph `source` and `source.json`; station metadata
is in `stations.json`. Attribution: OpenStreetMap contributors, ODbL 1.0.

## Validated extract

- Replication timestamp: 2026-09-03T20:21:51Z.
- 492,753 mapped nodes; 1,014,205 directed edges; 8,621,415 compressed bytes.
- Closest rail-node connection: Ollantaytambo to Machu Picchu Pueblo and back,
  43,203.6 metres, 1,439 source nodes, 10 tunnel segments; station gaps 9.1 m and
  5.0 m. Selecting among several nearby access nodes can slightly shorten this.
- Verified driving connectivity from Cusco airport to Ollantaytambo and from
  Ollantaytambo to Urubamba.
- Aguas Calientes to the Machu Picchu landmark has a connected mapped walking
  route of approximately 4.6 km when selecting among eight nearby access nodes.
  Its very closest sanctuary-side path is disconnected, so endpoint selection
  must consider connectivity and disclose its gap; no missing edge was added.
