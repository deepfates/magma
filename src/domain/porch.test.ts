import {describe, expect, it} from 'vitest';
import {createTimer, type TimerState} from './timer';
import {
  MAX_HELD_SIGNALS,
  MAX_PORCH_MESSAGE_LENGTH,
  MAX_PORCH_MESSAGES,
  createPorchMessage,
  deriveParticipantPosture,
  isFloor,
  normalizeHeldSignals,
  normalizePorchMessages,
  normalizeSocialRelease,
} from './porch';

const timer = (mode: TimerState['mode'], status: TimerState['status']): TimerState => ({
  ...createTimer('session'),
  mode,
  status,
});

describe('durable social release summaries', () => {
  it('derives bounded totals from known semantic signals and reaction counts', () => {
    expect(normalizeSocialRelease({
      releaseId: 'focus-1',
      sessionId: 'focus-1',
      createdAt: 1234.9,
      signalCounts: {breathe: 2, complete: 9, reset: Number.NaN},
      reactionCounts: {'✨': 3.8, '🔥': -1},
      totalSignals: 999,
      totalReactions: 999,
    })).toEqual({
      releaseId: 'focus-1',
      sessionId: 'focus-1',
      createdAt: 1234,
      signalCounts: {breathe: 2},
      reactionCounts: {'✨': 3},
      totalSignals: 2,
      totalReactions: 3,
    });
    expect(normalizeSocialRelease({releaseId: '', sessionId: 'focus-1', createdAt: 1})).toBeNull();
  });
});

const message = (index: number) => ({
  id: `message-${index}`,
  text: ` message ${index} `,
  authorId: 'member-1234',
  authorName: ' Glow ',
  authorEmoji: ' 🌋 ',
  createdAt: 1_000.9 + index,
  sessionId: ' session-1 ',
  ignored: 'not retained',
});

describe('Porch phase semantics', () => {
  it('treats only a running or paused focus phase as the Floor', () => {
    expect(isFloor(timer('focus', 'running'))).toBe(true);
    expect(isFloor(timer('focus', 'paused'))).toBe(true);
    expect(isFloor(timer('focus', 'idle'))).toBe(false);
    expect(isFloor(timer('shortBreak', 'running'))).toBe(false);
    expect(isFloor(timer('shortBreak', 'paused'))).toBe(false);
    expect(isFloor(timer('longBreak', 'idle'))).toBe(false);
  });

  it('derives posture from explicit choice and the room phase', () => {
    expect(deriveParticipantPosture('away', timer('focus', 'running'))).toBe('away');
    expect(deriveParticipantPosture('ready', timer('focus', 'idle'))).toBe('ready');
    expect(deriveParticipantPosture('here', timer('focus', 'running'))).toBe('focusing');
    expect(deriveParticipantPosture('ready', timer('focus', 'paused'))).toBe('focusing');
    expect(deriveParticipantPosture('ready', timer('shortBreak', 'running'))).toBe('ready');
    expect(deriveParticipantPosture('here', timer('longBreak', 'idle'))).toBe('porch');
    expect(deriveParticipantPosture('here', timer('focus', 'idle'))).toBe('here');
  });
});

describe('persisted Porch data', () => {
  it('filters corrupt messages and returns bounded plain normalized data', () => {
    expect(normalizePorchMessages(null)).toEqual([]);
    const result = normalizePorchMessages([
      null,
      'bad',
      {...message(0), text: '   '},
      {...message(0), createdAt: Number.NaN},
      message(1),
    ]);
    expect(result).toEqual([{
      id: 'message-1',
      text: 'message 1',
      authorId: 'member-1234',
      authorName: 'Glow',
      authorEmoji: '🌋',
      createdAt: 1001,
      sessionId: 'session-1',
    }]);

    const bounded = normalizePorchMessages(Array.from({length: MAX_PORCH_MESSAGES + 5}, (_, index) => message(index)));
    expect(bounded).toHaveLength(MAX_PORCH_MESSAGES);
    expect(bounded[0].text).toBe('message 5');
  });

  it('accepts only known audio cues and bounds held signals', () => {
    const signal = (index: number, cueId = 'breathe') => ({
      ...message(index),
      cueId,
    });
    expect(normalizeHeldSignals([signal(0, 'airhorn'), signal(1)])).toEqual([{
      id: 'message-1',
      cueId: 'breathe',
      authorId: 'member-1234',
      authorName: 'Glow',
      authorEmoji: '🌋',
      createdAt: 1001,
      sessionId: 'session-1',
    }]);

    expect(normalizeHeldSignals([signal(2, 'complete')])).toEqual([]);
    const bounded = normalizeHeldSignals(Array.from({length: MAX_HELD_SIGNALS + 3}, (_, index) => signal(index, 'reset')));
    expect(bounded).toHaveLength(MAX_HELD_SIGNALS);
    expect(bounded[0].createdAt).toBe(1003);
  });
});

describe('server-authored Porch messages', () => {
  const profile = {memberId: 'member-1234', name: '  Ada  ', emoji: ' 🪩 '};

  it('trims fields, clamps text, and rejects empty content', () => {
    expect(createPorchMessage('   ', profile, 1234, 'session-1')).toBeNull();
    const created = createPorchMessage(`  ${'x'.repeat(MAX_PORCH_MESSAGE_LENGTH + 20)}  `, profile, 1234.8, ' session-1 ');
    expect(created).toEqual({
      id: expect.any(String),
      text: 'x'.repeat(MAX_PORCH_MESSAGE_LENGTH),
      authorId: 'member-1234',
      authorName: 'Ada',
      authorEmoji: '🪩',
      createdAt: 1234,
      sessionId: 'session-1',
    });
  });

  it('rejects invalid server envelope data instead of persisting it', () => {
    expect(createPorchMessage('hello', {...profile, memberId: ''}, 1234, 'session-1')).toBeNull();
    expect(createPorchMessage('hello', profile, -1, 'session-1')).toBeNull();
    expect(createPorchMessage('hello', profile, 1234, '   ')).toBeNull();
  });
});
