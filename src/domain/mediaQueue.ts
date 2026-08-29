import type {AuthRole} from './auth';
import type {YouTubeSource} from './youtube';

export const MAX_MEDIA_QUEUE_ITEMS = 32;
export type DeckPolicy = 'open' | 'stewarded';

export type MediaQueueItem = {
  id: string;
  source: YouTubeSource;
  addedById: string;
  addedByName: string;
  addedByEmoji: string;
  addedAt: number;
  sequence: number;
  origin: 'member' | 'migration';
  heldForSessionId: string | null;
};

export type MediaQueueState = {
  version: 1;
  items: MediaQueueItem[];
  activeItemId: string;
  stagedItemId: string | null;
  policy: DeckPolicy;
  revision: number;
};

export const createMediaQueue = (
  source: YouTubeSource,
  now = Date.now(),
  itemId = 'mq_room_default',
): MediaQueueState => ({
  version: 1,
  items: [{
    id: itemId, source, addedById: 'server', addedByName: 'Room', addedByEmoji: '◌', addedAt: now,
    sequence: 0, origin: 'migration',
    heldForSessionId: null,
  }],
  activeItemId: itemId,
  stagedItemId: null,
  policy: 'open',
  revision: 0,
});

const validSource = (source: unknown): source is YouTubeSource => {
  if (!source || typeof source !== 'object') return false;
  const value = source as Record<string, unknown>;
  return ['live', 'video', 'playlist'].includes(String(value.kind))
    && typeof value.id === 'string' && /^[A-Za-z0-9_-]{10,90}$/.test(value.id)
    && typeof value.label === 'string' && value.label.trim().length > 0 && value.label.length <= 80;
};

const validItem = (item: unknown): item is MediaQueueItem => {
  if (!item || typeof item !== 'object') return false;
  const value = item as Record<string, unknown>;
  return typeof value.id === 'string' && /^mq_[A-Za-z0-9_-]{8,80}$/.test(value.id)
    && validSource(value.source)
    && typeof value.addedById === 'string' && value.addedById.length > 0 && value.addedById.length <= 64
    && typeof value.addedByName === 'string' && value.addedByName.trim().length > 0 && value.addedByName.length <= 40
    && typeof value.addedByEmoji === 'string' && value.addedByEmoji.length > 0 && value.addedByEmoji.length <= 8
    && typeof value.addedAt === 'number' && Number.isFinite(value.addedAt) && value.addedAt >= 0
    && Number.isSafeInteger(value.sequence) && Number(value.sequence) >= 0
    && ['member', 'migration'].includes(String(value.origin))
    && (value.heldForSessionId === null || value.heldForSessionId === undefined
      || typeof value.heldForSessionId === 'string' && value.heldForSessionId.length > 0 && value.heldForSessionId.length <= 80);
};

export const normalizeMediaQueue = (
  value: MediaQueueState | null | undefined,
  source: YouTubeSource,
  now = Date.now(),
): MediaQueueState => {
  if (!value || !Array.isArray(value.items)) return createMediaQueue(source, now);
  const seen = new Set<string>();
  const items = value.items.filter((item) => {
    if (!validItem(item) || seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  }).slice(0, MAX_MEDIA_QUEUE_ITEMS).map((item) => ({...item, heldForSessionId: item.heldForSessionId ?? null}));
  if (items.length === 0) return createMediaQueue(source, now);
  const activeItemId = items.some((item) => item.id === value.activeItemId) ? value.activeItemId : items[0].id;
  const stagedItemId = value.stagedItemId && items.some((item) => item.id === value.stagedItemId) && value.stagedItemId !== activeItemId
    ? value.stagedItemId
    : null;
  return {
    version: 1,
    items,
    activeItemId,
    stagedItemId,
    policy: value.policy === 'stewarded' ? 'stewarded' : 'open',
    revision: Number.isSafeInteger(value.revision) ? Math.max(0, value.revision) : 0,
  };
};

export const canContributeToQueue = (role: AuthRole) => role !== 'guest';
export const canArrangeQueue = (role: AuthRole, policy: DeckPolicy) =>
  role === 'owner' || role === 'steward' || (role === 'member' && policy === 'open');
export const canSetDeckPolicy = (role: AuthRole) => role === 'owner';
export const canRemoveQueueItem = (role: AuthRole, policy: DeckPolicy, actorId: string, item: MediaQueueItem) =>
  item.origin !== 'migration' && (item.addedById === actorId || canArrangeQueue(role, policy));

export const enqueueMedia = (
  state: MediaQueueState,
  item: MediaQueueItem,
  activate: boolean,
  floor: boolean,
): MediaQueueState | null => {
  if (!validItem(item) || state.items.length >= MAX_MEDIA_QUEUE_ITEMS || state.items.some((candidate) => candidate.id === item.id)) return null;
  return {
    ...state,
    items: [...state.items, item],
    activeItemId: activate && !floor ? item.id : state.activeItemId,
    stagedItemId: activate && floor ? item.id : activate ? null : state.stagedItemId,
    revision: state.revision + 1,
  };
};

export const moveMedia = (state: MediaQueueState, itemId: string, beforeId: string | null): MediaQueueState | null => {
  if (itemId === beforeId || !state.items.some((item) => item.id === itemId)
    || (beforeId !== null && !state.items.some((item) => item.id === beforeId))) return null;
  const moving = state.items.find((item) => item.id === itemId)!;
  const remaining = state.items.filter((item) => item.id !== itemId);
  const index = beforeId === null ? remaining.length : remaining.findIndex((item) => item.id === beforeId);
  remaining.splice(index, 0, moving);
  if (remaining.every((item, itemIndex) => item.id === state.items[itemIndex]?.id)) return state;
  return {...state, items: remaining, revision: state.revision + 1};
};

export const removeMedia = (state: MediaQueueState, itemId: string): MediaQueueState | null => {
  if (itemId === state.activeItemId || itemId === state.stagedItemId || !state.items.some((item) => item.id === itemId)) return null;
  return {
    ...state,
    items: state.items.filter((item) => item.id !== itemId),
    revision: state.revision + 1,
  };
};

export const selectMedia = (state: MediaQueueState, itemId: string, floor: boolean): MediaQueueState | null => {
  if (!state.items.some((item) => item.id === itemId)) return null;
  if (floor) return state.stagedItemId === itemId ? state : {...state, stagedItemId: itemId, revision: state.revision + 1};
  if (state.activeItemId === itemId && state.stagedItemId === null) return state;
  return {...state, activeItemId: itemId, stagedItemId: null, revision: state.revision + 1};
};

export const releaseHeldMedia = (state: MediaQueueState, sessionId: string): MediaQueueState => {
  const hasHeld = state.items.some((item) => item.heldForSessionId === sessionId);
  const hasStaged = Boolean(state.stagedItemId);
  if (!hasHeld && !hasStaged) return state;
  return {
    ...state,
    items: hasHeld ? state.items.map((item) => item.heldForSessionId === sessionId ? {...item, heldForSessionId: null} : item) : state.items,
    activeItemId: state.stagedItemId ?? state.activeItemId,
    stagedItemId: null,
    revision: state.revision + 1,
  };
};

export const setDeckPolicy = (state: MediaQueueState, policy: DeckPolicy): MediaQueueState =>
  state.policy === policy ? state : {...state, policy, revision: state.revision + 1};

export const activeQueueItem = (state: MediaQueueState) =>
  state.items.find((item) => item.id === state.activeItemId) ?? state.items[0];
