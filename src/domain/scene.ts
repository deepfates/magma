import type {YouTubeSource} from './youtube';

export type SourceHealth = {
  state: 'unknown' | 'ready' | 'degraded' | 'offline';
  checkedAt: number | null;
  detail: string | null;
};

export type SourceAttribution = {label: string; url: string | null};
export type SourceCapabilities = {
  visual: boolean;
  audio: boolean;
  live: boolean;
  playPause: boolean;
  seek: boolean;
  queue: boolean;
  overlay: boolean;
};
export type SourceFallback = {adapter: 'native'; id: 'glow' | 'quiet'} | null;

export type SourceDeclaration = {
  attribution: SourceAttribution;
  capabilities: SourceCapabilities;
  health: SourceHealth;
  fallback: SourceFallback;
};

export type VisualSource = SourceDeclaration & {
  adapter: 'youtube';
  source: YouTubeSource;
};

export type RadioSource = SourceDeclaration & {
  adapter: 'direct-radio';
  id: string;
  label: string;
  streamUrl: string;
};

export type WorldOverlay = SourceDeclaration & {
  adapter: 'native-overlay';
  id: 'daylight';
  label: string;
};

export type PorchScene = {
  version: 1;
  visual: VisualSource;
  radio: RadioSource | null;
  overlays: WorldOverlay[];
  revision: number;
  changedAt: number;
  controllerId: string;
};

export type SceneCommand =
  | {type: 'radio'; radio: RadioSource | null}
  | {type: 'overlays'; overlays: WorldOverlay[]};

const unknownHealth = (): SourceHealth => ({state: 'unknown', checkedAt: null, detail: null});
const capabilities = (patch: Partial<SourceCapabilities>): SourceCapabilities => ({
  visual: false,
  audio: false,
  live: false,
  playPause: false,
  seek: false,
  queue: false,
  overlay: false,
  ...patch,
});

export const visualSource = (source: YouTubeSource): VisualSource => ({
  adapter: 'youtube',
  source,
  attribution: {
    label: 'YouTube',
    url: source.kind === 'playlist'
      ? `https://www.youtube.com/playlist?list=${source.id}`
      : `https://www.youtube.com/watch?v=${source.id}`,
  },
  capabilities: capabilities({
    visual: true,
    audio: true,
    live: source.kind === 'live',
    playPause: true,
    seek: source.kind !== 'live',
    queue: source.kind === 'playlist',
  }),
  health: unknownHealth(),
  fallback: {adapter: 'native', id: 'glow'},
});

export const KEXP_RADIO: RadioSource = {
  adapter: 'direct-radio',
  id: 'kexp-160',
  label: 'KEXP',
  streamUrl: 'https://kexp.streamguys1.com/kexp160.aac',
  attribution: {label: 'KEXP 90.3 FM', url: 'https://www.kexp.org/'},
  capabilities: capabilities({audio: true, live: true, playPause: true}),
  health: unknownHealth(),
  fallback: null,
};

export const DAYLIGHT_OVERLAY: WorldOverlay = {
  adapter: 'native-overlay',
  id: 'daylight',
  label: 'Daylight wash',
  attribution: {label: 'Porch', url: null},
  capabilities: capabilities({overlay: true}),
  health: {state: 'ready', checkedAt: null, detail: null},
  fallback: null,
};

export const createScene = (source: YouTubeSource, now = Date.now()): PorchScene => ({
  version: 1,
  visual: visualSource(source),
  radio: null,
  overlays: [],
  revision: 0,
  changedAt: now,
  controllerId: 'server',
});

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const validDeclaration = (value: Record<string, unknown>) => {
  if (!isRecord(value.attribution) || typeof value.attribution.label !== 'string'
    || !(typeof value.attribution.url === 'string' || value.attribution.url === null)
    || !isRecord(value.capabilities) || !isRecord(value.health)
    || !['unknown', 'ready', 'degraded', 'offline'].includes(String(value.health.state))) return false;
  const declaredCapabilities = value.capabilities as Record<string, unknown>;
  return ['visual', 'audio', 'live', 'playPause', 'seek', 'queue', 'overlay']
    .every((key) => typeof declaredCapabilities[key] === 'boolean');
};

export const isRadioSource = (value: unknown): value is RadioSource => {
  if (!isRecord(value) || value.adapter !== 'direct-radio' || !validDeclaration(value)) return false;
  return typeof value.id === 'string' && /^[a-zA-Z0-9-]{4,64}$/.test(value.id)
    && typeof value.label === 'string' && value.label.trim().length > 0 && value.label.length <= 80
    && typeof value.streamUrl === 'string' && value.streamUrl.startsWith('https://') && value.streamUrl.length <= 500;
};

export const isWorldOverlay = (value: unknown): value is WorldOverlay =>
  isRecord(value) && value.adapter === 'native-overlay' && value.id === 'daylight'
  && value.label === DAYLIGHT_OVERLAY.label && validDeclaration(value);

export const normalizeScene = (
  value: PorchScene | null | undefined,
  source: YouTubeSource,
  now = Date.now(),
): PorchScene => {
  if (!value || value.version !== 1 || value.visual?.adapter !== 'youtube'
    || !value.visual.source?.id || !['live', 'video', 'playlist'].includes(value.visual.source.kind)) {
    return createScene(source, now);
  }
  const radio = value.radio === null || isRadioSource(value.radio) ? value.radio : null;
  const overlays = Array.isArray(value.overlays)
    ? value.overlays.filter(isWorldOverlay).filter((item, index, all) => all.findIndex((candidate) => candidate.id === item.id) === index)
    : [];
  return {
    version: 1,
    visual: visualSource(value.visual.source),
    radio,
    overlays,
    revision: Number.isSafeInteger(value.revision) ? Math.max(0, value.revision) : 0,
    changedAt: Number.isFinite(value.changedAt) ? Math.max(0, value.changedAt) : now,
    controllerId: typeof value.controllerId === 'string' ? value.controllerId.slice(0, 64) : 'server',
  };
};

export const withVisual = (scene: PorchScene, source: YouTubeSource, now: number, controllerId: string): PorchScene => ({
  ...scene,
  visual: visualSource(source),
  revision: scene.revision + 1,
  changedAt: now,
  controllerId,
});

/** Reconcile the scene with the media deck without manufacturing a user-visible scene change. */
export const reconcileVisual = (scene: PorchScene, source: YouTubeSource): PorchScene => ({
  ...scene,
  visual: visualSource(source),
});

export const applySceneCommand = (scene: PorchScene, command: SceneCommand, now: number, controllerId: string): PorchScene => ({
  ...scene,
  ...(command.type === 'radio' ? {radio: command.radio} : {overlays: command.overlays}),
  revision: scene.revision + 1,
  changedAt: now,
  controllerId,
});
