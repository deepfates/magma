import {describe, expect, it} from 'vitest';
import {
  InvalidRoomStateError,
  UnsupportedRoomStateVersionError,
  legacyEntries,
  migrateRoomState,
  parseStoredRoomState,
  updateStoredRoomState,
} from './roomState';
import {createScene} from './scene';

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
      state: {version: 2, persistedAt: 1_000, values: {...productionFixture, scene: createScene(productionFixture.media.source as never, 1_000)}},
      backup: {version: 1, source: 'production-keys', capturedAt: 1_000, values: productionFixture},
      versionBackup: null,
    });

    const second = migrateRoomState(first.state, {timer: {status: 'idle'}}, 9_000);
    expect(second).toEqual({migrated: false, state: first.state, backup: null, versionBackup: null});
  });

  it('migrates a v1 envelope to the same visible source and retains the exact envelope', () => {
    const prior = {version: 1 as const, persistedAt: 900, values: productionFixture};
    const migrated = migrateRoomState(prior, {}, 1_000);
    expect(migrated.state.values.scene?.visual.source).toEqual(productionFixture.media.source);
    expect(migrated.versionBackup).toEqual({version: 1, source: 'room-state-v1', capturedAt: 1_000, state: prior});
  });

  it('rejects unknown future and malformed envelopes instead of interpreting them as legacy state', () => {
    expect(() => migrateRoomState({version: 3, persistedAt: 2_000, values: {}}, productionFixture, 3_000))
      .toThrow(UnsupportedRoomStateVersionError);
    expect(() => parseStoredRoomState({version: 2, persistedAt: 2_000, values: []}))
      .toThrow(InvalidRoomStateError);
    expect(() => parseStoredRoomState({version: 2, persistedAt: 2_000, values: {unversionedFutureState: true}}))
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
