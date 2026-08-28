export const DEFAULT_DURATIONS = {
  focus: 25 * 60_000,
  shortBreak: 5 * 60_000,
  longBreak: 15 * 60_000,
} as const;

export type TimerMode = keyof typeof DEFAULT_DURATIONS;
export type TimerStatus = 'idle' | 'running' | 'paused';
export type TimerDurations = Record<TimerMode, number>;

export type TimerState = {
  mode: TimerMode;
  status: TimerStatus;
  durations: TimerDurations;
  durationMs: number;
  remainingMs: number;
  endsAt: number | null;
  phaseStartedAt: number | null;
  sessionId: string;
  revision: number;
  focusCount: number;
  autoAdvance: boolean;
  controllerId: string | null;
};

export type TimerCommand =
  | {type: 'start'}
  | {type: 'pause'}
  | {type: 'reset'}
  | {type: 'mode'; mode: TimerMode};

export type PhaseCompletion = {
  sessionId: string;
  mode: TimerMode;
  startedAt: number;
  completedAt: number;
  durationMs: number;
};

const freshSessionId = (): string => crypto.randomUUID();

export const createTimer = (sessionId = freshSessionId()): TimerState => ({
  mode: 'focus',
  status: 'idle',
  durations: {...DEFAULT_DURATIONS},
  durationMs: DEFAULT_DURATIONS.focus,
  remainingMs: DEFAULT_DURATIONS.focus,
  endsAt: null,
  phaseStartedAt: null,
  sessionId,
  revision: 0,
  focusCount: 0,
  autoAdvance: true,
  controllerId: null,
});

export const normalizeTimer = (value: Partial<TimerState> | undefined): TimerState => {
  const baseline = createTimer(value?.sessionId);
  const mode = value?.mode && value.mode in DEFAULT_DURATIONS ? value.mode : baseline.mode;
  const durations = {...baseline.durations, ...value?.durations};
  return {
    ...baseline,
    ...value,
    mode,
    durations,
    durationMs: Number(value?.durationMs) || durations[mode],
    remainingMs: Number.isFinite(value?.remainingMs) ? Math.max(0, Number(value?.remainingMs)) : durations[mode],
    focusCount: Math.max(0, Number(value?.focusCount) || 0),
    autoAdvance: value?.autoAdvance ?? true,
  };
};

export const remainingAt = (timer: TimerState, now: number): number =>
  timer.status === 'running' && timer.endsAt !== null
    ? Math.max(0, timer.endsAt - now)
    : Math.max(0, timer.remainingMs);

export const materializeTimer = (timer: TimerState, now: number): TimerState => ({
  ...timer,
  remainingMs: remainingAt(timer, now),
});

export const nextModeAfter = (mode: TimerMode, completedFocusCount: number): TimerMode => {
  if (mode !== 'focus') return 'focus';
  return completedFocusCount % 4 === 0 ? 'longBreak' : 'shortBreak';
};

export const settleElapsed = (
  current: TimerState,
  now: number,
  controllerId: string,
  nextSessionId = freshSessionId(),
): {timer: TimerState; completion: PhaseCompletion | null} => {
  if (current.status !== 'running' || current.endsAt === null || current.endsAt > now) {
    return {timer: materializeTimer(current, now), completion: null};
  }

  const completedAt = current.endsAt;
  const focusCount = current.focusCount + (current.mode === 'focus' ? 1 : 0);
  const nextMode = nextModeAfter(current.mode, focusCount);
  const shouldAutoStart = current.autoAdvance && current.mode === 'focus';
  const durationMs = current.durations[nextMode];
  const timer: TimerState = {
    ...current,
    mode: nextMode,
    status: shouldAutoStart ? 'running' : 'idle',
    durationMs,
    remainingMs: durationMs,
    endsAt: shouldAutoStart ? completedAt + durationMs : null,
    phaseStartedAt: shouldAutoStart ? completedAt : null,
    sessionId: nextSessionId,
    revision: current.revision + 1,
    focusCount,
    controllerId,
  };

  return {
    timer,
    completion: {
      sessionId: current.sessionId,
      mode: current.mode,
      startedAt: current.phaseStartedAt ?? completedAt - current.durationMs,
      completedAt,
      durationMs: current.durationMs,
    },
  };
};

export const applyTimerCommand = (
  current: TimerState,
  command: TimerCommand,
  now: number,
  controllerId: string,
  nextSessionId = freshSessionId(),
): TimerState => {
  const {timer} = settleElapsed(current, now, controllerId, nextSessionId);
  const common = {revision: timer.revision + 1, controllerId};

  switch (command.type) {
    case 'start': {
      const remainingMs = timer.remainingMs || timer.durationMs;
      return {...timer, ...common, status: 'running', remainingMs, phaseStartedAt: timer.phaseStartedAt ?? now, endsAt: now + remainingMs};
    }
    case 'pause':
      return {...materializeTimer(timer, now), ...common, status: 'paused', endsAt: null};
    case 'reset':
      return {...timer, ...common, status: 'idle', remainingMs: timer.durationMs, endsAt: null, phaseStartedAt: null, sessionId: nextSessionId};
    case 'mode': {
      const durationMs = timer.durations[command.mode];
      return {...timer, ...common, mode: command.mode, status: 'idle', durationMs, remainingMs: durationMs, endsAt: null, phaseStartedAt: null, sessionId: nextSessionId};
    }
  }
};

export const applyTimerSettings = (
  current: TimerState,
  durations: TimerDurations,
  autoAdvance: boolean,
  controllerId: string,
  nextSessionId = freshSessionId(),
): TimerState => ({
  ...current,
  durations,
  autoAdvance,
  durationMs: durations[current.mode],
  remainingMs: durations[current.mode],
  status: 'idle',
  endsAt: null,
  phaseStartedAt: null,
  sessionId: nextSessionId,
  revision: current.revision + 1,
  controllerId,
});

export const formatRemaining = (milliseconds: number): string => {
  const seconds = Math.ceil(Math.max(0, milliseconds) / 1000);
  const minutes = Math.floor(seconds / 60);
  return `${String(minutes).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
};
