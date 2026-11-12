'use client';

import { TravelPanel } from '@/components/travel-panel';
import { googleMapsUrl } from '@/lib/place-details';
import {
  useCallback,
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  ArrowUpRight,
  ArrowLeft,
  ArrowRight,
  ChevronRight,
  Compass,
  Download,
  Expand,
  Layers3,
  Mountain,
  Pause,
  Play,
  RotateCcw,
  Sun,
  Sunset,
  Sunrise,
  X,
  BookOpen,
  SlidersHorizontal,
  Waves,
  MapPin,
  Landmark,
  Trees,
  ChevronUp,
  Globe2,
  Moon,
  Cloud,
  CloudRain,
  CloudFog,
  Building2,
  Sprout,
  Bird,
  Users,
  Car,
  Plus,
  Minus,
} from 'lucide-react';
import Link from 'next/link';
import Image from 'next/image';
import { Slider } from '@/components/ui/slider';
import {
  NativeSelect,
  NativeSelectOption,
} from '@/components/ui/native-select';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { distanceKm } from '@/lib/geo';
import { insideBounds } from '@/lib/render-math';
import { regions, peruWorldRegion, type Place } from '@/lib/places';
import { chapters as landscapeChapters, type Chapter } from '@/lib/chapters';
import { formatWorldTime } from '@/lib/world-clock';
import type { TerrainAPI, TerrainMeta, TerrainOptions } from '@/lib/terrain';
import { initialWorldOptions, type GeographicView } from '@/lib/world-types';

type Panel = 'look' | 'layers' | 'story';
const initialOptions: TerrainOptions = {
  ...initialWorldOptions,
  exaggeration: 2,
  light: 315,
  sunHeight: 38,
  preset: 'daylight',
  contours: true,
  labels: true,
  orbit: false,
  palette: 'atlas',
  atmosphere: false,
  surface: 'elevation',
  water: true,
  settlements: true,
  history: false,
  quality: 'balanced',
  reduceMotion: false,
};
const lightPresets = {
  dawn: { light: 25, sunHeight: 12 },
  daylight: { light: 315, sunHeight: 38 },
  dusk: { light: 230, sunHeight: 16 },
};
function Range({
  label,
  value,
  min,
  max,
  step = 1,
  suffix = '',
  onChange,
  formatValue,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  suffix?: string;
  onChange: (value: number) => void;
  formatValue?: (value: number) => string;
}) {
  return (
    <div className="range-control">
      <div className="label-row">
        <span>{label}</span>
        <strong>
          {formatValue ? formatValue(value) : value.toFixed(step < 1 ? 1 : 0)}
          {suffix}
        </strong>
      </div>
      <Slider
        aria-label={label}
        min={min}
        max={max}
        step={step}
        value={[value]}
        onValueChange={(v) => onChange(Array.isArray(v) ? v[0] : v)}
      />
    </div>
  );
}
function Toggle({
  label,
  detail,
  checked,
  onChange,
  children,
  disabled = false,
}: {
  label: string;
  detail?: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  children?: React.ReactNode;
  disabled?: boolean;
}) {
  return (
    <div className="layer-row">
      <span className="layer-icon">{children}</span>
      <span>
        <strong>{label}</strong>
        {detail && <small>{detail}</small>}
      </span>
      <Switch
        aria-label={label}
        checked={checked}
        onCheckedChange={onChange}
        disabled={disabled}
      />
    </div>
  );
}
function ChapterDetails({
  chapter,
  place,
  onExplore,
}: {
  chapter: Chapter;
  place?: Place;
  onExplore: (id: string) => void;
}) {
  return (
    <article className="chapter-body">
      {place?.photo && (
        <figure className="chapter-photo">
          <Image
            src={place.photo.url}
            alt={place.photo.alt}
            width={960}
            height={540}
            unoptimized
          />
          <figcaption>
            <a href={place.photo.source} target="_blank" rel="noreferrer">
              {place.photo.author} · {place.photo.license}
            </a>
          </figcaption>
        </figure>
      )}
      <span className="eyebrow">{chapter.eyebrow}</span>
      {chapter.schedule && (
        <strong className="chapter-schedule">{chapter.schedule}</strong>
      )}
      <p>{chapter.body}</p>
      {chapter.relatedPlaceIds && (
        <div className="related-places">
          {chapter.relatedPlaceIds.map((id) => (
            <button key={id} onClick={() => onExplore(id)}>
              <MapPin size={12} />
              {peruWorldRegion.places.find((p) => p.id === id)!.name}
              <ArrowUpRight size={12} />
            </button>
          ))}
        </div>
      )}
      <a target="_blank" rel="noreferrer" href={chapter.source.url}>
        {chapter.source.label}
        <ArrowUpRight size={12} />
      </a>
    </article>
  );
}
export default function Page() {
  const [regionId, setRegionId] = useState('valley');
  const region = regions.find((r) => r.id === regionId)!;
  const peru = regionId === 'valley' || regionId === 'machu';
  const [options, setOptions] = useState(initialOptions);
  const optionsRef = useRef(options);
  const [meta, setMeta] = useState<TerrainMeta | null>(null);
  const [selected, setSelected] = useState<Place | null>(null);
  const [error, setError] = useState('');
  const [zen, setZen] = useState(false);
  const [ready, setReady] = useState(false);
  const [about, setAbout] = useState(false);
  const [profile, setProfile] = useState(false);
  const [tour, setTour] = useState(false);
  const [travelOpen, setTravelOpen] = useState(false);
  const beforeTrainView = useRef<GeographicView | null>(null);
  const chapters = landscapeChapters;
  const [chapterIndex, setChapterIndex] = useState<number | null>(null);
  const chapter = chapterIndex === null ? null : chapters[chapterIndex];
  const chapterPlace =
    chapter && peruWorldRegion.places.find((p) => p.id === chapter.placeId);
  const [panel, setPanel] = useState<Panel>('look');
  const [sheetOpen, setSheetOpen] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [endId, setEndId] = useState('machu');
  const [scrub, setScrub] = useState(0.5);
  const [sample, setSample] = useState<(lon: number, lat: number) => number>(
    () => () => 0,
  );
  const host = useRef<HTMLDivElement>(null);
  const api = useRef<TerrainAPI | null>(null);
  const getTravelAPI = useCallback(() => api.current?.travel, []);
  const pendingDawn = useRef(false);
  const pendingView = useRef<GeographicView | null>(null);
  const pendingPlace = useRef<Place | null>(null);
  const reliefLook = useRef({
    exaggeration: 2,
    palette: 'atlas',
    surface: 'elevation' as TerrainOptions['surface'],
    contours: true,
  });
  const living = options.mode === 'world';
  const renderRegion = living && peru ? peruWorldRegion : region;
  const [flatView, setFlatView] = useState(false);
  const moveCamera = (action: 'in' | 'out' | 'north' | 'tilt') => {
    const view = api.current?.getView();
    if (!view) return;
    pauseMotion();
    if (action === 'in') view.distance *= 0.7;
    if (action === 'out') view.distance *= 1.4;
    if (action === 'north') view.azimuth = 0;
    if (action === 'tilt') {
      view.polar = view.polar < 0.1 ? 0.83 : 0.01;
      setFlatView(view.polar < 0.1);
    }
    api.current?.setView(view);
    host.current?.querySelector('canvas')?.focus({ preventScroll: true });
  };
  const patchOptions = useCallback((patch: Partial<TerrainOptions>) => {
    optionsRef.current = { ...optionsRef.current, ...patch };
    setOptions(optionsRef.current);
  }, []);
  const pauseMotion = useCallback(() => {
    setTour(false);
    patchOptions({ orbit: false });
  }, [patchOptions, setTour]);
  const toggleWorldPause = () => {
    const worldPaused = !options.worldPaused;
    if (worldPaused) pauseMotion();
    patchOptions({ worldPaused });
  };
  const choose = (place: Place) => {
    setTravelOpen(false);
    pauseMotion();
    setSelected(place);
    setProfile(false);
    setChapterIndex(null);
    api.current?.focus(place);
  };
  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => {
      setReducedMotion(media.matches);
      if (media.matches) pauseMotion();
    };
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, [pauseMotion]);
  useEffect(() => {
    const controller = new AbortController();
    const restoreView = pendingView.current;
    pendingView.current = null;
    let instance: TerrainAPI | null = null;
    let loadedMeta: TerrainMeta;
    const rendererModule =
      options.mode === 'world'
        ? import('@/lib/world-renderer').then(
            ({ createWorldTerrain }) => createWorldTerrain,
          )
        : import('@/lib/terrain').then(({ createTerrain }) => createTerrain);
    rendererModule
      .then((createTerrain) =>
        createTerrain(
          host.current!,
          renderRegion,
          optionsRef.current,
          (m) => {
            loadedMeta = m;
          },
          (p) => {
            pauseMotion();
            setChapterIndex(null);
            setSelected(p);
            setProfile(false);
            if (!p.featureId) api.current?.focus(p);
          },
          controller.signal,
          pauseMotion,
        ),
      )
      .then((result) => {
        instance = result;
        if (controller.signal.aborted) {
          result.dispose();
          return;
        }
        api.current = result;
        result.update(optionsRef.current);
        if (restoreView) result.setView(restoreView);
        if (pendingPlace.current) {
          result.focus(pendingPlace.current);
          pendingPlace.current = null;
        }
        if (pendingDawn.current) {
          result.focus(
            peruWorldRegion.places.find((p) => p.id === 'machu')!,
            false,
            [7, 7, 10],
          );
          pendingDawn.current = false;
        }
        setSample(() => result.sample);
        setMeta(loadedMeta);
        setReady(true);
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      });
    return () => {
      controller.abort();
      instance?.dispose();
      api.current = null;
    };
  }, [renderRegion, options.mode, pauseMotion]);
  useEffect(() => {
    if (!living || !ready || !api.current?.setCollection) return;
    const controller = new AbortController();
    const instance = api.current;
    instance.setCollection!(region, controller.signal)
      .then((nextMeta) => {
        if (controller.signal.aborted) return;
        setMeta(nextMeta);
        setSample(
          () => (lon: number, lat: number) => instance.sample(lon, lat),
        );
      })
      .catch((error) => {
        if (!controller.signal.aborted) setError(error.message);
      });
    return () => controller.abort();
  }, [region, ready, living]);
  useEffect(() => {
    api.current?.update(options);
  }, [options]);
  useEffect(() => {
    if (
      !living ||
      !options.dayCycle ||
      options.worldPaused ||
      reducedMotion ||
      options.reduceMotion
    )
      return;
    const timer = window.setInterval(() => {
      if (!document.hidden)
        patchOptions({
          timeOfDay:
            (optionsRef.current.timeOfDay +
              0.025 * optionsRef.current.worldSpeed) %
            24,
        });
    }, 250);
    return () => window.clearInterval(timer);
  }, [
    living,
    options.dayCycle,
    options.worldPaused,
    options.reduceMotion,
    reducedMotion,
    patchOptions,
  ]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (travelOpen) return;
        setZen(false);
        setAbout(false);
        setSheetOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [travelOpen]);
  const loadRegion = useCallback(
    (id: string) => {
      pendingDawn.current = false;
      if (id !== regionId) {
        const sharedWorld =
          optionsRef.current.mode === 'world' &&
          ['valley', 'machu'].includes(id) &&
          ['valley', 'machu'].includes(regionId);
        if (!sharedWorld) {
          setReady(false);
          setMeta(null);
        }
        setError('');
        setRegionId(id);
      }
      setSelected(null);
      setProfile(false);
    },
    [regionId],
  );
  const navigate = (id: string) => {
    setTravelOpen(false);
    pauseMotion();
    setChapterIndex(null);
    loadRegion(id);
    pendingView.current = null;
    pendingPlace.current = null;
    if (living && ['valley', 'machu'].includes(id)) {
      const destination = regions.find((r) => r.id === id)!.places[0];
      if (ready) api.current?.focus(destination);
      else pendingPlace.current = destination;
    }
    patchOptions({
      ...(living && id !== 'valley' && id !== 'machu'
        ? reliefLook.current
        : {}),
      mode: id === 'valley' || id === 'machu' ? options.mode : 'relief',
      exaggeration:
        living && (id === 'valley' || id === 'machu')
          ? 1
          : id === 'machu' || id === 'tristan'
            ? 1.5
            : 2,
      surface: 'elevation',
    });
    setSheetOpen(false);
  };
  const showChapter = (index: number) => {
    setTravelOpen(false);
    const next = landscapeChapters[index];
    loadRegion(next.regionId);
    setChapterIndex(index);
    setPanel('story');
    patchOptions({
      ...next.look,
      ...next.layers,
      exaggeration: optionsRef.current.mode === 'world' ? 1 : next.look.exaggeration,
      timeOfDay:
        next.look.preset === 'dawn'
          ? 6.5
          : next.look.preset === 'dusk'
            ? 17.5
            : 14,
      orbit: false,
    });
  };
  const advanceChapter = useEffectEvent((index: number) => showChapter(index));
  useEffect(() => {
    if (!ready || !chapter || chapter.regionId !== regionId) return;
    const place = region.places.find((p) => p.id === chapter.placeId)!;
    api.current?.focus(
      place,
      false,
      chapter.cameraOffset,
      chapter.cameraDistance,
    );
  }, [chapter, ready, region, regionId]);
  useEffect(() => {
    if (!tour || !ready || chapterIndex === null) return;
    const timer = window.setTimeout(() => {
      if (chapterIndex === chapters.length - 1) {
        setTour(false);
        return;
      }
      advanceChapter(chapterIndex + 1);
    }, 14000);
    return () => window.clearTimeout(timer);
  }, [tour, ready, chapterIndex, chapters.length]);
  const startPlace =
    region.places.find((p) => p.id === 'cusco') ?? region.places[0];
  const endPlace =
    region.places.find((p) => p.id === endId && p.id !== startPlace.id) ??
    region.places.find((p) => p.id !== startPlace.id) ??
    startPlace;
  const profileSamples = useMemo(
    () =>
      Array.from({ length: 181 }, (_, i) =>
        sample(
          startPlace.lon + ((endPlace.lon - startPlace.lon) * i) / 180,
          startPlace.lat + ((endPlace.lat - startPlace.lat) * i) / 180,
        ),
      ),
    [sample, startPlace, endPlace],
  );
  useEffect(() => {
    if (!ready) return;
    if (profile) api.current?.section(startPlace, endPlace);
    else {
      api.current?.section();
      api.current?.probe();
    }
  }, [profile, ready, startPlace, endPlace]);
  const inspect = (t: number) => {
    setScrub(t);
    api.current?.probe(
      startPlace.lon + (endPlace.lon - startPlace.lon) * t,
      startPlace.lat + (endPlace.lat - startPlace.lat) * t,
    );
  };
  const minimum = Math.floor(Math.min(...profileSamples) / 500) * 500;
  const maximum = Math.ceil(Math.max(...profileSamples) / 500) * 500;
  const profilePath = profileSamples
    .map(
      (h, i) =>
        `${i ? 'L' : 'M'}${(i / 180) * 600},${90 - ((h - minimum) / (maximum - minimum || 1)) * 75}`,
    )
    .join(' ');
  const firstLight = () => {
    pauseMotion();
    loadRegion('machu');
    setChapterIndex(null);
    setPanel('look');
    setSheetOpen(false);
    patchOptions({
      ...lightPresets.dawn,
      preset: 'dawn',
      exaggeration: living ? 1 : 1.5,
      atmosphere: true,
      timeOfDay: 6.5,
      dayCycle: false,
      weather: living ? 'mist' : options.weather,
      orbit: !(reducedMotion || options.reduceMotion),
    });
    if ((living || regionId === 'machu') && ready) {
      api.current?.update(optionsRef.current);
      api.current?.focus(
        peruWorldRegion.places.find((p) => p.id === 'machu')!,
        false,
        [7, 7, 10],
      );
    } else pendingDawn.current = true;
  };
  const selectPanel = (next: Panel) => {
    setPanel(next);
    setSheetOpen(true);
  };
  const changeMode = (mode: TerrainOptions['mode']) => {
    if (mode === options.mode) return;
    pendingView.current = api.current?.getView() ?? null;
    if (
      mode === 'relief' &&
      regionId === 'machu' &&
      pendingView.current &&
      !insideBounds(
        region.bounds,
        pendingView.current.lon,
        pendingView.current.lat,
      )
    )
      setRegionId('valley');
    pauseMotion();
    setReady(false);
    setError('');
    setChapterIndex(null);
    if (mode === 'world') {
      reliefLook.current = {
        exaggeration: options.exaggeration,
        palette: options.palette,
        surface: options.surface,
        contours: options.contours,
      };
      patchOptions({
        mode,
        exaggeration: 1,
        contours: false,
        surface: 'elevation',
      });
    } else patchOptions({ mode, ...reliefLook.current });
    setSheetOpen(false);
  };
  const exploreWorldPlace = (id: string) => {
    const place = peruWorldRegion.places.find((p) => p.id === id)!;
    const destination = regions[1].places.some((p) => p.id === id)
      ? 'machu'
      : 'valley';
    pauseMotion();
    setChapterIndex(null);
    setProfile(false);
    if (destination !== regionId) loadRegion(destination);
    setSelected(place);
    api.current?.focus(place);
    host.current?.querySelector('canvas')?.focus({ preventScroll: true });
    setSheetOpen(false);
  };
  const openTrain = () => {
    beforeTrainView.current = api.current?.getView() ?? null;
    pauseMotion();
    setSelected(null);
    setProfile(false);
    setChapterIndex(null);
    setSheetOpen(false);
    setTravelOpen(true);
    setZen(true);
    if (!living) changeMode('world');
    patchOptions({ worldPaused: false });
  };
  const closeTrain = () => {
    api.current?.travel?.stop();
    if (beforeTrainView.current) api.current?.setView(beforeTrainView.current);
    setTravelOpen(false);
    setZen(false);
  };
  return (
    <main
      className={`app ${living ? 'living-world' : ''} ${zen ? 'zen' : ''} ${travelOpen ? 'train-active' : ''} ${sheetOpen ? 'sheet-open' : ''}`}
    >
      <header className="topbar">
        <Link className="brand" href="/" aria-label="Living Relief home">
          <Mountain size={24} strokeWidth={1.2} />
          <span>
            LIVING RELIEF<span className="brand-dot">.</span>
          </span>
        </Link>
        <div className="edition">
          A COLLECTION OF PLACES <span>/</span> VOLUME 04
        </div>
        <fieldset className="mode-switch" aria-label="Map experience">
          <button aria-pressed={!living} onClick={() => changeMode('relief')}>
            <Mountain size={14} /> Relief
          </button>
          <button
            aria-pressed={living}
            disabled={!peru}
            title={
              peru
                ? 'Explore a living landscape'
                : 'Living World begins in Peru'
            }
            onClick={() => changeMode('world')}
          >
            <Globe2 size={14} /> Living World
          </button>
        </fieldset>
        <button className="text-button" onClick={() => setAbout(true)}>
          About Living Relief <ArrowUpRight size={14} />
        </button>
      </header>
      <div className="workspace">
        <aside className="rail">
          <div className="rail-top">
            <span className="eyebrow">THE COLLECTION</span>
            <span className="small-count">04</span>
          </div>
          <nav aria-label="Relief collection">
            {regions.map((r, i) => (
              <button
                key={r.id}
                className={`region ${r.id === regionId ? 'active' : ''}`}
                aria-pressed={r.id === regionId}
                onClick={() => navigate(r.id)}
              >
                <span className="region-num">0{i + 1}</span>
                <span>
                  <small>{r.country}</small>
                  <strong>{r.name}</strong>
                </span>
                <ChevronRight size={14} />
              </button>
            ))}
          </nav>
          <div className="rail-note">
            <span className="small-line" />
            <p>A world of landscapes, brought into relief.</p>
            <small>LET’S START HERE.</small>
          </div>
          <div className="rail-bottom">
            <span className="status-dot" /> FIELD EDITION <span>04</span>
          </div>
        </aside>
        <section className="scene" aria-label="Terrain explorer">
          <div className="scene-heading">
            <div className="eyebrow">
              <span className="gold-dash" />
              {region.country}
              <span className="dim"> / </span>
              {living ? 'LIVING WORLD' : peru ? 'THE ANDES' : 'TERRAIN STUDY'}
            </div>
            <h1>
              {region.name}
              <span>.</span>
            </h1>
            <p>
              {living
                ? 'Come closer. There is a world in the valley.'
                : region.subtitle}
            </p>
            {living && (
              <div className="world-destinations" aria-label="Explore Peru">
                <label className="destination-picker">
                  <MapPin size={14} />
                  <select
                    aria-label="Fly to a place"
                    disabled={!ready}
                    value=""
                    onChange={(e) => exploreWorldPlace(e.target.value)}
                  >
                    <option value="" disabled>
                      Fly to a place…
                    </option>
                    {peruWorldRegion.places.map((place) => (
                      <option key={place.id} value={place.id}>
                        {place.name}
                      </option>
                    ))}
                  </select>
                </label>
                <span className="connected-world">ONE PERU LANDSCAPE</span>
              </div>
            )}
            <div className="journey-actions">
              {peru && (
                <button disabled={!ready} onClick={openTrain}>
                  Ride the train
                </button>
              )}

              {peru && (
                <button
                  disabled={!ready}
                  onClick={() => {
                    pauseMotion();
                    showChapter(0);
                  }}
                >
                  <BookOpen size={14} /> Explore the valley
                </button>
              )}
              {region.places.length > 1 && (
                <button
                  disabled={!ready}
                  aria-pressed={profile}
                  onClick={() => {
                    pauseMotion();
                    setProfile(!profile);
                    setSelected(null);
                    setChapterIndex(null);
                  }}
                >
                  <Layers3 size={14} /> Read the landscape
                </button>
              )}
            </div>
          </div>
          <div className="scene-badge">
            <span className="status-dot" />{' '}
            {living ? 'REAL PLACES · ILLUSTRATIVE LIFE' : 'REAL ELEVATION DATA'}
          </div>
          <div className="terrain-host" ref={host} />
          {travelOpen && living && ready && (
            <TravelPanel
              getAPI={getTravelAPI}
              onResumeWorld={() => patchOptions({ worldPaused: false })}
              onClose={closeTrain}
            />
          )}

          {!ready && !error && (
            <output className="loading">
              <Mountain size={30} />
              <span>
                {living
                  ? 'Opening a world in the valley'
                  : 'Bringing the mountains into relief'}
              </span>
              <div className="loading-line" />
            </output>
          )}
          {error && (
            <div className="loading error" role="alert">
              <Mountain />
              <p>{error}</p>
              <button onClick={() => window.location.reload()}>
                Reload terrain
              </button>
            </div>
          )}
          <div className="map-tools">
            {living && (
              <button
                aria-label={
                  options.worldPaused
                    ? 'Resume world motion'
                    : 'Pause world motion'
                }
                title={options.worldPaused ? 'Resume world' : 'Pause world'}
                aria-pressed={options.worldPaused}
                onClick={toggleWorldPause}
              >
                {options.worldPaused ? <Play size={17} /> : <Pause size={17} />}
              </button>
            )}
            <button
              aria-label="Reset camera"
              title="Reset camera"
              onClick={() => {
                pauseMotion();
                setSelected(null);
                setChapterIndex(null);
                api.current?.focus();
              }}
            >
              <RotateCcw size={17} />
            </button>
            <button
              aria-label={options.orbit ? 'Pause orbit' : 'Orbit terrain'}
              title="Slow orbit"
              className={options.orbit ? 'is-on' : ''}
              onClick={() => {
                setTour(false);
                patchOptions({ orbit: !options.orbit });
              }}
            >
              {options.orbit ? <Pause size={17} /> : <Play size={17} />}
            </button>
            <span />
            <button
              aria-label={zen ? 'Exit gallery mode' : 'Gallery mode'}
              title="Gallery mode"
              onClick={() => setZen(!zen)}
            >
              {zen ? <X size={17} /> : <Expand size={17} />}
            </button>
            <button
              aria-label="Save terrain image"
              title="Save transparent PNG"
              disabled={!ready}
              onClick={() => api.current?.export()}
            >
              <Download size={17} />
            </button>
          </div>
          <div className="earth-navigation" aria-label="Map navigation">
            <button
              title="North up"
              aria-label="North up"
              onClick={() => moveCamera('north')}
            >
              N
            </button>
            <button
              title={flatView ? 'Tilt to 3D' : 'Top-down 2D view'}
              aria-label="Toggle 2D or 3D view"
              onClick={() => moveCamera('tilt')}
            >
              {flatView ? '3D' : '2D'}
            </button>
            <span />
            <button
              title="Zoom in"
              aria-label="Zoom in"
              onClick={() => moveCamera('in')}
            >
              <Plus size={18} />
            </button>
            <button
              title="Zoom out"
              aria-label="Zoom out"
              onClick={() => moveCamera('out')}
            >
              <Minus size={18} />
            </button>
          </div>
          <div className="north-indicator">
            <span>N</span>
            <Compass size={28} strokeWidth={1} />
            <small>MODEL NORTH</small>
          </div>
          <div className="scene-bottom">
            <span>
              WASD / ARROWS PAN <i>·</i> SCROLL ZOOMS <i>·</i> SHIFT-DRAG ORBITS
            </span>
            <span>
              {meta
                ? `${Math.round(meta.min).toLocaleString()} — ${Math.round(meta.max).toLocaleString()} m`
                : 'ELEVATION'}{' '}
              <i>/</i>{' '}
              {living
                ? 'TRUE VERTICAL SCALE'
                : `${options.exaggeration.toFixed(1)}× RELIEF`}
            </span>
          </div>
          {selected && !profile && (
            <div className="place-card">
              <button
                className="close-card"
                aria-label="Close place"
                onClick={() => setSelected(null)}
              >
                <X size={15} />
              </button>
              {selected.photo && (
                <figure className="place-photo">
                  <Image
                    src={selected.photo.url}
                    alt={selected.photo.alt}
                    width={960}
                    height={540}
                    unoptimized
                  />
                  <figcaption>
                    <a
                      href={selected.photo.source}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {selected.photo.author} · {selected.photo.license}
                    </a>
                  </figcaption>
                </figure>
              )}
              <span className="eyebrow">{selected.kind}</span>
              <h2>{selected.name}</h2>
              <p>{selected.note}</p>
              {selected.source && (
                <a
                  className="place-source"
                  href={selected.source}
                  target="_blank"
                  rel="noreferrer"
                >
                  Place source <ArrowUpRight size={12} />
                </a>
              )}
              <div className="place-meta">
                <span>
                  {Math.round(
                    sample(selected.lon, selected.lat),
                  ).toLocaleString()}{' '}
                  m <small>sampled terrain</small>
                </span>
                <a
                  target="_blank"
                  rel="noreferrer"
                  href={googleMapsUrl(selected)}
                >
                  Google Maps <ArrowUpRight size={13} />
                </a>
              </div>
            </div>
          )}
          {chapter && !profile && !travelOpen && (
            <div className="chapter-caption" aria-live="polite">
              <span className="eyebrow">
                CHAPTER{' '}
                {String(chapterIndex! + 1).padStart(2, '0')} /{' '}
                {String(chapters.length).padStart(2, '0')}
              </span>
              <h2>{chapter.title}</h2>
              <p>{chapter.eyebrow}</p>
              <div className="chapter-nav">
                <button
                  aria-label="Previous chapter"
                  disabled={chapterIndex === 0 || !ready}
                  onClick={() => {
                    setTour(false);
                    showChapter(chapterIndex! - 1);
                  }}
                >
                  <ArrowLeft size={16} />
                </button>
                <span>{tour ? 'PLAYING' : 'EXPLORE AT YOUR PACE'}</span>
                <button
                  aria-label="Next chapter"
                  disabled={chapterIndex === chapters.length - 1 || !ready}
                  onClick={() => {
                    setTour(false);
                    showChapter(chapterIndex! + 1);
                  }}
                >
                  <ArrowRight size={16} />
                </button>
              </div>
            </div>
          )}
          {profile && (
            <div className="profile-card">
              <div className="profile-heading">
                <span id="profile-label">Across the mountains</span>
                <button
                  aria-label="Close elevation profile"
                  onClick={() => {
                    setProfile(false);
                    api.current?.probe();
                  }}
                >
                  <X size={15} />
                </button>
              </div>
              <div className="profile-route">
                <span>{startPlace.name} →</span>
                <NativeSelect
                  aria-label="Elevation profile destination"
                  value={endPlace.id}
                  onChange={(e) => setEndId(e.target.value)}
                >
                  {region.places
                    .filter((p) => p.id !== startPlace.id)
                    .map((p) => (
                      <NativeSelectOption value={p.id} key={p.id}>
                        {p.name}
                      </NativeSelectOption>
                    ))}
                </NativeSelect>
                <strong>
                  {distanceKm(startPlace, endPlace).toFixed(1)} km
                </strong>
              </div>
              <svg
                aria-label="Elevation cross-section"
                viewBox="0 0 600 100"
                preserveAspectRatio="none"
                onPointerMove={(e) => {
                  const box = e.currentTarget.getBoundingClientRect();
                  inspect(
                    Math.max(
                      0,
                      Math.min(1, (e.clientX - box.left) / box.width),
                    ),
                  );
                }}
              >
                <defs>
                  <linearGradient id="profile-fill" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0%" stopColor="#c2ad79" stopOpacity=".35" />
                    <stop offset="100%" stopColor="#c2ad79" stopOpacity="0" />
                  </linearGradient>
                </defs>
                <path
                  d={`${profilePath} L600,100 L0,100 Z`}
                  fill="url(#profile-fill)"
                />
                <path
                  d={profilePath}
                  fill="none"
                  stroke="#cbb785"
                  strokeWidth="1.7"
                />
                <line
                  x1={scrub * 600}
                  x2={scrub * 600}
                  y1="0"
                  y2="100"
                  stroke="#e9d3a1"
                  strokeDasharray="3 3"
                />
              </svg>
              <div className="profile-reading">
                <span>
                  {Math.round(
                    profileSamples[Math.round(scrub * 180)] ?? 0,
                  ).toLocaleString()}{' '}
                  m
                </span>
                <span>STRAIGHT-LINE TERRAIN SECTION · NOT A TRAVEL ROUTE</span>
              </div>
              <Slider
                aria-labelledby="profile-label"
                min={0}
                max={1}
                step={1 / 180}
                value={[scrub]}
                onValueChange={(v) => inspect(Array.isArray(v) ? v[0] : v)}
              />
            </div>
          )}
        </section>
        <aside className="controls" aria-label="Map controls">
          <button
            className="sheet-handle"
            aria-label={sheetOpen ? 'Collapse controls' : 'Expand controls'}
            aria-expanded={sheetOpen}
            onClick={() => setSheetOpen(!sheetOpen)}
          >
            <span />
            <ChevronUp size={16} />
          </button>
          <div className="panel-tabs" role="tablist" aria-label="Map controls">
            {(
              [
                ['look', 'Look', SlidersHorizontal],
                ['layers', 'Layers', Layers3],
                ['story', 'Story', BookOpen],
              ] as const
            ).map(([id, label, Icon]) => (
              <button
                role="tab"
                id={`tab-${id}`}
                aria-controls={`panel-${id}`}
                aria-selected={panel === id}
                tabIndex={panel === id ? 0 : -1}
                onKeyDown={(e) => {
                  const order: Panel[] = ['look', 'layers', 'story'];
                  const index = order.indexOf(id);
                  const next =
                    e.key === 'ArrowRight'
                      ? order[(index + 1) % 3]
                      : e.key === 'ArrowLeft'
                        ? order[(index + 2) % 3]
                        : e.key === 'Home'
                          ? 'look'
                          : e.key === 'End'
                            ? 'story'
                            : null;
                  if (next) {
                    e.preventDefault();
                    selectPanel(next);
                    document.getElementById(`tab-${next}`)?.focus();
                  }
                }}
                key={id}
                onClick={() => selectPanel(id)}
              >
                <Icon size={15} />
                {label}
              </button>
            ))}
          </div>
          <div
            className="panel-body"
            role="tabpanel"
            id={`panel-${panel}`}
            aria-labelledby={`tab-${panel}`}
          >
            {panel === 'look' && (
              <>
                <div className="panel-intro">
                  <span className="eyebrow">
                    {living ? 'LIGHT & ATMOSPHERE' : 'LIGHT & FORM'}
                  </span>
                  <h2>
                    {living ? 'The valley, alive.' : 'Find a new perspective.'}
                  </h2>
                </div>
                {living ? (
                  <>
                    <div className="preset-buttons world-presets">
                      {(
                        [
                          [6.5, 'Dawn', Sunrise],
                          [14, 'Day', Sun],
                          [17.5, 'Dusk', Sunset],
                          [22, 'Night', Moon],
                        ] as const
                      ).map(([hour, label, Icon]) => (
                        <button
                          key={label}
                          aria-pressed={
                            Math.abs(options.timeOfDay - hour) < 0.2
                          }
                          onClick={() =>
                            patchOptions({ timeOfDay: hour, dayCycle: false })
                          }
                        >
                          <Icon size={19} strokeWidth={1.3} />
                          <span>{label}</span>
                        </button>
                      ))}
                    </div>
                    <Range
                      label="Time of day"
                      min={0}
                      max={24}
                      step={0.25}
                      value={options.timeOfDay}
                      formatValue={formatWorldTime}
                      onChange={(timeOfDay) =>
                        patchOptions({ timeOfDay, dayCycle: false })
                      }
                    />
                    <Toggle
                      label="Day / night cycle"
                      detail="Four minutes per day at 1× world speed"
                      checked={options.dayCycle}
                      onChange={(dayCycle) => patchOptions({ dayCycle })}
                    >
                      <Sunset size={17} />
                    </Toggle>
                    <label className="section-label world-speed">
                      World speed
                      <select
                        aria-label="World speed"
                        value={options.worldSpeed}
                        onChange={(event) =>
                          patchOptions({
                            worldSpeed: Number(event.target.value),
                          })
                        }
                      >
                        {[0.25, 0.5, 1, 2, 4, 8].map((speed) => (
                          <option key={speed} value={speed}>
                            {speed}×
                          </option>
                        ))}
                      </select>
                    </label>
                    <div className="weather-section">
                      <Toggle
                        label="Clouds"
                        detail="Soft cloud banks above the valley"
                        checked={options.clouds}
                        onChange={(clouds) => patchOptions({ clouds })}
                      >
                        <Cloud size={18} />
                      </Toggle>
                      <span className="section-label">Weather</span>
                      <div className="weather-buttons">
                        {(
                          [
                            ['clear', 'Clear', Sun],
                            ['cloudy', 'Cloudy', Cloud],
                            ['mist', 'Valley mist', CloudFog],
                            ['rain', 'Rain', CloudRain],
                          ] as const
                        ).map(([weather, label, Icon]) => (
                          <button
                            key={weather}
                            aria-pressed={options.weather === weather}
                            onClick={() => patchOptions({ weather })}
                          >
                            <Icon size={17} />
                            <span>{label}</span>
                          </button>
                        ))}
                      </div>
                      {options.weather !== 'clear' && (
                        <Range
                          label="Weather intensity"
                          min={0.1}
                          max={1}
                          step={0.1}
                          value={options.weatherIntensity}
                          onChange={(weatherIntensity) =>
                            patchOptions({ weatherIntensity })
                          }
                        />
                      )}
                    </div>
                    <button className="world-pause" onClick={toggleWorldPause}>
                      {options.worldPaused ? (
                        <Play size={15} />
                      ) : (
                        <Pause size={15} />
                      )}{' '}
                      {options.worldPaused ? 'Resume world' : 'Pause world'}
                    </button>
                    <p className="hint">
                      Controllable light, weather, and illustrative activity. No
                      live conditions. Terrain stays at true vertical scale.
                    </p>
                  </>
                ) : (
                  <>
                    <div className="preset-buttons">
                      {(
                        [
                          ['dawn', 'Dawn', Sunrise],
                          ['daylight', 'Day', Sun],
                          ['dusk', 'Dusk', Sunset],
                        ] as const
                      ).map(([id, label, Icon]) => (
                        <button
                          key={id}
                          aria-pressed={options.preset === id}
                          onClick={() => {
                            setTour(false);
                            patchOptions({ preset: id, ...lightPresets[id] });
                          }}
                        >
                          <Icon size={19} strokeWidth={1.3} />
                          <span>{label}</span>
                        </button>
                      ))}
                    </div>
                    <Range
                      label="Light direction"
                      min={0}
                      max={360}
                      value={options.light}
                      suffix="°"
                      onChange={(light) => {
                        setTour(false);
                        patchOptions({ light, preset: 'custom' });
                      }}
                    />
                    <Range
                      label="Sun height"
                      min={5}
                      max={80}
                      value={options.sunHeight}
                      suffix="°"
                      onChange={(sunHeight) => {
                        setTour(false);
                        patchOptions({ sunHeight, preset: 'custom' });
                      }}
                    />
                    <div className="control-section">
                      <Range
                        label="Vertical relief"
                        min={1}
                        max={5}
                        step={0.1}
                        value={options.exaggeration}
                        suffix="×"
                        onChange={(exaggeration) =>
                          patchOptions({ exaggeration })
                        }
                      />
                      <div className="range-labels">
                        <button
                          onClick={() => patchOptions({ exaggeration: 1 })}
                        >
                          True scale
                        </button>
                        <span>Sculpted</span>
                      </div>
                    </div>
                    <div className="control-section">
                      <span className="section-label">Material</span>
                      <div className="materials">
                        {[
                          ['atlas', 'Atlas'],
                          ['copper', 'Copper'],
                          ['alabaster', 'Stone'],
                        ].map(([id, name]) => (
                          <button
                            key={id}
                            onClick={() => patchOptions({ palette: id })}
                            aria-pressed={options.palette === id}
                          >
                            <span className={`swatch ${id}`} />
                            <small>{name}</small>
                          </button>
                        ))}
                      </div>
                    </div>
                    <Toggle
                      label="Valley atmosphere"
                      detail="Subtle depth & drifting mist"
                      checked={options.atmosphere}
                      onChange={(atmosphere) => patchOptions({ atmosphere })}
                    >
                      <Waves size={17} />
                    </Toggle>
                    <button className="dawn-button" onClick={firstLight}>
                      <Sunrise size={19} />
                      <span>Dawn at Machu Picchu</span>
                      <ArrowUpRight size={14} />
                    </button>
                    <p className="hint">
                      Artistic light and atmosphere. No weather or sun-position
                      forecast.
                    </p>
                  </>
                )}
                <Toggle
                  label="Reduce motion"
                  detail={
                    reducedMotion
                      ? 'Enabled by your device'
                      : 'Still views & instant transitions'
                  }
                  checked={reducedMotion || options.reduceMotion}
                  disabled={reducedMotion}
                  onChange={(reduceMotion) => {
                    setTour(false);
                    patchOptions({ reduceMotion, orbit: false });
                  }}
                >
                  <Pause size={17} />
                </Toggle>
                <div className="quality-row">
                  <label htmlFor="quality">Render quality</label>
                  <NativeSelect
                    id="quality"
                    value={options.quality}
                    onChange={(e) =>
                      patchOptions({
                        quality: e.target.value as TerrainOptions['quality'],
                      })
                    }
                  >
                    <NativeSelectOption value="balanced">
                      Balanced
                    </NativeSelectOption>
                    <NativeSelectOption value="high">
                      High detail
                    </NativeSelectOption>
                  </NativeSelect>
                </div>
              </>
            )}
            {panel === 'layers' && (
              <>
                <div className="panel-intro">
                  <span className="eyebrow">READ THE LAND</span>
                  <h2>More than mountains.</h2>
                  <p>Reveal the geography beneath the view.</p>
                </div>
                {living && (
                  <div className="world-layer-list">
                    {(
                      [
                        [
                          'buildings',
                          'Buildings',
                          'Mapped footprints, modeled roofs',
                          Building2,
                        ],
                        [
                          'ruins',
                          'Ruins',
                          'Present-day walls & terraces',
                          Landmark,
                        ],
                        ['trees', 'Trees', 'Canopy-guided placement', Trees],
                        [
                          'vegetation',
                          'Ground vegetation',
                          'Grass, shrubs & cultivated land',
                          Sprout,
                        ],
                        [
                          'animals',
                          'Animals & birds',
                          'Sparse illustrative life',
                          Bird,
                        ],
                        ['people', 'People', 'Following mapped paths', Users],
                        [
                          'vehicles',
                          'Vehicles',
                          'Following drivable roads',
                          Car,
                          Plus,
                          Minus,
                        ],
                      ] as const
                    ).map(([key, label, detail, Icon]) => (
                      <Toggle
                        key={key}
                        label={label}
                        detail={detail}
                        checked={options[key]}
                        onChange={(value) => patchOptions({ [key]: value })}
                      >
                        <Icon size={18} />
                      </Toggle>
                    ))}
                    <span className="section-label geography-divider">
                      Geographic layers
                    </span>
                  </div>
                )}
                {peru ? (
                  <>
                    <Toggle
                      label="Rivers & water"
                      detail="The shape of the valley"
                      checked={options.water}
                      onChange={(water) => patchOptions({ water })}
                    >
                      <Waves size={18} />
                    </Toggle>
                    <Toggle
                      label="Settlements"
                      detail="Towns along the landscape"
                      checked={options.settlements}
                      onChange={(settlements) => patchOptions({ settlements })}
                    >
                      <MapPin size={18} />
                    </Toggle>
                    <Toggle
                      label="Inca sites"
                      detail="Places with a deeper story"
                      checked={options.history}
                      onChange={(history) => patchOptions({ history })}
                    >
                      <Landmark size={18} />
                    </Toggle>
                  </>
                ) : (
                  <p className="region-notice">
                    Geographic layers are available in the two Peru studies.
                    This region uses the new terrain materials and lighting.
                  </p>
                )}
                <div className="control-section">
                  <Toggle
                    label="Contour lines"
                    checked={options.contours}
                    onChange={(contours) => patchOptions({ contours })}
                  >
                    <Layers3 size={17} />
                  </Toggle>
                  <Toggle
                    label="Place names"
                    checked={options.labels}
                    onChange={(labels) => patchOptions({ labels })}
                  >
                    <MapPin size={17} />
                  </Toggle>
                </div>
                {peru && (
                  <p className="source-note">
                    © OpenStreetMap contributors · ODbL
                    <br />
                    <a href={`/layers/${regionId}-osm-source.json`} download>
                      Download geographic extract <Download size={12} />
                    </a>
                  </p>
                )}
                <div className="places-section">
                  <span className="eyebrow">PLACES TO WANDER</span>
                  {region.places.map((p, i) => (
                    <button
                      className={`place-row ${selected?.id === p.id ? 'active' : ''}`}
                      key={p.id}
                      onClick={() => {
                        choose(p);
                        setSheetOpen(false);
                      }}
                    >
                      <span>{String(i + 1).padStart(2, '0')}</span>
                      {p.name}
                      <ArrowUpRight size={12} />
                    </button>
                  ))}
                </div>
              </>
            )}
            {panel === 'story' && (
              <>
                <div className="panel-intro">
                  <span className="eyebrow">SIX CHAPTERS / PERU</span>
                  <h2>A valley, unfolding.</h2>
                  <p>Follow the landscape from the high basin to the deep river gorge.</p>
                </div>
                <div className="chapter-list">
                  {chapters.map((c, i) => (
                    <button
                      key={c.id}
                      className={chapterIndex === i ? 'active' : ''}
                      aria-pressed={chapterIndex === i}
                      onClick={() => {
                        setTour(false);
                        showChapter(i);
                        setSheetOpen(false);
                      }}
                    >
                      <span>{String(i + 1).padStart(2, '0')}</span>
                      <div>
                        <strong>{c.title}</strong>
                        <small>
                          {c.eyebrow}
                          {c.status === 'optional' ? ' · OPTIONAL' : ''}
                        </small>
                      </div>
                      <ChevronRight size={14} />
                    </button>
                  ))}
                </div>
                {chapter && (
                  <ChapterDetails
                    chapter={chapter}
                    place={chapterPlace || undefined}
                    onExplore={exploreWorldPlace}
                  />
                )}
                <button
                  className="autoplay-button"
                  disabled={!ready}
                  onClick={() => {
                    if (tour) setTour(false);
                    else {
                      if (
                        chapterIndex === null ||
                        chapterIndex === chapters.length - 1
                      )
                        showChapter(0);
                      setTour(true);
                    }
                  }}
                >
                  {tour ? <Pause size={15} /> : <Play size={15} />}{' '}
                  {tour ? 'Pause chapters' : 'Play all chapters'}
                </button>
                <p className="hint">
                  An interpretive journey, not an itinerary or mapped travel route. Move the terrain to pause playback.
                </p>
                {(reducedMotion || options.reduceMotion) && (
                  <p className="hint">
                    Reduced motion is on. Camera transitions and atmospheric
                    animation are reduced.
                  </p>
                )}
              </>
            )}
            <div className="data-note">
              <span className="eyebrow">
                {living
                  ? 'REAL GEOGRAPHY. A WORLD TO EXPLORE.'
                  : 'REAL TERRAIN. A LITTLE EXAGGERATION.'}
              </span>
              {meta && (
                <p>
                  {living
                    ? 'Detailed areas · ~16 m terrain / 10 m land cover'
                    : `${meta.n.toLocaleString()}² samples · ~${meta.sampleSpacingMeters} m spacing`}
                  <br />
                  <small>Grid spacing is not survey accuracy.</small>
                </p>
              )}
              <button onClick={() => setAbout(true)}>
                Data & credits <ArrowUpRight size={12} />
              </button>
            </div>
          </div>
        </aside>
      </div>
      <footer>
        <span>THE ANDES ARE BETTER IN PERSON. THIS IS A START.</span>
        <span>
          A CINEMATIC ATLAS <i>/</i> LIVING RELIEF · LIVING WORLD
        </span>
      </footer>
      <Dialog open={about} onOpenChange={setAbout}>
        <DialogContent className="about-card">
          <Mountain size={30} />
          <DialogTitle>A collection of places.</DialogTitle>
          <DialogDescription>
            Explore the terrain, waterways, and cultural landscapes of an
            interactive atlas built from geographic data.
          </DialogDescription>
          <p>
            Elevation:{' '}
            <a
              href="https://registry.opendata.aws/terrain-tiles/"
              target="_blank"
              rel="noreferrer"
            >
              Mapzen Terrain Tiles on AWS
            </a>
            . USGS SRTM, GMTED2010 and 3DEP; NOAA ETOPO1.{' '}
            <a
              href="https://github.com/tilezen/joerd/blob/master/docs/attribution.md"
              target="_blank"
              rel="noreferrer"
            >
              Full elevation attribution.
            </a>
          </p>
          <p>
            Land cover:{' '}
            <a
              href="https://esa-worldcover.org/en/data-access"
              target="_blank"
              rel="noreferrer"
            >
              ESA WorldCover 2021 v200
            </a>
            , CC BY 4.0. Source classification at 10 m, resampled for this
            atlas. © ESA WorldCover project 2021 / Contains modified Copernicus
            Sentinel data (2021) processed by ESA WorldCover consortium. ©{' '}
            <a
              href="https://www.openstreetmap.org/copyright"
              target="_blank"
              rel="noreferrer"
            >
              OpenStreetMap contributors
            </a>
            , ODbL. Geographic layers are bundled extracts, not live maps.
          </p>
          <p>
            Place photographs: Wikimedia Commons contributors. Author and
            license appear on each photograph.{' '}
            <a
              href="/place-photos/photo-attribution.json"
              target="_blank"
              rel="noreferrer"
            >
              Full photo credits and dates.
            </a>
          </p>
          <p>
            Heights and landmark positions are approximate. Vertical
            exaggeration changes the view, never the elevation readings.
            Lighting and mist are artistic. Sea level is flat; underwater relief
            is not shown.
          </p>
          <p>
            Chapter sources link to UNESCO and official Peruvian cultural or
            tourism inventories. Living World adds modeled buildings and
            present-day archaeological forms; roof shapes, missing building
            heights, vegetation appearance, and animated activity are
            illustrative. Mapped walls and terraces follow approximate terrain;
            they do not come from a 3D archaeological survey. Terrace tread
            widths and wall heights are illustrative. Chapters are not
            navigation instructions.
          </p>
          <p>
            Living World tree coverage and height derive from{' '}
            <a
              href="https://registry.opendata.aws/dataforgood-fb-forestsv2/"
              target="_blank"
              rel="noreferrer"
            >
              Meta / WRI CHMv2
            </a>
            , CC BY 4.0, 2026 release. Canopy observations date to September
            2019 around Urubamba and May 2018 around Machu Picchu; source
            imagery © Vantor. Detected canopy is not an inventory of individual
            tree species or exact trunks. Buildings combine OSM with{' '}
            <a
              href="https://github.com/microsoft/GlobalMLBuildingFootprints"
              target="_blank"
              rel="noreferrer"
            >
              Microsoft building footprints
            </a>
            , CDLA Permissive 2.0. Source dates and model limitations are in the{' '}
            <a href="/world/manifest.json" target="_blank" rel="noreferrer">
              world data manifest
            </a>{' '}
            and{' '}
            <a href="/world/README.md" target="_blank" rel="noreferrer">
              source and modeling notes
            </a>
            .
          </p>
          <small>
            {meta
              ? `Current grid: ${meta.n} × ${meta.n} · approximately ${meta.sampleSpacingMeters} m spacing.`
              : ''}
          </small>
        </DialogContent>
      </Dialog>
    </main>
  );
}
