import {describe, expect, it} from 'vitest';
import {signAuthProof, verifyAuthProof, type AuthProofFields} from './domain/auth';
import {
  forgetRoomIdentity,
  loadRoomIdentity,
  loadOrCreateRoomIdentity,
  normalizeStoredDeviceIdentity,
  type DeviceIdentityStore,
  type StoredDeviceIdentity,
} from './deviceIdentity';

class MemoryIdentityStore implements DeviceIdentityStore {
  private readonly identities = new Map<string, StoredDeviceIdentity>();

  async get(roomId: string) {
    return this.identities.get(roomId);
  }

  async add(identity: StoredDeviceIdentity) {
    await Promise.resolve();
    if (this.identities.has(identity.roomId)) return false;
    this.identities.set(identity.roomId, identity);
    return true;
  }

  async delete(roomId: string) {
    this.identities.delete(roomId);
  }
}

describe('room-scoped browser device identity', () => {
  it('persists a non-extractable key pair and reuses it for the room', async () => {
    const store = new MemoryIdentityStore();
    const first = await loadOrCreateRoomIdentity('glow-room', {store});
    const second = await loadOrCreateRoomIdentity('glow-room', {store});
    expect(second.deviceId).toBe(first.deviceId);
    expect(second.privateKey).toBe(first.privateKey);
    expect(first.privateKey.extractable).toBe(false);
    expect(normalizeStoredDeviceIdentity(first, 'glow-room')).not.toBeNull();

    const fields: AuthProofFields = {
      roomId: 'glow-room', connectionId: 'connection-one', challengeId: 'challenge-one', nonce: 'server-nonce-one',
      roomEpoch: 0, action: 'prove', deviceId: first.deviceId, clientNonce: 'client-nonce-one',
    };
    const signature = await signAuthProof(first.privateKey, fields);
    expect(await verifyAuthProof(first.publicJwk, fields, signature)).toBe(true);
  });

  it('converges simultaneous tab creation through add-if-absent storage', async () => {
    const store = new MemoryIdentityStore();
    const identities = await Promise.all(Array.from({length: 12}, () => loadOrCreateRoomIdentity('shared-room', {store})));
    expect(new Set(identities.map(({deviceId}) => deviceId)).size).toBe(1);
    expect(new Set(identities.map(({privateKey}) => privateKey)).size).toBe(1);
  });

  it('keeps identities room-scoped and requires explicit deletion', async () => {
    const store = new MemoryIdentityStore();
    const first = await loadOrCreateRoomIdentity('first-room', {store});
    const second = await loadOrCreateRoomIdentity('second-room', {store});
    expect(second.deviceId).not.toBe(first.deviceId);
    await forgetRoomIdentity('first-room', store);
    expect(await loadRoomIdentity('first-room', store)).toBeNull();
    const replacement = await loadOrCreateRoomIdentity('first-room', {store});
    expect(replacement.deviceId).not.toBe(first.deviceId);
  });

  it('rejects corrupt stored identity instead of silently replacing membership keys', async () => {
    const good = await loadOrCreateRoomIdentity('glow-room', {store: new MemoryIdentityStore()});
    const other = await loadOrCreateRoomIdentity('other-room', {store: new MemoryIdentityStore()});
    const corruptStore: DeviceIdentityStore = {
      get: async () => ({...good, deviceId: 'spoofed'}),
      add: async () => false,
      delete: async () => undefined,
    };
    await expect(loadOrCreateRoomIdentity('glow-room', {store: corruptStore})).rejects.toThrow('corrupt');
    expect(normalizeStoredDeviceIdentity({...good, privateKey: good.publicKey}, 'glow-room')).toBeNull();
    const mismatchedStore: DeviceIdentityStore = {
      get: async () => ({...good, privateKey: other.privateKey}),
      add: async () => false,
      delete: async () => undefined,
    };
    await expect(loadOrCreateRoomIdentity('glow-room', {store: mismatchedStore})).rejects.toThrow('corrupt');
  });
});
