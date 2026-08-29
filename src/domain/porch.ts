import type {TimerState} from './timer';

export type PresenceChoice = 'here' | 'ready' | 'away';
export type RoomCueId = 'smallWin' | 'breathe' | 'reset';

export type SocialReaction = {
  id: string;
  emoji: string;
  from: string;
  fromId: string;
  createdAt: number;
};

export type PorchMessage = {
  id: string;
  text: string;
  authorId: string;
  authorName: string;
  authorEmoji: string;
  createdAt: number;
  sessionId: string;
};

export type RoomSignal = {
  id: string;
  cueId: RoomCueId;
  authorId: string;
  authorName: string;
  authorEmoji: string;
  createdAt: number;
  sessionId: string;
};

export type SocialRelease = {
  releaseId: string;
  sessionId: string;
  createdAt: number;
  signalCounts: Partial<Record<RoomCueId, number>>;
  reactionCounts: Record<string, number>;
  totalSignals: number;
  totalReactions: number;
};

export type ParticipantPosture = 'away' | 'ready' | 'focusing' | 'porch' | 'here';

export const MAX_PORCH_MESSAGES = 80;
export const MAX_HELD_SIGNALS = 32;
export const MAX_PORCH_MESSAGE_LENGTH = 500;

export const ROOM_CUES = new Set<RoomCueId>([
  'smallWin',
  'breathe',
  'reset',
]);

const boundedText = (value: unknown, max: number): string =>
  typeof value === 'string' ? value.trim().slice(0, max) : '';

const boundedTime = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? Math.floor(value)
    : null;

const normalizeAuthor = (value: Record<string, unknown>) => {
  const authorId = boundedText(value.authorId, 64);
  const authorName = boundedText(value.authorName, 32);
  const authorEmoji = boundedText(value.authorEmoji, 8);
  return authorId && authorName
    ? {authorId, authorName, authorEmoji: authorEmoji || '🫧'}
    : null;
};

const normalizeEnvelope = (value: Record<string, unknown>) => {
  const id = boundedText(value.id, 80);
  const author = normalizeAuthor(value);
  const createdAt = boundedTime(value.createdAt);
  const sessionId = boundedText(value.sessionId, 80);
  return id && author && createdAt !== null && sessionId
    ? {id, ...author, createdAt, sessionId}
    : null;
};

export const isFloor = (timer: TimerState): boolean =>
  timer.mode === 'focus' && (timer.status === 'running' || timer.status === 'paused');

export const normalizePorchMessages = (value: unknown): PorchMessage[] => {
  if (!Array.isArray(value)) return [];
  const normalized: PorchMessage[] = [];
  for (const candidate of value) {
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) continue;
    const record = candidate as Record<string, unknown>;
    const text = boundedText(record.text, MAX_PORCH_MESSAGE_LENGTH);
    const envelope = normalizeEnvelope(record);
    if (text && envelope) normalized.push({text, ...envelope});
  }
  return normalized.slice(-MAX_PORCH_MESSAGES);
};

export const normalizeHeldSignals = (value: unknown): RoomSignal[] => {
  if (!Array.isArray(value)) return [];
  const normalized: RoomSignal[] = [];
  for (const candidate of value) {
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) continue;
    const record = candidate as Record<string, unknown>;
    const cueId = boundedText(record.cueId, 16) as RoomCueId;
    const envelope = normalizeEnvelope(record);
    if (ROOM_CUES.has(cueId) && envelope) normalized.push({cueId, ...envelope});
  }
  return normalized.slice(-MAX_HELD_SIGNALS);
};

export const normalizeSocialRelease = (value: unknown): SocialRelease | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const releaseId = boundedText(record.releaseId, 80);
  const sessionId = boundedText(record.sessionId, 80);
  const createdAt = boundedTime(record.createdAt);
  if (!releaseId || !sessionId || createdAt === null) return null;

  const signalCounts: SocialRelease['signalCounts'] = {};
  if (record.signalCounts && typeof record.signalCounts === 'object' && !Array.isArray(record.signalCounts)) {
    for (const cueId of ROOM_CUES) {
      const count = Number((record.signalCounts as Record<string, unknown>)[cueId]);
      if (Number.isFinite(count) && count > 0) signalCounts[cueId] = Math.min(MAX_HELD_SIGNALS, Math.floor(count));
    }
  }

  const reactionCounts: Record<string, number> = {};
  if (record.reactionCounts && typeof record.reactionCounts === 'object' && !Array.isArray(record.reactionCounts)) {
    for (const [emoji, rawCount] of Object.entries(record.reactionCounts as Record<string, unknown>).slice(0, 8)) {
      const key = boundedText(emoji, 8);
      const count = Number(rawCount);
      if (key && Number.isFinite(count) && count > 0) reactionCounts[key] = Math.min(10_000, Math.floor(count));
    }
  }

  const totalSignals = Object.values(signalCounts).reduce((sum, count) => sum + (count ?? 0), 0);
  const totalReactions = Object.values(reactionCounts).reduce((sum, count) => sum + count, 0);
  return {releaseId, sessionId, createdAt, signalCounts, reactionCounts, totalSignals, totalReactions};
};

export const createPorchMessage = (
  value: unknown,
  profile: {memberId: string; name: string; emoji: string},
  createdAt: number,
  sessionId: string,
): PorchMessage | null => {
  const text = boundedText(value, MAX_PORCH_MESSAGE_LENGTH);
  if (!text) return null;
  return normalizePorchMessages([{
    id: crypto.randomUUID(),
    text,
    authorId: profile.memberId,
    authorName: profile.name,
    authorEmoji: profile.emoji,
    createdAt,
    sessionId,
  }])[0] ?? null;
};

export const deriveParticipantPosture = (
  choice: PresenceChoice,
  timer: TimerState,
): ParticipantPosture => {
  if (choice === 'away') return 'away';
  if (isFloor(timer)) return 'focusing';
  if (choice === 'ready') return 'ready';
  if (timer.mode !== 'focus') return 'porch';
  return 'here';
};
