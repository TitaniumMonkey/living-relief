export type Chapter = {
  id: string;
  title: string;
  eyebrow: string;
  regionId: 'valley' | 'machu';
  placeId: string;
  body: string;
  source: { label: string; url: string };
  cameraOffset: [number, number, number];
  cameraDistance?: number;
  schedule?: string;
  status?: 'confirmed' | 'planned' | 'optional';
  relatedPlaceIds?: string[];
  look: {
    preset: 'dawn' | 'daylight' | 'dusk';
    sunHeight: number;
    light: number;
    exaggeration: number;
    atmosphere: boolean;
  };
  layers: {
    water: boolean;
    settlements: boolean;
    history: boolean;
    surface: 'elevation' | 'landcover';
  };
};

export const chapters: Chapter[] = [
  {
    id: 'high-basin',
    title: 'Cusco & Sacsayhuamán',
    eyebrow: 'THE HIGH BASIN',
    regionId: 'valley',
    placeId: 'cusco',
    body: 'Cusco occupies a high Andean basin, where the Inca capital developed around religious and administrative centres. Sacsayhuamán stands on the northern heights: its immense fitted stones and stepped walls belong to a larger complex of shrines, buildings, and waterworks. Read the relationship between the city and the surrounding slopes; individual walls and buildings are smaller than this terrain model can resolve.',
    source: {
      label: 'MINCETUR · Sacsayhuamán',
      url: 'https://consultasenlinea.mincetur.gob.pe/fichaInventario/index.aspx?cod_Ficha=904',
    },
    cameraOffset: [3.5, 5.5, 7],
    look: {
      preset: 'daylight',
      sunHeight: 48,
      light: 135,
      exaggeration: 2.4,
      atmosphere: false,
    },
    layers: {
      water: true,
      settlements: true,
      history: true,
      surface: 'elevation',
    },
  },
  {
    id: 'terraces-above-the-river',
    title: 'Pisac',
    eyebrow: 'TERRACES ABOVE THE RIVER',
    regionId: 'valley',
    placeId: 'pisac',
    body: 'Pisac has two distinct settings: the town on the valley floor and the Inca archaeological complex high on the mountainside. Agricultural terraces, water channels, and stone buildings occupy that upper landscape. The relief makes their broader setting legible: steep slopes above a settled valley. Turn the light across the ridges to see how sharply the ground rises beyond the town.',
    source: {
      label: 'MINCETUR · Pisac',
      url: 'https://consultasenlinea.mincetur.gob.pe/fichaInventario/index.aspx?cod_Ficha=930',
    },
    cameraOffset: [-4.5, 4.8, 6],
    look: {
      preset: 'daylight',
      sunHeight: 36,
      light: 110,
      exaggeration: 2.8,
      atmosphere: false,
    },
    layers: {
      water: true,
      settlements: true,
      history: true,
      surface: 'elevation',
    },
  },
  {
    id: 'the-river-corridor',
    title: 'Urubamba',
    eyebrow: 'THE RIVER CORRIDOR',
    regionId: 'valley',
    placeId: 'urubamba',
    body: 'Near the centre of the Sacred Valley, Urubamba sits below the glaciated mountain range within the Vilcanota–Urubamba basin. River irrigation and fertile ground supported Inca cultivation; maize, potatoes, and other crops remain part of the surrounding landscape. Follow the water layer through the valley, then compare its lower ground with the ridges rising on either side.',
    source: {
      label: 'MINCETUR · Urubamba',
      url: 'https://consultasenlinea.mincetur.gob.pe/fichaInventario/index.aspx?cod_Ficha=3690',
    },
    cameraOffset: [6.5, 6, 3.5],
    look: {
      preset: 'daylight',
      sunHeight: 52,
      light: 155,
      exaggeration: 2.2,
      atmosphere: false,
    },
    layers: {
      water: true,
      settlements: true,
      history: false,
      surface: 'elevation',
    },
  },
  {
    id: 'land-shaped-for-cultivation',
    title: 'Moray',
    eyebrow: 'LAND SHAPED FOR CULTIVATION',
    regionId: 'valley',
    placeId: 'moray',
    body: 'Above the valley near Maras, Moray contains concentric agricultural terraces built inside large depressions. Differences between terrace levels created local growing conditions, supporting the interpretation that the site served agricultural experimentation. This view places Moray within the higher landscape around the river valley. Its individual terrace rings are archaeological features described here, rather than structures resolved by the regional elevation grid.',
    source: {
      label: 'MINCETUR · Moray',
      url: 'https://consultasenlinea.mincetur.gob.pe/fichaInventario/index.aspx?cod_Ficha=1814',
    },
    cameraOffset: [-3.5, 7, 4],
    look: {
      preset: 'daylight',
      sunHeight: 40,
      light: 210,
      exaggeration: 2.1,
      atmosphere: false,
    },
    layers: {
      water: true,
      settlements: false,
      history: true,
      surface: 'elevation',
    },
  },
  {
    id: 'where-valleys-meet',
    title: 'Ollantaytambo',
    eyebrow: 'WHERE VALLEYS MEET',
    regionId: 'valley',
    placeId: 'ollanta',
    body: 'Ollantaytambo stands beside the Patacancha River near its meeting with the Urubamba. Inca planning joined the settlement, irrigated fields, and hillside terraces into one landscape. Monumental structures overlook the town, while tributary valleys open into the larger river corridor. Use the water and settlement layers together to read this junction of mountain slopes, cultivated ground, and urban space.',
    source: {
      label: 'Municipality of Ollantaytambo · Archaeological park',
      url: 'https://ollantaytambodestinoseguro.muniollantaytambo.gob.pe/parque-arqueologico-de-ollantaytambo/',
    },
    cameraOffset: [4.5, 5, -5.5],
    look: {
      preset: 'dusk',
      sunHeight: 24,
      light: 275,
      exaggeration: 2.7,
      atmosphere: false,
    },
    layers: {
      water: true,
      settlements: true,
      history: true,
      surface: 'elevation',
    },
  },
  {
    id: 'ridge-above-the-gorge',
    title: 'Machu Picchu',
    eyebrow: 'A RIDGE ABOVE THE GORGE',
    regionId: 'machu',
    placeId: 'machu',
    body: 'Machu Picchu occupies a steep ridge where the Andes descend toward the Amazon basin. Built in the fifteenth century, its terraces and structures work with the mountain setting, surrounded by tropical mountain forest. This close view reveals the ridges and deep river gorge around the sanctuary. The dawn light and receding mist are an artistic presentation of that setting, not a reconstruction of historical weather.',
    source: {
      label: 'UNESCO · Historic Sanctuary of Machu Picchu',
      url: 'https://whc.unesco.org/en/list/274/',
    },
    cameraOffset: [5.5, 5, 7],
    look: {
      preset: 'dawn',
      sunHeight: 15,
      light: 85,
      exaggeration: 1.5,
      atmosphere: true,
    },
    layers: {
      water: true,
      settlements: false,
      history: true,
      surface: 'elevation',
    },
  },
];
