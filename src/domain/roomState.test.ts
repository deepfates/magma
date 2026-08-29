import {describe, expect, it} from 'vitest';
import {
  InvalidRoomStateError,
  UnsupportedRoomStateVersionError,
  legacyEntries,
  migrateRoomState,
  parseStoredRoomState,
  updateStoredRoomState,
} from './roomState';

const productionFixture = {
  timer: {mode: 'focus', status: 'paused', remainingMs: 420_000, revision: 7},
  media: {source: {kind: 'live', id: 'BSWhGNXxT9A', label: 'Treasure Island panorama'}, revision: 3},
  mediaQueue: {version: 1, activeItemId: 'mq_room_default', items: [{id: 'mq_room_default'}], revision: 4},
  porchMessages: [{id: 'message-1', text: 'Meet here tomorrow'}],
  workspace: [[{tasks: {task1: {text: ['Leave this here']}}}], 1],
};

describe('versioned Porch room state', () => {
  it('migrates a representative production snapshot once and retains its exact prior values', () => {
    const first = migrateRoomState(undefined, productionFixture, 1_000);
    expect(first).toEqual({
      migrated: true,
      state: {version: 1, persistedAt: 1_000, values: productionFixture},
      backup: {version: 1, source: 'production-keys', capturedAt: 1_000, values: productionFixture},
    });

    const second = migrateRoomState(first.state, {timer: {status: 'idle'}}, 9_000);
    expect(second).toEqual({migrated: false, state: first.state, backup: null});
  });

  it('rejects unknown future and malformed envelopes instead of interpreting them as legacy state', () => {
    expect(() => migrateRoomState({version: 2, persistedAt: 2_000, values: {}}, productionFixture, 3_000))
      .toThrow(UnsupportedRoomStateVersionError);
    expect(() => parseStoredRoomState({version: 1, persistedAt: 2_000, values: []}))
      .toThrow(InvalidRoomStateError);
    expect(() => parseStoredRoomState({version: 1, persistedAt: 2_000, values: {unversionedFutureState: true}}))
      .toThrow(InvalidRoomStateError);
  });

  it('patches the current envelope and mirrors only explicit production keys', () => {
    const state = migrateRoomState(undefined, productionFixture, 1_000).state;
    const updated = updateStoredRoomState(state, {porchMessages: [], socialNonces: ['nonce-1']}, 2_000);
    expect(updated.values).toMatchObject({timer: productionFixture.timer, porchMessages: [], socialNonces: ['nonce-1']});
    expect(legacyEntries({porchMessages: [], socialNonces: ['nonce-1']})).toEqual({
      'magma:porch-messages': [],
      'magma:social-nonces': ['nonce-1'],
    });
  });
});
