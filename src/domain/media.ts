import {TREASURE_ISLAND, type YouTubeSource} from './youtube';

export type MediaStatus = 'playing' | 'paused';

export type RoomMediaState = {
  source: YouTubeSource;
  status: MediaStatus;
  positionSeconds: number;
  playlistIndex: number;
  changedAt: number;
  revision: number;
  controllerId: string;
};

export type MediaCommand =
  | {type: 'source'; source: YouTubeSource}
  | {type: 'play'; positionSeconds: number; playlistIndex: number}
  | {type: 'pause'; positionSeconds: number; playlistIndex: number}
  | {type: 'seek'; positionSeconds: number; playlistIndex: number};

export const createMediaState = (now = Date.now()): RoomMediaState => ({
  source: TREASURE_ISLAND,
  status: 'playing',
  positionSeconds: 0,
  playlistIndex: 0,
  changedAt: now,
  revision: 0,
  controllerId: 'server',
});

export const mediaPositionAt = (media: RoomMediaState, now: number) =>
  media.status === 'playing'
    ? Math.max(0, media.positionSeconds + (now - media.changedAt) / 1000)
    : Math.max(0, media.positionSeconds);

export const applyMediaCommand = (current: RoomMediaState, command: MediaCommand, now: number, controllerId: string): RoomMediaState => {
  const common = {revision: current.revision + 1, controllerId, changedAt: now};
  if (command.type === 'source') {
    return {...current, ...common, source: command.source, status: 'playing', positionSeconds: 0, playlistIndex: 0};
  }
  const positionSeconds = Math.max(0, command.positionSeconds);
  const playlistIndex = Math.max(0, Math.floor(command.playlistIndex));
  if (command.type === 'play') return {...current, ...common, status: 'playing', positionSeconds, playlistIndex};
  if (command.type === 'pause') return {...current, ...common, status: 'paused', positionSeconds, playlistIndex};
  return {...current, ...common, positionSeconds, playlistIndex};
};

export const normalizeMediaState = (value: RoomMediaState | null | undefined, now = Date.now()): RoomMediaState => {
  if (!value?.source?.id || !['live', 'video', 'playlist'].includes(value.source.kind)) return createMediaState(now);
  return {
    source: value.source,
    status: value.status === 'paused' ? 'paused' : 'playing',
    positionSeconds: Number.isFinite(value.positionSeconds) ? Math.max(0, value.positionSeconds) : 0,
    playlistIndex: Number.isInteger(value.playlistIndex) ? Math.max(0, value.playlistIndex) : 0,
    changedAt: Number.isFinite(value.changedAt) ? value.changedAt : now,
    revision: Number.isInteger(value.revision) ? Math.max(0, value.revision) : 0,
    controllerId: typeof value.controllerId === 'string' ? value.controllerId : 'server',
  };
};
