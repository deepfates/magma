import {isFloor} from './porch';
import {remainingAt, type TimerState} from './timer';

export type SalonPhase = 'floor' | 'porch' | 'returning' | 'gathering';

export const returnWindowMs = (timer: TimerState): number =>
  Math.max(1_000, Math.min(60_000, Math.floor(Math.max(0, timer.durationMs) * 0.2)));

export const deriveSalonPhase = (timer: TimerState, now: number): SalonPhase => {
  if (isFloor(timer)) return 'floor';
  if (timer.mode === 'focus') return 'gathering';
  if (timer.status === 'running' && remainingAt(timer, now) <= returnWindowMs(timer)) return 'returning';
  return 'porch';
};
