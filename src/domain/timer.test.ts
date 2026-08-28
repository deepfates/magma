import {describe, expect, it} from 'vitest';
import {applyTimerCommand, createTimer, formatRemaining, remainingAt} from './timer';

describe('shared timer protocol', () => {
  it('derives time from the server epoch instead of syncing every tick', () => {
    const started = applyTimerCommand(createTimer(), {type: 'start'}, 1_000, 'host');
    expect(remainingAt(started, 11_000)).toBe(started.durationMs - 10_000);
  });

  it('pauses at the derived remainder and resumes without drift', () => {
    const started = applyTimerCommand(createTimer(), {type: 'start'}, 0, 'a');
    const paused = applyTimerCommand(started, {type: 'pause'}, 5_000, 'b');
    const resumed = applyTimerCommand(paused, {type: 'start'}, 20_000, 'a');
    expect(paused.remainingMs).toBe(started.durationMs - 5_000);
    expect(resumed.endsAt).toBe(20_000 + paused.remainingMs);
  });

  it('switches modes atomically and formats the display', () => {
    const breakTimer = applyTimerCommand(createTimer(), {type: 'mode', mode: 'shortBreak'}, 0, 'a');
    expect(breakTimer.remainingMs).toBe(5 * 60_000);
    expect(formatRemaining(breakTimer.remainingMs)).toBe('05:00');
  });
});
