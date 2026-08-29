import {
  AUTH_ROLES,
  bytesToBase64Url,
  hashInviteCapability,
  normalizeAuthChallenge,
  parseInviteCapability,
  signAuthProof,
  type AuthProofAction,
  type AuthRole,
} from './domain/auth';
import type {StoredDeviceIdentity} from './deviceIdentity';

export type AccessClassification = 'protected' | 'legacy-open' | 'unclaimed';
export type RoomAdmission = {
  ticket: string;
  membershipId: string;
  deviceId: string;
  role: AuthRole;
};

export class RoomAccessError extends Error {
  constructor(readonly reason: string, message = 'The room could not admit this device.') {
    super(message);
    this.name = 'RoomAccessError';
  }
}

type FetchLike = typeof fetch;

export const partyHost = () => import.meta.env.VITE_PARTYKIT_HOST || `${window.location.hostname}:1999`;

export const roomHttpBase = (room: string) => {
  const protocol = window.location.protocol === 'https:' ? 'https' : 'http';
  return `${protocol}://${partyHost()}/parties/main/${encodeURIComponent(room)}`;
};

const accessJson = async <T>(url: string, init: RequestInit, fetchLike: FetchLike): Promise<T> => {
  const response = await fetchLike(url, {...init, headers: {'content-type': 'application/json', ...(init.headers ?? {})}, cache: 'no-store'});
  let body: unknown = null;
  try { body = await response.json(); } catch { /* a denied worker may return plain text */ }
  if (!response.ok) {
    const reason = body && typeof body === 'object' && typeof (body as {reason?: unknown}).reason === 'string'
      ? String((body as {reason: string}).reason)
      : `http-${response.status}`;
    throw new RoomAccessError(reason);
  }
  return body as T;
};

export const getAccessClassification = async (room: string, fetchLike: FetchLike = fetch): Promise<AccessClassification> => {
  const body = await accessJson<{classification?: unknown}>(`${roomHttpBase(room)}/access/status`, {method: 'GET'}, fetchLike);
  if (!['protected', 'legacy-open', 'unclaimed'].includes(String(body.classification))) throw new RoomAccessError('invalid-response');
  return body.classification as AccessClassification;
};

export const admitRoom = async (options: {
  room: string;
  action: AuthProofAction;
  identity: StoredDeviceIdentity;
  capability?: string;
  fetch?: FetchLike;
}): Promise<RoomAdmission> => {
  const fetchLike = options.fetch ?? fetch;
  const connectionId = crypto.randomUUID();
  const clientNonce = bytesToBase64Url(crypto.getRandomValues(new Uint8Array(18)));
  const invite = options.action === 'enroll' ? parseInviteCapability(options.capability) : null;
  if (options.action === 'enroll' && !invite) throw new RoomAccessError('invalid-invite');
  const challengeBody = await accessJson<unknown>(`${roomHttpBase(options.room)}/access/challenge`, {
    method: 'POST',
    body: JSON.stringify({
      connectionId,
      action: options.action,
      ...(options.action === 'prove' ? {deviceId: options.identity.deviceId} : {}),
      ...(invite ? {inviteId: invite.inviteId} : {}),
    }),
  }, fetchLike);
  const challenge = normalizeAuthChallenge(challengeBody);
  if (!challenge || challenge.connectionId !== connectionId || challenge.expiresAt <= Date.now()) throw new RoomAccessError('invalid-challenge');
  const inviteHash = invite ? await hashInviteCapability(options.room, options.capability) : undefined;
  const signature = await signAuthProof(options.identity.privateKey, {
    roomId: options.room,
    connectionId,
    challengeId: challenge.challengeId,
    nonce: challenge.nonce,
    roomEpoch: challenge.roomEpoch,
    action: options.action,
    deviceId: options.identity.deviceId,
    clientNonce,
    ...(inviteHash ? {inviteHash} : {}),
  });
  const admitted = await accessJson<{
    ticket?: unknown;
    claims?: {membershipId?: unknown; deviceId?: unknown; role?: unknown};
  }>(`${roomHttpBase(options.room)}/access/proof`, {
    method: 'POST',
    body: JSON.stringify({
      challengeId: challenge.challengeId,
      deviceId: options.identity.deviceId,
      clientNonce,
      signature,
      ...(options.action === 'prove' ? {} : {publicJwk: options.identity.publicJwk}),
      ...(invite ? {capability: options.capability} : {}),
    }),
  }, fetchLike);
  const {claims} = admitted;
  if (typeof admitted.ticket !== 'string' || !/^mt_[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]{43}$/.test(admitted.ticket)
    || typeof claims?.membershipId !== 'string' || claims.deviceId !== options.identity.deviceId
    || !AUTH_ROLES.includes(claims.role as AuthRole)) throw new RoomAccessError('invalid-response');
  return {
    ticket: admitted.ticket,
    membershipId: claims.membershipId,
    deviceId: claims.deviceId,
    role: claims.role as AuthRole,
  };
};
