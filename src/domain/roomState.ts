import type {MergeableContent} from 'tinybase/mergeable-store';
import type {RoomMediaState} from './media';
import type {MediaQueueState} from './mediaQueue';
import type {SessionArtifact} from './protocol';
import type {PorchMessage, RoomCueId, RoomSignal, SocialReaction, SocialRelease} from './porch';
import type {TimerState} from './timer';

export const ROOM_STATE_VERSION = 1 as const;
export const ROOM_STATE_KEY = 'porch:room-state';
export const ROOM_STATE_BACKUP_KEY = 'porch:room-state:backup:v1';

export const LEGACY_ROOM_KEYS = {
  timer: 'magma:timer',
  artifacts: 'magma:artifacts',
  phaseParticipants: 'magma:phase-participants',
  reactionCount: 'magma:reaction-count',
  media: 'magma:media',
  mediaQueue: 'magma:media-queue:v1',
  mediaQueueReceipts: 'magma:media-queue-receipts:v1',
  porchMessages: 'magma:porch-messages',
  heldSignals: 'magma:held-signals',
  heldReactions: 'magma:held-reactions',
  socialNonces: 'magma:social-nonces',
  socialRelease: 'magma:social-release',
  signalCounts: 'magma:signal-counts',
  reactionCounts: 'magma:reaction-counts',
  workspace: 'magma:workspace:v2',
} as const;

export type RoomStateField = keyof typeof LEGACY_ROOM_KEYS;
export type StoredQueueReceipt = {memberId: string; opId: string; fingerprint: string; revision: number; outcome: string};
export type RoomStateValues = {
  timer?: TimerState;
  artifacts?: SessionArtifact[];
  phaseParticipants?: SessionArtifact['participants'];
  reactionCount?: number;
  media?: RoomMediaState;
  mediaQueue?: MediaQueueState;
  mediaQueueReceipts?: StoredQueueReceipt[];
  porchMessages?: PorchMessage[];
  heldSignals?: RoomSignal[];
  heldReactions?: SocialReaction[];
  socialNonces?: string[];
  socialRelease?: SocialRelease | null;
  signalCounts?: Partial<Record<RoomCueId, number>>;
  reactionCounts?: Record<string, number>;
  workspace?: MergeableContent;
};
export type LegacyRoomStateValues = Partial<Record<RoomStateField, unknown>>;

export type StoredRoomState = {
  version: typeof ROOM_STATE_VERSION;
  persistedAt: number;
  values: RoomStateValues;
};

export type LegacyRoomStateBackup = {
  version: 1;
  source: 'production-keys';
  capturedAt: number;
  values: LegacyRoomStateValues;
};

export class UnsupportedRoomStateVersionError extends Error {
  constructor(readonly version: number) {
    super(`Porch room state version ${version} is newer than this server supports.`);
    this.name = 'UnsupportedRoomStateVersionError';
  }
}

export class InvalidRoomStateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidRoomStateError';
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const finiteTimestamp = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0;

const knownLegacyValues = (value: Record<string, unknown>): LegacyRoomStateValues => {
  const result: LegacyRoomStateValues = {};
  for (const field of Object.keys(LEGACY_ROOM_KEYS) as RoomStateField[]) {
    if (Object.prototype.hasOwnProperty.call(value, field)) result[field] = value[field];
  }
  return result;
};

const knownCurrentValues = (value: Record<string, unknown>): RoomStateValues =>
  knownLegacyValues(value) as RoomStateValues;

/** Parse the authoritative stored envelope without guessing through a future schema. */
export function parseStoredRoomState(value: unknown): StoredRoomState {
  if (!isRecord(value) || !Number.isSafeInteger(value.version)) {
    throw new InvalidRoomStateError('Porch room state is missing a valid version.');
  }
  if (value.version !== ROOM_STATE_VERSION) {
    throw new UnsupportedRoomStateVersionError(Number(value.version));
  }
  if (!finiteTimestamp(value.persistedAt) || !isRecord(value.values)) {
    throw new InvalidRoomStateError('Porch room state version 1 is malformed.');
  }
  const unknownField = Object.keys(value.values).find((field) => !(field in LEGACY_ROOM_KEYS));
  if (unknownField) throw new InvalidRoomStateError(`Porch room state version 1 contains unknown field ${unknownField}.`);
  return {version: ROOM_STATE_VERSION, persistedAt: value.persistedAt, values: knownCurrentValues(value.values)};
}

export function migrateRoomState(
  stored: unknown,
  legacyValues: LegacyRoomStateValues,
  now: number,
): {state: StoredRoomState; backup: LegacyRoomStateBackup | null; migrated: boolean} {
  if (stored !== undefined) return {state: parseStoredRoomState(stored), backup: null, migrated: false};
  if (!finiteTimestamp(now)) throw new InvalidRoomStateError('Migration time must be a finite timestamp.');
  const priorValues = knownLegacyValues(legacyValues as Record<string, unknown>);
  const values = priorValues as RoomStateValues;
  return {
    state: {version: ROOM_STATE_VERSION, persistedAt: now, values},
    backup: {version: 1, source: 'production-keys', capturedAt: now, values: priorValues},
    migrated: true,
  };
}

export function updateStoredRoomState(state: StoredRoomState, patch: RoomStateValues, now: number): StoredRoomState {
  if (!finiteTimestamp(now)) throw new InvalidRoomStateError('Persistence time must be a finite timestamp.');
  return {
    version: ROOM_STATE_VERSION,
    persistedAt: now,
    values: {...state.values, ...knownCurrentValues(patch as Record<string, unknown>)},
  };
}

export function legacyEntries(values: RoomStateValues): Record<string, unknown> {
  const entries: Record<string, unknown> = {};
  for (const [field, key] of Object.entries(LEGACY_ROOM_KEYS) as Array<[RoomStateField, string]>) {
    if (Object.prototype.hasOwnProperty.call(values, field)) entries[key] = values[field];
  }
  return entries;
}
