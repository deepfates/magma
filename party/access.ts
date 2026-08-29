import type * as Party from 'partykit/server';
import {
  AUTH_VERSION, base64UrlToBytes, bytesToBase64Url, deriveDeviceId, generateInviteCapability, hashInviteCapability,
  normalizePublicJwk, parseInviteCapability, verifyAuthProof,
  type AuthChallenge, type AuthMembership, type AuthProofAction, type AuthRole, type InvitationRecord,
} from '../src/domain/auth';

export const ACCESS_STATE_KEY = 'magma:access:v1';
export const INTERNAL_ADMISSION_PATH = '/__magma/access/admit';
export const TRUSTED_MEMBER_HEADER = 'x-magma-member-id';
export const TRUSTED_DEVICE_HEADER = 'x-magma-device-id';
export const TRUSTED_ROLE_HEADER = 'x-magma-member-role';
const CANONICAL_ROOM_KEYS = ['magma:timer', 'magma:artifacts', 'magma:media', 'magma:workspace:v2', 'hasStore'] as const;
const CHALLENGE_TTL_MS = 60_000;
const TICKET_TTL_MS = 30_000;
const MAX_MEMBERS = 64;
const MAX_INVITES = 64;
const MAX_EPHEMERAL = 96;

export type AccessRole = AuthRole;
export type RoomAccessClassification = 'protected' | 'legacy-open' | 'unclaimed';
export interface AccessStore { get<T>(key: string): Promise<T | undefined>; put<T>(key: string, value: T): Promise<void>; }
export interface AccessStorage extends AccessStore { transaction<T>(operation: (transaction: AccessStore) => Promise<T>): Promise<T>; }
export interface AccessRuntime { now(): number; randomBytes(length: number): Uint8Array; }
export type AccessResult<T> = {ok: true; value: T} | {ok: false; reason: string};

export interface AccessConfig {
  version: 1;
  ownerMembershipId: string;
  roomEpoch: number;
  inviteEpoch: number;
  authRevision: number;
  createdAt: number;
  updatedAt: number;
}
interface StoredChallenge {
  wire: AuthChallenge;
  action: AuthProofAction;
  deviceId?: string;
  inviteId?: string;
  consumedAt: number | null;
}
interface AdmissionTicketRecord {
  ticketId: string;
  secretHash: string;
  membershipId: string;
  deviceId: string;
  role: AuthRole;
  issuedAt: number;
  expiresAt: number;
  consumedAt: number | null;
}
export interface DurableAccessState {
  config: AccessConfig | null;
  members: Record<string, AuthMembership>;
  invites: Record<string, InvitationRecord>;
  challenges: Record<string, StoredChallenge>;
  tickets: Record<string, AdmissionTicketRecord>;
}
export interface AdmissionClaims { membershipId: string; deviceId: string; role: AuthRole; }
export type ConsumeProof = {
  challengeId: string;
  deviceId: string;
  clientNonce: string;
  signature: string;
  publicJwk?: JsonWebKey;
  capability?: string;
};

/** Narrow PartyKit's durable storage to the surface used by the access state machine. */
export function partyAccessStorage(storage: Party.Storage): AccessStorage {
  return {
    get: <T>(key: string) => storage.get<T>(key),
    put: <T>(key: string, value: T) => storage.put(key, value),
    transaction: <T>(operation: (transaction: AccessStore) => Promise<T>) => storage.transaction((transaction) => operation({
      get: <Value>(key: string) => transaction.get<Value>(key),
      put: <Value>(key: string, value: Value) => transaction.put(key, value),
    })),
  };
}

const defaultRuntime: AccessRuntime = {
  now: () => Date.now(),
  randomBytes: (length) => crypto.getRandomValues(new Uint8Array(length)),
};
const roleRank: Record<AuthRole, number> = {guest: 0, member: 1, steward: 2, owner: 3};
const emptyState = (): DurableAccessState => ({config: null, members: {}, invites: {}, challenges: {}, tickets: {}});
const isHighEntropyRoomId = (roomId: string): boolean =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(roomId)
  || (/^[A-Za-z0-9_-]{22,64}$/.test(roomId) && /[A-Z]/.test(roomId) && /[a-z]/.test(roomId) && /[0-9_-]/.test(roomId));
const randomId = (runtime: AccessRuntime, bytes = 12): string => bytesToBase64Url(runtime.randomBytes(bytes));

async function digestTicketSecret(secret: string): Promise<string> {
  const payload = Uint8Array.from(new TextEncoder().encode(`magma-admission-ticket-v1\n${secret}`)).buffer;
  return bytesToBase64Url(new Uint8Array(await crypto.subtle.digest('SHA-256', payload)));
}
function newTicket(runtime: AccessRuntime): {id: string; secret: string; raw: string} {
  const id = randomId(runtime);
  const secret = randomId(runtime, 32);
  return {id, secret, raw: `mt_${id}.${secret}`};
}
function parseTicket(value: string): {id: string; secret: string} | null {
  const match = /^mt_([A-Za-z0-9_-]{16})\.([A-Za-z0-9_-]{43})$/.exec(value);
  return match ? {id: match[1], secret: match[2]} : null;
}
function activeMember(state: DurableAccessState, deviceId: string): AuthMembership | null {
  const member = state.members[deviceId];
  return member?.revokedAt === null ? member : null;
}
const actorCanManage = (actor: AuthMembership, role: AuthRole): boolean => roleRank[actor.role] > roleRank[role];
function constantTimeDigestEqual(left: string, right: string): boolean {
  const leftBytes = base64UrlToBytes(left);
  const rightBytes = base64UrlToBytes(right);
  if (!leftBytes || !rightBytes || leftBytes.length !== rightBytes.length) return false;
  let difference = 0;
  for (let index = 0; index < leftBytes.length; index += 1) difference |= leftBytes[index] ^ rightBytes[index];
  return difference === 0;
}
function prune(state: DurableAccessState, now: number): void {
  for (const [id, challenge] of Object.entries(state.challenges)) {
    if (challenge.wire.expiresAt <= now || challenge.consumedAt !== null) delete state.challenges[id];
  }
  for (const [id, ticket] of Object.entries(state.tickets)) {
    if (ticket.expiresAt <= now || ticket.consumedAt !== null) delete state.tickets[id];
  }
  const bound = <T>(records: Record<string, T>, time: (record: T) => number) => {
    for (const [id] of Object.entries(records).sort((a, b) => time(b[1]) - time(a[1])).slice(MAX_EPHEMERAL)) delete records[id];
  };
  bound(state.challenges, (record) => record.wire.expiresAt);
  bound(state.tickets, (record) => record.issuedAt);
}

function pruneInvitations(state: DurableAccessState, now: number): void {
  for (const [id, invite] of Object.entries(state.invites)) {
    if (invite.revokedAt !== null || invite.expiresAt <= now || invite.inviteEpoch !== state.config?.inviteEpoch) {
      delete state.invites[id];
    }
  }
}

export class RoomAccessController {
  constructor(private readonly storage: AccessStorage, readonly roomId: string, private readonly runtime: AccessRuntime = defaultRuntime) {}

  private async hasCanonicalData(store: AccessStore): Promise<boolean> {
    for (const key of CANONICAL_ROOM_KEYS) if ((await store.get(key)) !== undefined) return true;
    return false;
  }
  async classify(): Promise<RoomAccessClassification> {
    const state = await this.storage.get<DurableAccessState>(ACCESS_STATE_KEY);
    if (state?.config) return 'protected';
    if (await this.hasCanonicalData(this.storage)) return 'legacy-open';
    return isHighEntropyRoomId(this.roomId) ? 'unclaimed' : 'legacy-open';
  }

  async issueChallenge(request: {connectionId: string; action: AuthProofAction; deviceId?: string; inviteId?: string}): Promise<AccessResult<AuthChallenge>> {
    if (!request.connectionId || request.connectionId.length > 80) return {ok: false, reason: 'invalid-connection'};
    return this.storage.transaction(async (transaction) => {
      const state = (await transaction.get<DurableAccessState>(ACCESS_STATE_KEY)) ?? emptyState();
      const now = this.runtime.now();
      prune(state, now);
      if (request.action === 'bootstrap') {
        if (state.config) return {ok: false, reason: 'already-claimed'};
        if (await this.hasCanonicalData(transaction)) return {ok: false, reason: 'legacy-room'};
        if (!isHighEntropyRoomId(this.roomId)) return {ok: false, reason: 'room-id-not-bootstrap-eligible'};
      } else if (request.action === 'prove') {
        if (!request.deviceId || !activeMember(state, request.deviceId)) return {ok: false, reason: 'unknown-member'};
      } else {
        const invite = request.inviteId && state.invites[request.inviteId];
        if (!state.config || !invite || invite.revokedAt !== null || invite.expiresAt <= now || invite.uses >= invite.maxUses
          || invite.inviteEpoch !== state.config.inviteEpoch) return {ok: false, reason: 'invalid-invite'};
      }
      const challenge: AuthChallenge = {
        type: 'auth.challenge', v: AUTH_VERSION, challengeId: randomId(this.runtime), nonce: randomId(this.runtime, 24),
        connectionId: request.connectionId, roomEpoch: state.config?.roomEpoch ?? 0,
        mode: state.config ? 'locked' : 'unclaimed', expiresAt: now + CHALLENGE_TTL_MS,
      };
      state.challenges[challenge.challengeId] = {
        wire: challenge, action: request.action,
        ...(request.deviceId ? {deviceId: request.deviceId} : {}), ...(request.inviteId ? {inviteId: request.inviteId} : {}),
        consumedAt: null,
      };
      await transaction.put(ACCESS_STATE_KEY, state);
      return {ok: true, value: challenge};
    });
  }

  async consumeProof(proof: ConsumeProof): Promise<AccessResult<{ticket: string; claims: AdmissionClaims}>> {
    return this.storage.transaction(async (transaction) => {
      const state = await transaction.get<DurableAccessState>(ACCESS_STATE_KEY);
      const stored = state?.challenges[proof.challengeId];
      const now = this.runtime.now();
      if (!state || !stored || stored.consumedAt !== null || stored.wire.expiresAt <= now) return {ok: false, reason: 'invalid-challenge'};
      let publicJwk: JsonWebKey | null;
      let role: AuthRole;
      let inviteHash: string | undefined;
      if (stored.action === 'prove') {
        const member = activeMember(state, proof.deviceId);
        if (!member || stored.deviceId !== proof.deviceId) return {ok: false, reason: 'revoked-member'};
        publicJwk = member.publicJwk;
        role = member.role;
      } else {
        publicJwk = normalizePublicJwk(proof.publicJwk);
        if (!publicJwk || await deriveDeviceId(publicJwk) !== proof.deviceId) return {ok: false, reason: 'invalid-device'};
        if (stored.action === 'bootstrap') {
          if (state.config) return {ok: false, reason: 'already-claimed'};
          if (await this.hasCanonicalData(transaction) || !isHighEntropyRoomId(this.roomId)) return {ok: false, reason: 'legacy-room'};
          role = 'owner';
        } else {
          const parsed = parseInviteCapability(proof.capability);
          const invite = parsed && state.config && state.invites[parsed.inviteId];
          if (!parsed || !invite || stored.inviteId !== parsed.inviteId || invite.revokedAt !== null || invite.expiresAt <= now
            || invite.uses >= invite.maxUses || invite.inviteEpoch !== state.config!.inviteEpoch) return {ok: false, reason: 'invalid-invite'};
          inviteHash = await hashInviteCapability(this.roomId, proof.capability);
          if (!constantTimeDigestEqual(inviteHash, invite.secretHash)) return {ok: false, reason: 'invalid-invite'};
          role = invite.role;
        }
      }
      const fields = {
        roomId: this.roomId, connectionId: stored.wire.connectionId, challengeId: stored.wire.challengeId,
        nonce: stored.wire.nonce, roomEpoch: stored.wire.roomEpoch, action: stored.action,
        deviceId: proof.deviceId, clientNonce: proof.clientNonce, ...(inviteHash ? {inviteHash} : {}),
      } as const;
      if (!(await verifyAuthProof(publicJwk, fields, proof.signature))) return {ok: false, reason: 'invalid-proof'};
      let member = activeMember(state, proof.deviceId);
      if (stored.action !== 'prove') {
        if (Object.values(state.members).filter((candidate) => candidate.revokedAt === null).length >= MAX_MEMBERS) {
          return {ok: false, reason: 'member-limit'};
        }
        const membershipId = `mem_${randomId(this.runtime)}`;
        const revision = (state.config?.authRevision ?? 0) + 1;
        member = {deviceId: proof.deviceId, membershipId, publicJwk, role, authRevision: revision, createdAt: now, revokedAt: null};
        state.members[proof.deviceId] = member;
        if (stored.action === 'bootstrap') {
          state.config = {version: 1, ownerMembershipId: membershipId, roomEpoch: 1, inviteEpoch: 1, authRevision: revision, createdAt: now, updatedAt: now};
        } else {
          state.invites[stored.inviteId!].uses += 1;
          state.config!.authRevision = revision;
          state.config!.updatedAt = now;
        }
      }
      stored.consumedAt = now;
      const ticket = newTicket(this.runtime);
      const claims: AdmissionClaims = {membershipId: member!.membershipId, deviceId: proof.deviceId, role: member!.role};
      state.tickets[ticket.id] = {
        ticketId: ticket.id, secretHash: await digestTicketSecret(ticket.secret), ...claims,
        issuedAt: now, expiresAt: now + TICKET_TTL_MS, consumedAt: null,
      };
      prune(state, now);
      await transaction.put(ACCESS_STATE_KEY, state);
      return {ok: true, value: {ticket: ticket.raw, claims}};
    });
  }

  async createInvite(actorDeviceId: string, options: {
    role?: Exclude<AuthRole, 'owner'>;
    maxUses?: number;
    expiresAt: number;
    rotate?: boolean;
    operationNonce?: string;
  }): Promise<AccessResult<{inviteId: string; capability: string}>> {
    const capability = generateInviteCapability(crypto, (length) => this.runtime.randomBytes(length));
    const parsed = parseInviteCapability(capability)!;
    const secretHash = await hashInviteCapability(this.roomId, capability);
    const role = options.role ?? 'member';
    return this.storage.transaction(async (transaction) => {
      const state = await transaction.get<DurableAccessState>(ACCESS_STATE_KEY);
      const actor = state && activeMember(state, actorDeviceId);
      if (!state?.config || !actor || (role !== 'member' && !actorCanManage(actor, role))) return {ok: false, reason: 'forbidden'};
      if (options.rotate && actor.role !== 'owner') return {ok: false, reason: 'forbidden'};
      if (options.operationNonce && Object.values(state.invites).some((invite) => invite.operationNonce === options.operationNonce)) {
        return {ok: false, reason: 'duplicate-operation'};
      }
      const now = this.runtime.now();
      if (options.expiresAt <= now) return {ok: false, reason: 'invalid-expiry'};
      if (options.rotate) state.config.inviteEpoch += 1;
      pruneInvitations(state, now);
      if (Object.keys(state.invites).length >= MAX_INVITES) return {ok: false, reason: 'invite-limit'};
      state.invites[parsed.inviteId] = {
        inviteId: parsed.inviteId, secretHash, role, createdAt: now, expiresAt: options.expiresAt,
        maxUses: Math.max(1, Math.min(64, Math.floor(options.maxUses ?? 1))), uses: 0,
        inviteEpoch: state.config.inviteEpoch, revokedAt: null,
        ...(options.operationNonce ? {operationNonce: options.operationNonce} : {}),
      };
      state.config.updatedAt = now;
      await transaction.put(ACCESS_STATE_KEY, state);
      return {ok: true, value: {inviteId: parsed.inviteId, capability}};
    });
  }

  async revokeInvite(actorDeviceId: string, inviteId: string): Promise<AccessResult<null>> {
    return this.storage.transaction(async (transaction) => {
      const state = await transaction.get<DurableAccessState>(ACCESS_STATE_KEY);
      const actor = state && activeMember(state, actorDeviceId);
      const invite = state?.invites[inviteId];
      if (!state?.config || !actor || !invite || !actorCanManage(actor, invite.role)) return {ok: false, reason: 'forbidden'};
      invite.revokedAt = this.runtime.now();
      state.config.updatedAt = this.runtime.now();
      await transaction.put(ACCESS_STATE_KEY, state);
      return {ok: true, value: null};
    });
  }
  async rotateInvitations(actorDeviceId: string): Promise<AccessResult<number>> {
    return this.storage.transaction(async (transaction) => {
      const state = await transaction.get<DurableAccessState>(ACCESS_STATE_KEY);
      const actor = state && activeMember(state, actorDeviceId);
      if (!state?.config || actor?.role !== 'owner') return {ok: false, reason: 'forbidden'};
      state.config.inviteEpoch += 1;
      state.config.updatedAt = this.runtime.now();
      await transaction.put(ACCESS_STATE_KEY, state);
      return {ok: true, value: state.config.inviteEpoch};
    });
  }
  async revokeMembership(actorDeviceId: string, membershipId: string): Promise<AccessResult<null>> {
    return this.storage.transaction(async (transaction) => {
      const state = await transaction.get<DurableAccessState>(ACCESS_STATE_KEY);
      const actor = state && activeMember(state, actorDeviceId);
      const target = state && Object.values(state.members).find((candidate) => candidate.membershipId === membershipId && candidate.revokedAt === null);
      if (!state?.config || !actor || !target || !actorCanManage(actor, target.role)) return {ok: false, reason: 'forbidden'};
      target.revokedAt = this.runtime.now();
      state.config.authRevision += 1;
      state.config.updatedAt = this.runtime.now();
      for (const challenge of Object.values(state.challenges)) if (challenge.deviceId === target.deviceId) challenge.consumedAt = this.runtime.now();
      for (const ticket of Object.values(state.tickets)) if (ticket.deviceId === target.deviceId) ticket.consumedAt = this.runtime.now();
      await transaction.put(ACCESS_STATE_KEY, state);
      return {ok: true, value: null};
    });
  }
  async revokeMember(actorDeviceId: string, deviceId: string): Promise<AccessResult<null>> {
    const state = await this.storage.get<DurableAccessState>(ACCESS_STATE_KEY);
    const target = state && activeMember(state, deviceId);
    return target ? this.revokeMembership(actorDeviceId, target.membershipId) : {ok: false, reason: 'forbidden'};
  }
  async validateClaims(claims: AdmissionClaims): Promise<boolean> {
    const state = await this.storage.get<DurableAccessState>(ACCESS_STATE_KEY);
    const member = state && activeMember(state, claims.deviceId);
    return Boolean(member && member.membershipId === claims.membershipId && member.role === claims.role);
  }
  async hasRole(deviceId: string, minimumRole: AuthRole): Promise<boolean> {
    const state = await this.storage.get<DurableAccessState>(ACCESS_STATE_KEY);
    const member = state && activeMember(state, deviceId);
    return Boolean(member && roleRank[member.role] >= roleRank[minimumRole]);
  }
  async consumeAdmissionTicket(raw: string): Promise<AccessResult<AdmissionClaims>> {
    const parsed = parseTicket(raw);
    if (!parsed) return {ok: false, reason: 'invalid-ticket'};
    const secretHash = await digestTicketSecret(parsed.secret);
    return this.storage.transaction(async (transaction) => {
      const state = await transaction.get<DurableAccessState>(ACCESS_STATE_KEY);
      const ticket = state?.tickets[parsed.id];
      const now = this.runtime.now();
      if (!state || !ticket || ticket.consumedAt !== null || ticket.expiresAt <= now
        || !constantTimeDigestEqual(ticket.secretHash, secretHash)) return {ok: false, reason: 'invalid-ticket'};
      const member = activeMember(state, ticket.deviceId);
      if (!member || member.membershipId !== ticket.membershipId || member.role !== ticket.role) return {ok: false, reason: 'revoked-member'};
      ticket.consumedAt = now;
      await transaction.put(ACCESS_STATE_KEY, state);
      return {ok: true, value: {membershipId: ticket.membershipId, deviceId: ticket.deviceId, role: ticket.role}};
    });
  }
}

export async function handleInternalAdmission(request: Request, controller: RoomAccessController, internalSecret: string): Promise<Response | null> {
  if (!new URL(request.url).pathname.endsWith(INTERNAL_ADMISSION_PATH)) return null;
  if (!internalSecret || request.headers.get('x-magma-internal-auth') !== internalSecret) return new Response('Forbidden', {status: 403});
  if (request.method !== 'POST') return new Response('Method not allowed', {status: 405});
  let ticket = '';
  try { ticket = String(((await request.json()) as {ticket?: unknown}).ticket ?? ''); } catch { return new Response('Bad request', {status: 400}); }
  const result = await controller.consumeAdmissionTicket(ticket);
  return result.ok ? Response.json(result.value) : Response.json({reason: result.reason}, {status: 401});
}
export type AdmissionBeforeConnectOptions = {
  partyName: string;
  /** A local dev binding or deployed worker secret. Missing values reject; never expose this to clients. */
  internalSecret: string;
  ticketParameter?: string;
};

export async function validateAdmissionBeforeConnect(
  request: Party.Request, lobby: Party.Lobby,
  options: AdmissionBeforeConnectOptions,
): Promise<Request | Response> {
  // Supply internalSecret from a local-only dev binding and a deployed worker secret.
  // Missing secrets fail closed; never derive it from the request or expose a public fallback.
  const url = new URL(request.url);
  const parameter = options.ticketParameter ?? 'admission';
  const ticket = url.searchParams.get(parameter);
  if (!ticket || !options.internalSecret) return new Response('Admission required', {status: 401});
  const response = await lobby.parties[options.partyName].get(lobby.id).fetch(INTERNAL_ADMISSION_PATH, {
    method: 'POST', headers: {'content-type': 'application/json', 'x-magma-internal-auth': options.internalSecret}, body: JSON.stringify({ticket}),
  });
  if (!response.ok) return new Response('Admission denied', {status: 401});
  const claims = (await response.json()) as AdmissionClaims;
  url.searchParams.delete(parameter);
  const headers = new Headers();
  request.headers.forEach((value, key) => headers.append(key, value));
  headers.set(TRUSTED_MEMBER_HEADER, claims.membershipId);
  headers.set(TRUSTED_DEVICE_HEADER, claims.deviceId);
  headers.set(TRUSTED_ROLE_HEADER, claims.role);
  return new Request(url, {method: request.method, headers});
}
