import type {PhaseCompletion, TimerCommand, TimerDurations, TimerState} from './timer';
import type {MediaCommand, RoomMediaState} from './media';

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
};

export type TimerProposal = {
  id: string;
  fromId: string;
  fromName: string;
  command: TimerCommand;
  createdAt: number;
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
};

export type ClientMessage =
  | {type: 'hello'; profile: Profile}
  | {type: 'timer.command'; command: TimerCommand; expectedRevision: number}
  | {type: 'timer.approve'; proposalId: string}
  | {type: 'timer.dismiss'; proposalId: string}
  | {type: 'timer.settings'; durations: TimerDurations; autoAdvance: boolean}
  | {type: 'media.command'; command: MediaCommand; expectedRevision: number}
  | {type: 'host.transfer'; memberId: string}
  | {type: 'reaction'; emoji: string}
  | {type: 'clock.ping'; clientSentAt: number};

const MODES = new Set(['focus', 'shortBreak', 'longBreak']);
const COMMANDS = new Set(['start', 'pause', 'reset', 'mode']);

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
      return Boolean(message.durations && typeof message.durations === 'object') && typeof message.autoAdvance === 'boolean';
    case 'media.command': {
      if (!Number.isSafeInteger(message.expectedRevision) || Number(message.expectedRevision) < 0 || !message.command || typeof message.command !== 'object') return false;
      const command = message.command as Record<string, unknown>;
      if (command.type === 'source') {
        const source = command.source as Record<string, unknown> | undefined;
        return Boolean(source && ['live', 'video', 'playlist'].includes(String(source.kind)) && typeof source.id === 'string' && /^[a-zA-Z0-9_-]{10,90}$/.test(source.id) && typeof source.label === 'string' && source.label.length <= 80);
      }
      return ['play', 'pause', 'seek'].includes(String(command.type))
        && typeof command.positionSeconds === 'number' && Number.isFinite(command.positionSeconds) && command.positionSeconds >= 0 && command.positionSeconds <= 86_400
        && Number.isInteger(command.playlistIndex) && Number(command.playlistIndex) >= 0 && Number(command.playlistIndex) <= 10_000;
    }
    case 'host.transfer':
      return typeof message.memberId === 'string';
    case 'reaction':
      return typeof message.emoji === 'string';
    case 'clock.ping':
      return typeof message.clientSentAt === 'number';
    default:
      return false;
  }
};
