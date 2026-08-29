import {describe, expect, it} from 'vitest';
import {createTimer, settleElapsed} from './timer';
import {deriveSalonPhase, returnWindowMs} from './salonPhase';

describe('salon phase', () => {
  it('derives the return threshold from the canonical break clock', () => {
    const timer = createTimer('break');
    timer.mode = 'shortBreak';
    timer.status = 'running';
    timer.durationMs = 5 * 60_000;
    timer.remainingMs = timer.durationMs;
    timer.endsAt = 10 * 60_000;
    expect(returnWindowMs(timer)).toBe(60_000);
    expect(deriveSalonPhase(timer, 8 * 60_000 + 59_999)).toBe('porch');
    expect(deriveSalonPhase(timer, 9 * 60_000)).toBe('returning');
  });

  it('keeps paused focus on the Floor and treats idle focus as gathering', () => {
    const focus = createTimer('focus');
    expect(deriveSalonPhase(focus, 0)).toBe('gathering');
    expect(deriveSalonPhase({...focus, status: 'paused'}, 0)).toBe('floor');
  });

  it('moves an elapsed break to gathering through the existing timer authority', () => {
    const timer = createTimer('break');
    timer.mode = 'shortBreak';
    timer.status = 'running';
    timer.durationMs = 30_000;
    timer.remainingMs = 30_000;
    timer.endsAt = 30_000;
    const settled = settleElapsed(timer, 31_000, 'server', 'next-focus').timer;
    expect(settled.mode).toBe('focus');
    expect(settled.status).toBe('idle');
    expect(deriveSalonPhase(settled, 31_000)).toBe('gathering');
  });

  it('uses a safe minimum window for malformed or tiny durations', () => {
    const timer = createTimer('tiny-break');
    timer.mode = 'shortBreak';
    timer.status = 'running';
    timer.durationMs = 0;
    timer.remainingMs = 500;
    timer.endsAt = 500;
    expect(returnWindowMs(timer)).toBe(1_000);
    expect(deriveSalonPhase(timer, 0)).toBe('returning');
  });
});
