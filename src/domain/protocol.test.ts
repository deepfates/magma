import {describe, expect, it} from 'vitest';
import {isClientMessage} from './protocol';

describe('Porch client protocol', () => {
  it('accepts bounded presence, message, and semantic signal commands', () => {
    expect(isClientMessage({type: 'presence.set', choice: 'ready'})).toBe(true);
    expect(isClientMessage({type: 'porch.message', nonce: 'nonce-12345678', text: 'Meet me on the Porch.'})).toBe(true);
    expect(isClientMessage({type: 'social.signal', nonce: 'nonce-12345678', cueId: 'breathe'})).toBe(true);
  });

  it('rejects unbounded, empty, or arbitrary social input', () => {
    expect(isClientMessage({type: 'presence.set', choice: 'watching'})).toBe(false);
    expect(isClientMessage({type: 'porch.message', nonce: 'short', text: 'hello'})).toBe(false);
    expect(isClientMessage({type: 'porch.message', nonce: 'nonce-12345678', text: ' '.repeat(8)})).toBe(false);
    expect(isClientMessage({type: 'porch.message', nonce: 'nonce-12345678', text: 'x'.repeat(501)})).toBe(false);
    expect(isClientMessage({type: 'social.signal', nonce: 'nonce-12345678', cueId: 'airhorn'})).toBe(false);
    expect(isClientMessage({type: 'social.signal', nonce: 'nonce-12345678', cueId: 'complete'})).toBe(false);
  });

  it('requires settings to name the timer revision and session they intend to replace', () => {
    const durations = {focus: 60_000, shortBreak: 30_000, longBreak: 90_000};
    expect(isClientMessage({type: 'timer.settings', durations, autoAdvance: true, expectedRevision: 3, expectedSessionId: 'session-123'})).toBe(true);
    expect(isClientMessage({type: 'timer.settings', durations, autoAdvance: true})).toBe(false);
  });
});
