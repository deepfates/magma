import {describe, expect, it, vi} from 'vitest';
import {RoomAccessController, type AccessStorage} from '../party/access';
import {handleAccessHttp} from '../party/access-http';
import {admitRoom, getAccessClassification} from './accessClient';
import {loadOrCreateRoomIdentity, type DeviceIdentityStore, type StoredDeviceIdentity} from './deviceIdentity';

const ROOM = '67b4786e-f018-4acf-8e84-29b1b636ef17';

class MemoryStorage implements AccessStorage {
  readonly values = new Map<string, unknown>();
  async get<T>(key: string) { return structuredClone(this.values.get(key)) as T | undefined; }
  async put<T>(key: string, value: T) { this.values.set(key, structuredClone(value)); }
  async transaction<T>(operation: (transaction: AccessStorage) => Promise<T>): Promise<T> { return operation(this); }
}

class MemoryIdentityStore implements DeviceIdentityStore {
  readonly identities = new Map<string, StoredDeviceIdentity>();
  async get(room: string) { return this.identities.get(room); }
  async add(identity: StoredDeviceIdentity) {
    if (this.identities.has(identity.roomId)) return false;
    this.identities.set(identity.roomId, identity);
    return true;
  }
  async delete(room: string) { this.identities.delete(room); }
}

describe('browser-to-room admission seam', () => {
  it('bootstraps, returns, and enrolls without putting credentials in request URLs', async () => {
    vi.stubGlobal('window', {location: {protocol: 'https:', hostname: 'magma.test'}});
    const access = new RoomAccessController(new MemoryStorage(), ROOM);
    const urls: string[] = [];
    const bodies: string[] = [];
    const fetchLike = async (input: string | URL | Request, init?: RequestInit) => {
      const source = input instanceof Request ? input.url : String(input);
      urls.push(source);
      if (typeof init?.body === 'string') bodies.push(init.body);
      const request = new Request(source, {...init, headers: {origin: 'https://magma.test', ...(init?.headers ?? {})}});
      return (await handleAccessHttp(request, access, ['https://magma.test']))!;
    };
    const owner = await loadOrCreateRoomIdentity(ROOM, {store: new MemoryIdentityStore()});
    expect(await getAccessClassification(ROOM, fetchLike as typeof fetch)).toBe('unclaimed');
    const bootstrap = await admitRoom({room: ROOM, action: 'bootstrap', identity: owner, fetch: fetchLike as typeof fetch});
    expect(bootstrap).toMatchObject({deviceId: owner.deviceId, role: 'owner'});
    expect(await getAccessClassification(ROOM, fetchLike as typeof fetch)).toBe('protected');
    expect((await admitRoom({room: ROOM, action: 'prove', identity: owner, fetch: fetchLike as typeof fetch})).membershipId)
      .toBe(bootstrap.membershipId);

    const invite = await access.createInvite(owner.deviceId, {role: 'member', maxUses: 1, expiresAt: Date.now() + 60_000});
    expect(invite.ok).toBe(true);
    if (!invite.ok) throw new Error(invite.reason);
    const member = await loadOrCreateRoomIdentity(ROOM, {store: new MemoryIdentityStore()});
    const enrollment = await admitRoom({room: ROOM, action: 'enroll', identity: member, capability: invite.value.capability, fetch: fetchLike as typeof fetch});
    expect(enrollment).toMatchObject({deviceId: member.deviceId, role: 'member'});
    expect(urls.every((url) => !url.includes(invite.value.capability))).toBe(true);
    expect(bodies.every((body) => !body.includes('Ada') && !body.includes('Hold the boundary'))).toBe(true);
    vi.unstubAllGlobals();
  });
});
