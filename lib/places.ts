import placeAssets from './place-assets.json';
import placePois from './place-pois.json';
import railStations from './rail-stations.json';
import urubambaPlaces from './urubamba-places.json';
export type Place = {
  featureId?: string;
  detail?: boolean;
  source?: string;
  photo?: {
    url: string;
    alt: string;
    author: string;
    license: string;
    source: string;
  };
  id: string;
  name: string;
  lat: number;
  lon: number;
  kind: string;
  note: string;
  coordinateNote?: string;
};
export type Region = {
  id: string;
  name: string;
  country: string;
  subtitle: string;
  bounds: [number, number, number, number];
  zoom: number;
  places: Place[];
};
export const regions: Region[] = [
  {
    id: 'valley',
    name: 'The Sacred Valley',
    country: 'PERU',
    subtitle: 'The river, the ridges, and the places between.',
    bounds: [-72.65, -13.6, -71.75, -13.05],
    zoom: 10,
    places: [
      {
        id: 'urubamba',
        name: 'Urubamba',
        lat: -13.305,
        lon: -72.116,
        kind: 'THE HEART OF THE VALLEY',
        note: 'The Urubamba River opens into a broad valley floor here, between steep Andean slopes and cultivated fields.',
      },
      {
        id: 'machu',
        name: 'Machu Picchu',
        lat: -13.1631,
        lon: -72.545,
        kind: 'ABOVE THE URUBAMBA',
        note: 'An Inca sanctuary set between steep mountain ridges and the river far below.',
      },
      {
        id: 'ollanta',
        name: 'Ollantaytambo',
        lat: -13.258,
        lon: -72.264,
        kind: 'VALLEY GATEWAY',
        note: 'Follow the valley northwest, where the mountains close in toward Machu Picchu.',
      },
      {
        id: 'cusco',
        name: 'Cusco',
        lat: -13.516689,
        lon: -71.978694,
        kind: 'THE HIGH BASIN',
        note: 'The historic Inca capital sits above the Sacred Valley, surrounded by Andean ridges.',
      },
      {
        id: 'sacsay',
        name: 'Sacsayhuamán',
        lat: -13.509,
        lon: -71.982,
        kind: 'ABOVE CUSCO',
        note: 'Monumental Inca stonework on the heights overlooking Cusco.',
      },
      {
        id: 'pisac',
        name: 'Pisac',
        lat: -13.422,
        lon: -71.846,
        kind: 'EASTERN VALLEY',
        note: 'A river town beneath a steep, terraced archaeological landscape.',
      },
      {
        id: 'moray',
        name: 'Moray',
        lat: -13.33,
        lon: -72.196,
        kind: 'NEARBY DISCOVERY',
        note: 'Concentric Inca terraces set into natural depressions above the valley.',
      },
    ],
  },
  {
    id: 'machu',
    name: 'Machu Picchu',
    country: 'PERU',
    subtitle: 'Wait for the light.',
    bounds: [-72.605, -13.205, -72.485, -13.12],
    zoom: 12,
    places: [
      {
        id: 'machu',
        name: 'Machu Picchu',
        lat: -13.1631,
        lon: -72.545,
        kind: 'THE SANCTUARY',
        note: 'Turn the light. Watch the ridge emerge. Stay a while.',
      },
      {
        id: 'aguas',
        name: 'Aguas Calientes',
        lat: -13.1556,
        lon: -72.525,
        kind: 'IN THE GORGE',
        note: 'The rail arrival town in the river gorge below the sanctuary.',
      },
    ],
  },
  {
    id: 'utah',
    name: 'The Wasatch',
    country: 'UTAH, USA',
    subtitle: 'A familiar skyline. A new perspective.',
    bounds: [-111.98, 40.4, -111.35, 40.95],
    zoom: 10,
    places: [
      {
        id: 'slc',
        name: 'Salt Lake City',
        lat: 40.761,
        lon: -111.891,
        kind: 'AT THE MOUNTAIN FRONT',
        note: 'The city and the mountain wall: a study in contrast.',
      },
      {
        id: 'alta',
        name: 'Alta',
        lat: 40.588,
        lon: -111.638,
        kind: 'LITTLE COTTONWOOD CANYON',
        note: 'Explore the folds and ridgelines of the central Wasatch.',
      },
    ],
  },
  {
    id: 'tristan',
    name: 'Tristan da Cunha',
    country: 'SOUTH ATLANTIC',
    subtitle: 'A familiar name. A very distant island.',
    bounds: [-12.39, -37.19, -12.19, -37.04],
    zoom: 12,
    places: [
      {
        id: 'peak',
        name: "Queen Mary's Peak",
        lat: -37.111,
        lon: -12.288,
        kind: 'VOLCANIC ISLAND',
        note: 'An ocean, a volcano, and one very good name. A small detour from Peru.',
      },
    ],
  },
];

for (const region of regions.filter((r) => r.country === 'PERU')) {
  region.places = region.places.map((place) => {
    const asset = placeAssets.find((a) => a.id === place.id);
    // Existing profile endpoints retain their coordinates when adding editorial content.
    return asset
      ? { ...place, source: asset.source, photo: asset.photo, note: asset.note }
      : place;
  });
}
regions[0].places.push(
  ...placeAssets.filter(
    (p) => !regions[0].places.some((existing) => existing.id === p.id),
  ),
);
regions[1].places.push(...placePois);
regions[0].places.push(...urubambaPlaces);
for (const place of railStations) {
  const region = place.lon < -72.48 ? regions[1] : regions[0];
  region.places.push(place);
}
export const peruWorldRegion: Region = {
  ...regions[0],
  places: [
    ...new Map(
      regions
        .filter((r) => r.country === 'PERU')
        .flatMap((r) => r.places)
        .map((p) => [p.id, p]),
    ).values(),
  ],
};
export const buildingPlaces = new Map(
  peruWorldRegion.places
    .filter((p) => p.featureId)
    .map((p) => [p.featureId, p]),
);
