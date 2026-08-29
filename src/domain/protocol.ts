import type {PhaseCompletion, TimerCommand, TimerDurations, TimerState} from './timer';
import type {MediaCommand, RoomMediaState} from './media';
import type {DeckPolicy, MediaQueueState} from './mediaQueue';
import type {YouTubeSource} from './youtube';
import {ROOM_CUES, type PorchMessage, type PresenceChoice, type RoomCueId, type SocialRelease} from './porch';
import type {AuthRole} from './auth';

export type Profile = {
  memberId: string;
  name: string;
  color: string;
  emoji: string;
  intention: string;
};

export type Participant = Profile & {
  connectionId: string;
  joinedAt: number;
  connections: number;
  presence: PresenceChoice;
  role: AuthRole;
};

export type TimerProposal = {
  id: string;
  fromId: string;
  fromName: string;
  command: TimerCommand;
  createdAt: number;
  baseRevision: number;
  baseSessionId: string;
};

export type SessionArtifact = PhaseCompletion & {
  id: string;
  focusCount: number;
  participants: Array<Pick<Profile, 'memberId' | 'name' | 'color' | 'emoji' | 'intention'>>;
  reactionCount: number;
};

export type RoomSnapshot = {
  type: 'snapshot';
  serverNow: number;
  timer: TimerState;
  participants: Participant[];
  hostId: string | null;
  proposal: TimerProposal | null;
  artifacts: SessionArtifact[];
  media: RoomMediaState;
  mediaQueue: MediaQueueState;
  porchMessages: PorchMessage[];
  socialRelease: SocialRelease | null;
};

export type ClientMessage =
  | {type: 'hello'; profile: Profile}
  | {type: 'timer.command'; command: TimerCommand; expectedRevision: number}
  | {type: 'timer.approve'; proposalId: string}
  | {type: 'timer.dismiss'; proposalId: string}
  | {type: 'timer.settings'; durations: TimerDurations; autoAdvance: boolean; expectedRevision: number; expectedSessionId: string}
  | {type: 'media.command'; command: MediaCommand; expectedRevision: number; expectedItemId: string}
  | {type: 'media.queue.enqueue'; opId: string; source: YouTubeSource; activate: boolean}
  | {type: 'media.queue.move'; opId: string; itemId: string; beforeItemId: string | null; expectedRevision: number}
  | {type: 'media.queue.remove'; opId: string; itemId: string; expectedRevision: number}
  | {type: 'media.queue.select'; opId: string; itemId: string; expectedRevision: number}
  | {type: 'media.queue.policy'; opId: string; policy: DeckPolicy; expectedRevision: number}
  | {type: 'host.transfer'; memberId: string}
  | {type: 'presence.set'; choice: PresenceChoice}
  | {type: 'porch.message'; nonce: string; text: string}
  | {type: 'social.signal'; nonce: string; cueId: RoomCueId}
  | {type: 'reaction'; emoji: string}
  | {type: 'clock.ping'; clientSentAt: number};

const MODES = new Set(['focus', 'shortBreak', 'longBreak']);
const COMMANDS = new Set(['start', 'pause', 'reset', 'mode']);
const OP_ID = /^[a-zA-Z0-9-]{8,80}$/;
const QUEUE_ITEM_ID = /^mq_[A-Za-z0-9_-]{8,80}$/;

const isYouTubeSource = (source: unknown): source is YouTubeSource => {
  if (!source || typeof source !== 'object') return false;
  const value = source as Record<string, unknown>;
  return ['live', 'video', 'playlist'].includes(String(value.kind))
    && typeof value.id === 'string' && /^[a-zA-Z0-9_-]{10,90}$/.test(value.id)
    && typeof value.label === 'string' && value.label.trim().length > 0 && value.label.length <= 80;
};

export const isTimerCommand = (value: unknown): value is TimerCommand => {
  if (!value || typeof value !== 'object') return false;
  const command = value as Record<string, unknown>;
  if (!COMMANDS.has(String(command.type))) return false;
  return command.type !== 'mode' || MODES.has(String(command.mode));
};

export const isClientMessage = (value: unknown): value is ClientMessage => {
  if (!value || typeof value !== 'object') return false;
  const message = value as Record<string, unknown>;
  switch (message.type) {
    case 'hello':
      return Boolean(message.profile && typeof message.profile === 'object');
    case 'timer.command':
      return isTimerCommand(message.command) && Number.isInteger(message.expectedRevision);
    case 'timer.approve':
    case 'timer.dismiss':
      return typeof message.proposalId === 'string';
    case 'timer.settings':
      return Boolean(message.durations && typeof message.durations === 'object')
        && typeof message.autoAdvance === 'boolean'
        && Number.isSafeInteger(message.expectedRevision) && Number(message.expectedRevision) >= 0
        && typeof message.expectedSessionId === 'string' && message.expectedSessionId.length > 0 && message.expectedSessionId.length <= 80;
    case 'media.command': {
      if (!Number.isSafeInteger(message.expectedRevision) || Number(message.expectedRevision) < 0
        || typeof message.expectedItemId !== 'string' || !QUEUE_ITEM_ID.test(message.expectedItemId)
        || !message.command || typeof message.command !== 'object') return false;
      const command = message.command as Record<string, unknown>;
      if (command.type === 'source') {
        return isYouTubeSource(command.source);
      }
      return ['play', 'pause', 'seek'].includes(String(command.type))
        && typeof command.positionSeconds === 'number' && Number.isFinite(command.positionSeconds) && command.positionSeconds >= 0 && command.positionSeconds <= 86_400
        && Number.isInteger(command.playlistIndex) && Number(command.playlistIndex) >= 0 && Number(command.playlistIndex) <= 10_000;
    }
    case 'media.queue.enqueue':
      return OP_ID.test(String(message.opId)) && isYouTubeSource(message.source) && typeof message.activate === 'boolean';
    case 'media.queue.move':
      return OP_ID.test(String(message.opId)) && QUEUE_ITEM_ID.test(String(message.itemId))
        && (message.beforeItemId === null || QUEUE_ITEM_ID.test(String(message.beforeItemId)))
        && Number.isSafeInteger(message.expectedRevision) && Number(message.expectedRevision) >= 0;
    case 'media.queue.remove':
    case 'media.queue.select':
      return OP_ID.test(String(message.opId)) && QUEUE_ITEM_ID.test(String(message.itemId))
        && Number.isSafeInteger(message.expectedRevision) && Number(message.expectedRevision) >= 0;
    case 'media.queue.policy':
      return OP_ID.test(String(message.opId)) && ['open', 'stewarded'].includes(String(message.policy))
        && Number.isSafeInteger(message.expectedRevision) && Number(message.expectedRevision) >= 0;
    case 'host.transfer':
      return typeof message.memberId === 'string';
    case 'presence.set':
      return ['here', 'ready', 'away'].includes(String(message.choice));
    case 'porch.message':
      return typeof message.nonce === 'string' && /^[a-zA-Z0-9-]{8,80}$/.test(message.nonce)
        && typeof message.text === 'string' && message.text.trim().length > 0 && message.text.length <= 500;
    case 'social.signal':
      return typeof message.nonce === 'string' && /^[a-zA-Z0-9-]{8,80}$/.test(message.nonce)
        && ROOM_CUES.has(message.cueId as RoomCueId);
    case 'reaction':
      return typeof message.emoji === 'string';
    case 'clock.ping':
      return typeof message.clientSentAt === 'number';
    default:
      return false;
  }
};
