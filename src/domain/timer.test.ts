import {describe, expect, it} from 'vitest';
import {applyTimerCommand, applyTimerSettings, createTimer, formatRemaining, nextModeAfter, remainingAt, settleElapsed} from './timer';

describe('shared timer protocol', () => {
  it('derives time from the server epoch instead of syncing every tick', () => {
    const started = applyTimerCommand(createTimer('one'), {type: 'start'}, 1_000, 'host', 'two');
    expect(remainingAt(started, 11_000)).toBe(started.durationMs - 10_000);
  });

  it('pauses at the derived remainder and resumes without drift', () => {
    const started = applyTimerCommand(createTimer('one'), {type: 'start'}, 0, 'a', 'two');
    const paused = applyTimerCommand(started, {type: 'pause'}, 5_000, 'a', 'three');
    const resumed = applyTimerCommand(paused, {type: 'start'}, 20_000, 'a', 'four');
    expect(paused.remainingMs).toBe(started.durationMs - 5_000);
    expect(resumed.endsAt).toBe(20_000 + paused.remainingMs);
  });

  it('completes exactly once and auto-starts the break', () => {
    const started = applyTimerCommand(createTimer('focus-1'), {type: 'start'}, 100, 'host', 'unused');
    const first = settleElapsed(started, started.endsAt!, 'server', 'break-1');
    const second = settleElapsed(first.timer, started.endsAt!, 'server', 'other');
    expect(first.completion?.sessionId).toBe('focus-1');
    expect(first.timer).toMatchObject({mode: 'shortBreak', status: 'running'});
    expect(second.completion).toBeNull();
  });

  it('uses a long break after every fourth completed focus', () => {
    expect(nextModeAfter('focus', 3)).toBe('shortBreak');
    expect(nextModeAfter('focus', 4)).toBe('longBreak');
    expect(nextModeAfter('shortBreak', 4)).toBe('focus');
  });

  it('returns from a break to an idle focus so work never begins without consent', () => {
    const breakTimer = applyTimerCommand(createTimer('one'), {type: 'mode', mode: 'shortBreak'}, 0, 'host', 'break');
    const started = applyTimerCommand(breakTimer, {type: 'start'}, 0, 'host', 'unused');
    const settled = settleElapsed(started, started.endsAt!, 'server', 'next-focus');
    expect(settled.timer).toMatchObject({mode: 'focus', status: 'idle', sessionId: 'next-focus'});
  });

  it('applies host settings atomically and formats the display', () => {
    const updated = applyTimerSettings(
      createTimer('one'),
      {focus: 50 * 60_000, shortBreak: 10 * 60_000, longBreak: 20 * 60_000},
      false,
      'host',
      'settings',
    );
    expect(updated.remainingMs).toBe(50 * 60_000);
    expect(updated.autoAdvance).toBe(false);
    expect(formatRemaining(5 * 60_000)).toBe('05:00');
  });
});
