export const DURATIONS = {
  focus: 25 * 60_000,
  shortBreak: 5 * 60_000,
  longBreak: 15 * 60_000,
} as const;

export type TimerMode = keyof typeof DURATIONS;
export type TimerStatus = 'idle' | 'running' | 'paused' | 'complete';

export type TimerState = {
  mode: TimerMode;
  status: TimerStatus;
  durationMs: number;
  remainingMs: number;
  endsAt: number | null;
  revision: number;
  controllerId: string | null;
};

export type TimerCommand =
  | {type: 'start'}
  | {type: 'pause'}
  | {type: 'reset'}
  | {type: 'mode'; mode: TimerMode};

export const createTimer = (): TimerState => ({
  mode: 'focus',
  status: 'idle',
  durationMs: DURATIONS.focus,
  remainingMs: DURATIONS.focus,
  endsAt: null,
  revision: 0,
  controllerId: null,
});

export const remainingAt = (timer: TimerState, now: number): number =>
  timer.status === 'running' && timer.endsAt !== null
    ? Math.max(0, timer.endsAt - now)
    : Math.max(0, timer.remainingMs);

export const materializeTimer = (timer: TimerState, now: number): TimerState => {
  const remainingMs = remainingAt(timer, now);
  if (timer.status === 'running' && remainingMs === 0) {
    return {...timer, status: 'complete', remainingMs: 0, endsAt: null};
  }
  return {...timer, remainingMs};
};

export const applyTimerCommand = (
  current: TimerState,
  command: TimerCommand,
  now: number,
  controllerId: string,
): TimerState => {
  const timer = materializeTimer(current, now);
  const common = {revision: timer.revision + 1, controllerId};

  switch (command.type) {
    case 'start': {
      const remainingMs = timer.remainingMs || timer.durationMs;
      return {
        ...timer,
        ...common,
        status: 'running',
        remainingMs,
        endsAt: now + remainingMs,
      };
    }
    case 'pause':
      return {...timer, ...common, status: 'paused', endsAt: null};
    case 'reset':
      return {
        ...timer,
        ...common,
        status: 'idle',
        remainingMs: timer.durationMs,
        endsAt: null,
      };
    case 'mode': {
      const durationMs = DURATIONS[command.mode];
      return {
        ...timer,
        ...common,
        mode: command.mode,
        status: 'idle',
        durationMs,
        remainingMs: durationMs,
        endsAt: null,
      };
    }
  }
};

export const formatRemaining = (milliseconds: number): string => {
  const seconds = Math.ceil(Math.max(0, milliseconds) / 1000);
  const minutes = Math.floor(seconds / 60);
  return `${String(minutes).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
};
