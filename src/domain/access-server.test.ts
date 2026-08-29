import {describe, expect, it} from 'vitest';
import type * as Party from 'partykit/server';
import {
  ACCESS_STATE_KEY, INTERNAL_ADMISSION_PATH, RoomAccessController, TRUSTED_DEVICE_HEADER, TRUSTED_MEMBER_HEADER, TRUSTED_ROLE_HEADER,
  handleInternalAdmission, validateAdmissionBeforeConnect,
  type AccessRuntime, type AccessStorage, type DurableAccessState,
} from '../../party/access';
import {ROOM_STATE_KEY} from './roomState';
import {
  deriveDeviceId, exportPublicJwk, generateSigningKeyPair, hashInviteCapability, signAuthProof,
  type AuthChallenge, type AuthProofAction,
} from './auth';

const ROOM_ID = '67b4786e-f018-4acf-8e84-29b1b636ef17';

class FakeStorage implements AccessStorage {
  private readonly values = new Map<string, unknown>();
  private tail: Promise<void> = Promise.resolve();
  async get<T>(key: string): Promise<T | undefined> { return structuredClone(this.values.get(key)) as T | undefined; }
  async put<T>(key: string, value: T): Promise<void> { this.values.set(key, structuredClone(value)); }
  async transaction<T>(operation: (transaction: AccessStorage) => Promise<T>): Promise<T> {
    let release = () => {};
    const previous = this.tail;
    this.tail = new Promise<void>((resolve) => { release = resolve; });
    await previous;
    try { return await operation(this); } finally { release(); }
  }
  async serialized(): Promise<string> { return JSON.stringify(Object.fromEntries(this.values)); }
}

function testRuntime(start = 1_000): AccessRuntime & {advance(milliseconds: number): void} {
  let now = start;
  let sequence = 0;
  return {
    now: () => now,
    advance(milliseconds) { now += milliseconds; },
    randomBytes(length) {
      sequence += 1;
      return Uint8Array.from({length}, (_, index) => (sequence * 31 + index * 17) % 256);
    },
  };
}
function unwrap<T>(result: {ok: true; value: T} | {ok: false; reason: string}): T {
  expect(result.ok, result.ok ? undefined : result.reason).toBe(true);
  if (!result.ok) throw new Error(result.reason);
  return result.value;
}
async function identity() {
  const pair = await generateSigningKeyPair();
  const publicJwk = await exportPublicJwk(pair.publicKey);
  return {pair, publicJwk, deviceId: await deriveDeviceId(publicJwk)};
}
async function signedProof(
  roomId: string,
  challenge: AuthChallenge,
  action: AuthProofAction,
  who: Awaited<ReturnType<typeof identity>>,
  inviteHash?: string,
) {
  const clientNonce = `client-${challenge.challengeId}`;
  const signature = await signAuthProof(who.pair.privateKey, {
    roomId, connectionId: challenge.connectionId, challengeId: challenge.challengeId, nonce: challenge.nonce,
    roomEpoch: challenge.roomEpoch, action, deviceId: who.deviceId, clientNonce, ...(inviteHash ? {inviteHash} : {}),
  });
  return {challengeId: challenge.challengeId, deviceId: who.deviceId, clientNonce, signature, publicJwk: who.publicJwk};
}
async function bootstrap(access: RoomAccessController) {
  const owner = await identity();
  const challenge = unwrap(await access.issueChallenge({connectionId: 'bootstrap-connection', action: 'bootstrap'}));
  const admission = unwrap(await access.consumeProof(await signedProof(ROOM_ID, challenge, 'bootstrap', owner)));
  return {owner, admission};
}
async function protectedRoom() {
  const storage = new FakeStorage();
  const runtime = testRuntime();
  const access = new RoomAccessController(storage, ROOM_ID, runtime);
  const seeded = await bootstrap(access);
  return {access, runtime, storage, ...seeded};
}
async function joinMember(
  access: RoomAccessController,
  runtime: AccessRuntime,
  ownerDeviceId: string,
  role: 'guest' | 'member' | 'steward' = 'member',
) {
  const member = await identity();
  const invite = unwrap(await access.createInvite(ownerDeviceId, {role, expiresAt: runtime.now() + 20_000}));
  const challenge = unwrap(await access.issueChallenge({connectionId: `join-${role}`, action: 'enroll', inviteId: invite.inviteId}));
  const inviteHash = await hashInviteCapability(ROOM_ID, invite.capability);
  const proof = await signedProof(ROOM_ID, challenge, 'enroll', member, inviteHash);
  const admission = unwrap(await access.consumeProof({...proof, capability: invite.capability}));
  return {member, invite, admission};
}

describe('server-side room admission', () => {
  it('classifies canonical rooms as legacy-open and only empty high-entropy rooms as unclaimed', async () => {
    const canonical = new FakeStorage();
    await canonical.put('magma:timer', {revision: 1});
    expect(await new RoomAccessController(canonical, ROOM_ID).classify()).toBe('legacy-open');
    const currentWorkspace = new FakeStorage();
    await currentWorkspace.put('magma:workspace:v2', [{tasks: {}}, 1]);
    expect(await new RoomAccessController(currentWorkspace, ROOM_ID).classify()).toBe('legacy-open');
    const versionedRoom = new FakeStorage();
    await versionedRoom.put(ROOM_STATE_KEY, {version: 1, persistedAt: 1, values: {}});
    expect(await new RoomAccessController(versionedRoom, ROOM_ID).classify()).toBe('legacy-open');
    expect(await new RoomAccessController(new FakeStorage(), ROOM_ID).classify()).toBe('unclaimed');
    expect(await new RoomAccessController(new FakeStorage(), 'friendly-public-room').classify()).toBe('legacy-open');
  });

  it('admits exactly one of two concurrent signed bootstraps', async () => {
    const storage = new FakeStorage();
    const runtime = testRuntime();
    const access = new RoomAccessController(storage, ROOM_ID, runtime);
    const first = await identity();
    const second = await identity();
    const firstChallenge = unwrap(await access.issueChallenge({connectionId: 'connection-first', action: 'bootstrap'}));
    const secondChallenge = unwrap(await access.issueChallenge({connectionId: 'connection-second', action: 'bootstrap'}));
    const results = await Promise.all([
      access.consumeProof(await signedProof(ROOM_ID, firstChallenge, 'bootstrap', first)),
      access.consumeProof(await signedProof(ROOM_ID, secondChallenge, 'bootstrap', second)),
    ]);
    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect(results.filter((result) => !result.ok).map((result) => result.reason)).toEqual(['already-claimed']);
    const state = await storage.get<DurableAccessState>(ACCESS_STATE_KEY);
    expect(Object.keys(state!.members)).toHaveLength(1);
  });

  it('rejects challenge replay and expiry', async () => {
    const {access, runtime, owner} = await protectedRoom();
    const challenge = unwrap(await access.issueChallenge({connectionId: 'member-proof-one', action: 'prove', deviceId: owner.deviceId}));
    const proof = await signedProof(ROOM_ID, challenge, 'prove', owner);
    expect((await access.consumeProof(proof)).ok).toBe(true);
    expect(await access.consumeProof(proof)).toEqual({ok: false, reason: 'invalid-challenge'});
    const expired = unwrap(await access.issueChallenge({connectionId: 'member-proof-two', action: 'prove', deviceId: owner.deviceId}));
    const expiredProof = await signedProof(ROOM_ID, expired, 'prove', owner);
    runtime.advance(60_001);
    expect(await access.consumeProof(expiredProof)).toEqual({ok: false, reason: 'invalid-challenge'});
  });

  it('enforces one-use invitations, revocation, and rotation', async () => {
    const {access, runtime, owner} = await protectedRoom();
    const invite = unwrap(await access.createInvite(owner.deviceId, {expiresAt: runtime.now() + 20_000}));
    const one = await identity();
    const two = await identity();
    const first = unwrap(await access.issueChallenge({connectionId: 'join-one', action: 'enroll', inviteId: invite.inviteId}));
    const second = unwrap(await access.issueChallenge({connectionId: 'join-two', action: 'enroll', inviteId: invite.inviteId}));
    const hash = await hashInviteCapability(ROOM_ID, invite.capability);
    unwrap(await access.consumeProof({...await signedProof(ROOM_ID, first, 'enroll', one, hash), capability: invite.capability}));
    expect(await access.consumeProof({...await signedProof(ROOM_ID, second, 'enroll', two, hash), capability: invite.capability}))
      .toEqual({ok: false, reason: 'invalid-invite'});

    const revoked = unwrap(await access.createInvite(owner.deviceId, {expiresAt: runtime.now() + 20_000}));
    unwrap(await access.revokeInvite(owner.deviceId, revoked.inviteId));
    expect(await access.issueChallenge({connectionId: 'join-revoked', action: 'enroll', inviteId: revoked.inviteId}))
      .toEqual({ok: false, reason: 'invalid-invite'});
    const rotated = unwrap(await access.createInvite(owner.deviceId, {expiresAt: runtime.now() + 20_000}));
    unwrap(await access.rotateInvitations(owner.deviceId));
    expect(await access.issueChallenge({connectionId: 'join-rotated', action: 'enroll', inviteId: rotated.inviteId}))
      .toEqual({ok: false, reason: 'invalid-invite'});
  });

  it('rotates and replaces an invitation atomically and rejects a replayed operation', async () => {
    const {access, runtime, owner} = await protectedRoom();
    const old = unwrap(await access.createInvite(owner.deviceId, {expiresAt: runtime.now() + 20_000}));
    const replacement = unwrap(await access.createInvite(owner.deviceId, {
      expiresAt: runtime.now() + 20_000,
      rotate: true,
      operationNonce: 'rotate-operation-one',
    }));
    expect(await access.issueChallenge({connectionId: 'old-after-atomic-rotate', action: 'enroll', inviteId: old.inviteId}))
      .toEqual({ok: false, reason: 'invalid-invite'});
    expect((await access.issueChallenge({connectionId: 'replacement-after-rotate', action: 'enroll', inviteId: replacement.inviteId})).ok)
      .toBe(true);
    expect(await access.createInvite(owner.deviceId, {
      expiresAt: runtime.now() + 20_000,
      rotate: true,
      operationNonce: 'rotate-operation-one',
    })).toEqual({ok: false, reason: 'duplicate-operation'});
  });

  it('prunes expired invitation records before enforcing the retained invitation bound', async () => {
    const {access, runtime, owner, storage} = await protectedRoom();
    unwrap(await access.createInvite(owner.deviceId, {expiresAt: runtime.now() + 1}));
    runtime.advance(2);
    const current = unwrap(await access.createInvite(owner.deviceId, {expiresAt: runtime.now() + 20_000}));
    const state = await storage.get<DurableAccessState>(ACCESS_STATE_KEY);
    expect(Object.keys(state!.invites)).toEqual([current.inviteId]);
  });

  it('revokes membership and invalidates outstanding admission tickets', async () => {
    const {access, runtime, owner} = await protectedRoom();
    const joined = await joinMember(access, runtime, owner.deviceId);
    expect(await access.hasRole(joined.member.deviceId, 'member')).toBe(true);
    unwrap(await access.revokeMember(owner.deviceId, joined.member.deviceId));
    expect(await access.hasRole(joined.member.deviceId, 'guest')).toBe(false);
    expect(await access.consumeAdmissionTicket(joined.admission.ticket)).toEqual({ok: false, reason: 'invalid-ticket'});
  });

  it('revokes a durable membership by membership id even when no socket can resolve its device', async () => {
    const {access, runtime, owner} = await protectedRoom();
    const joined = await joinMember(access, runtime, owner.deviceId);
    unwrap(await access.revokeMembership(owner.deviceId, joined.admission.claims.membershipId));
    expect(await access.hasRole(joined.member.deviceId, 'guest')).toBe(false);
    expect((await access.issueChallenge({connectionId: 'removed-member-return', action: 'prove', deviceId: joined.member.deviceId})))
      .toEqual({ok: false, reason: 'unknown-member'});
  });

  it('consumes an admission ticket once', async () => {
    const {access, admission} = await protectedRoom();
    expect((await access.consumeAdmissionTicket(admission.ticket)).ok).toBe(true);
    expect(await access.consumeAdmissionTicket(admission.ticket)).toEqual({ok: false, reason: 'invalid-ticket'});
  });

  it('never persists raw invitation or admission capabilities or private keys', async () => {
    const {access, runtime, storage, owner} = await protectedRoom();
    const joined = await joinMember(access, runtime, owner.deviceId);
    const serialized = await storage.serialized();
    expect(serialized).not.toContain(joined.invite.capability);
    expect(serialized).not.toContain(joined.admission.ticket);
    expect(serialized).not.toContain('privateKey');
    expect(serialized).not.toContain('"d"');
  });

  it('uses the secret-gated room stub for pre-connect and injects trusted claims', async () => {
    const {access, admission} = await protectedRoom();
    let fetchedPath = '';
    const lobby = {
      id: ROOM_ID,
      parties: {main: {get: () => ({fetch: async (path: string, init: RequestInit) => {
        fetchedPath = path;
        return (await handleInternalAdmission(new Request(`https://room.invalid${path}`, init), access, 'internal'))!;
      }})}},
    } as unknown as Party.Lobby;
    const request = new Request(`https://example.invalid/parties/main/${ROOM_ID}?admission=${encodeURIComponent(admission.ticket)}`) as unknown as Party.Request;
    const result = await validateAdmissionBeforeConnect(request, lobby, {partyName: 'main', internalSecret: 'internal'});
    expect(fetchedPath).toBe(INTERNAL_ADMISSION_PATH);
    expect(result).toBeInstanceOf(Request);
    const admitted = result as Request;
    expect(admitted.headers.get(TRUSTED_MEMBER_HEADER)).toMatch(/^mem_/);
    expect(admitted.headers.get(TRUSTED_DEVICE_HEADER)).toMatch(/^dev_/);
    expect(admitted.headers.get(TRUSTED_ROLE_HEADER)).toBe('owner');
    expect(new URL(admitted.url).searchParams.has('admission')).toBe(false);
  });
});
