'use client';
import { useEffect, useEffectEvent, useRef, useState } from 'react';
import {
  Armchair,
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronDown,
  ChevronUp,
  Clock3,
  Compass,
  Maximize2,
  Pause,
  Play,
  RotateCcw,
  SkipForward,
  SlidersHorizontal,
  TrainFront,
  X,
} from 'lucide-react';
import type { Journey, TravelAPI, TravelState } from '@/lib/travel';

const playbackSpeeds = [0.5, 1, 2, 5, 10, 15, 30, 60, 120, 240];
const views = [
  { id: 'window', label: 'Window seat', short: 'Window', icon: Armchair },
  { id: 'onboard', label: 'Driver’s cab', short: 'Driver', icon: TrainFront },
  { id: 'ride', label: 'Follow the train', short: 'Follow', icon: Maximize2 },
  { id: 'overview', label: 'Valley view', short: 'Above', icon: Compass },
] as const;
const duration = (seconds: number) =>
  seconds < 60
    ? `${seconds}s`
    : `${Math.floor(seconds / 60)}m ${String(seconds % 60).padStart(2, '0')}s`;

export function TravelPanel({
  getAPI,
  onClose,
  onResumeWorld,
}: {
  getAPI: () => TravelAPI | undefined;
  onClose: () => void;
  onResumeWorld: () => void;
}) {
  const api = useRef<TravelAPI | undefined>(undefined);
  const [journey, setJourney] = useState<Journey | null>(null);
  const [state, setState] = useState<TravelState | null>(null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const [veil, setVeil] = useState(false);
  const [seeking, setSeeking] = useState<number | null>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => {
    const controller = new AbortController(),
      renderer = getAPI()!;
    api.current = renderer;
    fetch('/travel/ollantaytambo-aguas.json', { signal: controller.signal })
      .then((response) => {
        if (!response.ok)
          throw new Error('The train route could not load. Please retry.');
        return response.json() as Promise<Journey>;
      })
      .then((route) => {
        if (controller.signal.aborted) return;
        setJourney(route);
        renderer.load(route, setState);
        renderer.configure({
          view: 'window',
          speed: 10,
          paused: true,
          showRoute: false,
        });
      })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted)
          setError(
            reason instanceof Error
              ? reason.message
              : 'The train route could not load. Please retry.',
          );
      });
    return () => {
      controller.abort();
      timers.current.forEach(clearTimeout);
      renderer.stop();
    };
  }, [attempt, getAPI]);

  const dissolve = (action: () => void) => {
    timers.current.forEach(clearTimeout);
    if (state?.reducedMotion) {
      action();
      return;
    }
    setVeil(true);
    timers.current = [
      setTimeout(() => {
        action();
        timers.current.push(setTimeout(() => setVeil(false), 160));
      }, 220),
    ];
  };
  const seek = (progress: number) => {
    setSeeking(progress);
    dissolve(() => {
      api.current?.seek(progress);
      setSeeking(null);
    });
  };
  const chooseView = (view: TravelState['view']) => {
    setSeeking(null);
    dissolve(() => api.current?.configure({ view }));
  };
  const playback = () => {
    if (!state || state.reducedMotion) return;
    onResumeWorld();
    if (state.complete) {
      dissolve(() => {
        api.current?.seek(0);
        api.current?.configure({ view: 'window' });
      });
      return;
    }
    api.current?.configure({ paused: !state.paused });
  };
  const keyboard = useEffectEvent((event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      dissolve(onClose);
      return;
    }
    if (
      event.metaKey ||
      event.ctrlKey ||
      event.altKey ||
      (event.target as HTMLElement).closest(
        'input, button, select, textarea, [contenteditable]',
      )
    )
      return;
    if (event.code === 'Space') {
      event.preventDefault();
      if (!event.repeat) playback();
    }
    if (/^Digit[1-4]$/.test(event.code)) {
      event.preventDefault();
      if (!event.repeat) chooseView(views[Number(event.code.slice(-1)) - 1].id);
    }
  });
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => keyboard(event);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const progress = seeking ?? state?.progress ?? 0;
  const seconds =
    journey && state
      ? Math.ceil((journey.distance * (1 - progress)) / (10 * state.speed))
      : 0;
  const boarding = state?.phase === 'boarding';
  const inside = state?.view === 'window' || state?.view === 'onboard';
  const status = !state
    ? 'Preparing your carriage'
    : state.complete
      ? 'Welcome to Aguas Calientes'
      : boarding
        ? 'At the platform'
        : state.phase === 'departing'
          ? 'Leaving the station'
          : state.paused
            ? 'A moment in the valley'
            : 'Along the Urubamba';
  const playLabel = state?.complete
    ? 'Board again'
    : boarding
      ? 'Depart when ready'
      : state?.paused
        ? 'Resume journey'
        : 'Pause journey';

  return (
    <div
      className={`train-experience ${state?.reducedMotion ? 'reduced-motion' : ''}`}
      data-view={state?.view}
    >
      <div className="train-entry" aria-hidden="true" />
      <div
        className={`train-veil ${veil ? 'is-visible' : ''} ${state?.transitioning ? 'is-switching' : ''}`}
        aria-hidden="true"
      />
      <div
        className={`train-tunnel ${state?.inTunnel && inside ? 'is-visible' : ''}`}
        aria-hidden="true"
      >
        <span>THROUGH THE MOUNTAIN</span>
      </div>
      <header className="train-header">
        <div>
          <span className="train-kicker">
            <TrainFront size={15} /> LIVING RELIEF <i /> THE RAIL JOURNEY
          </span>
          <h1>
            Ollantaytambo <span>→</span> Aguas Calientes
          </h1>
          <p>
            {journey
              ? `${(journey.distance / 1000).toFixed(1)} km`
              : 'The Sacred Valley'}{' '}
            <span>·</span> A window into the Andes
          </p>
        </div>
        <button
          className="train-exit"
          onClick={() => dissolve(onClose)}
          aria-label="Exit train ride"
        >
          <X size={18} />
          <span>Back to the map</span>
        </button>
      </header>
      {boarding && (
        <div className="train-welcome">
          <span className="train-kicker">YOUR SEAT IS READY</span>
          <h2>Let the valley come to you.</h2>
          <p>
            Settle in. Look around.
            <br />
            The train leaves when you’re ready.
          </p>
        </div>
      )}
      {inside && state && (
        <fieldset className="train-look" aria-label="Look around the train">
          <button
            aria-label="Look left"
            onClick={() => api.current?.look(-0.3, 0)}
          >
            <ArrowLeft size={17} />
          </button>
          <button
            aria-label="Center train view"
            onClick={() => api.current?.configure({ view: state.view })}
          >
            <RotateCcw size={15} />
          </button>
          <button
            aria-label="Look right"
            onClick={() => api.current?.look(0.3, 0)}
          >
            <ArrowRight size={17} />
          </button>
        </fieldset>
      )}
      <section
        className={`train-dock ${expanded ? 'is-expanded' : ''}`}
        aria-label="Train ride"
      >
        {error ? (
          <div className="train-error">
            <p role="alert">{error}</p>
            <button
              onClick={() => {
                setError('');
                setAttempt(attempt + 1);
              }}
            >
              Retry train
            </button>
          </div>
        ) : !state ? (
          <div className="train-preparing">
            <span className="train-status-dot" />
            <output>Preparing your window seat…</output>
          </div>
        ) : (
          <>
            <div className="train-status">
              <span>
                <i
                  className={`train-status-dot ${!state.paused ? 'is-moving' : ''}`}
                />
                {status}
              </span>
              <span className="train-remaining">
                {state.complete ? <Check size={14} /> : <Clock3 size={13} />}
                {state.complete
                  ? 'Journey complete'
                  : `${duration(seconds)} ${boarding ? 'at this pace' : 'remaining'}`}
              </span>
            </div>
            <div className="train-timeline">
              <input
                aria-label="Train journey progress"
                aria-valuetext={`${Math.round(progress * 100)} percent of the journey`}
                type="range"
                min="0"
                max="1"
                step="0.001"
                value={progress}
                style={
                  { '--progress': `${progress * 100}%` } as React.CSSProperties
                }
                onChange={(event) => seek(Number(event.target.value))}
              />
              <div>
                <span>Ollantaytambo</span>
                <span>{Math.round(progress * 100)}%</span>
                <span>Aguas Calientes</span>
              </div>
            </div>
            <div className="train-main-controls">
              <button
                className="train-play"
                disabled={state.reducedMotion}
                onClick={playback}
              >
                {state.complete ? (
                  <RotateCcw size={17} />
                ) : state.paused ? (
                  <Play size={17} fill="currentColor" />
                ) : (
                  <Pause size={17} fill="currentColor" />
                )}
                <span>{playLabel}</span>
              </button>
              <fieldset className="train-views" aria-label="Train camera">
                {views.map(({ id, label, short, icon: Icon }) => (
                  <button
                    key={id}
                    title={label}
                    aria-label={label}
                    aria-pressed={state.view === id}
                    onClick={() => chooseView(id)}
                  >
                    <Icon size={17} />
                    <span className="train-view-long">{label}</span>
                    <span className="train-view-short">{short}</span>
                  </button>
                ))}
              </fieldset>
              <button
                className="train-settings"
                aria-label="Journey settings"
                aria-expanded={expanded}
                aria-controls="train-settings"
                onClick={() => setExpanded(!expanded)}
              >
                <SlidersHorizontal size={16} />
                <span>{state.speed}×</span>
                {expanded ? <ChevronDown size={13} /> : <ChevronUp size={13} />}
              </button>
            </div>
            {expanded && (
              <div className="train-details" id="train-settings">
                <label className="train-speed">
                  <span>
                    Journey pace <output>{state.speed}×</output>
                  </span>
                  <input
                    type="range"
                    aria-label="Train playback speed"
                    min="0"
                    max={playbackSpeeds.length - 1}
                    step="1"
                    value={playbackSpeeds.indexOf(state.speed)}
                    aria-valuetext={`${state.speed} times normal speed`}
                    onChange={(event) =>
                      api.current?.configure({
                        speed: playbackSpeeds[Number(event.target.value)],
                      })
                    }
                  />
                  <span className="train-speed-limits">
                    <small>0.5× · linger</small>
                    <small>240× · fly through</small>
                  </span>
                </label>
                <div className="train-detail-actions">
                  <button onClick={() => seek(0)}>
                    <RotateCcw size={14} />
                    Back to the platform
                  </button>
                  <button disabled={state.complete} onClick={() => seek(1)}>
                    <SkipForward size={14} />
                    Skip to arrival
                  </button>
                </div>
                <p className="train-hint">
                  {inside
                    ? 'Drag or use WASD / arrows to look around.'
                    : 'Drag to pan · Shift-drag to orbit · Scroll to zoom.'}{' '}
                  <span>Space pauses · 1–4 change your view.</span>
                </p>
                <small className="train-source-note">
                  Mapped railway · illustrative carriage · simulated travel time
                </small>
              </div>
            )}
            {state.reducedMotion && (
              <p className="train-motion-note">
                Reduced motion is on. Explore with the timeline, or switch it
                off in Look to ride.
              </p>
            )}
          </>
        )}
      </section>
    </div>
  );
}
