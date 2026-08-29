export const AUTH_VERSION = 1 as const;
export const AUTH_ROLES = ['owner', 'steward', 'member', 'guest'] as const;
export type AuthRole = typeof AUTH_ROLES[number];
export type AuthProofAction = 'prove' | 'bootstrap' | 'enroll';

export type AuthProfile = {
  name: string;
  color: string;
  emoji: string;
  intention: string;
};

export type AuthChallenge = {
  type: 'auth.challenge';
  v: typeof AUTH_VERSION;
  challengeId: string;
  nonce: string;
  connectionId: string;
  roomEpoch: number;
  mode: 'unclaimed' | 'legacy-open' | 'locked';
  expiresAt: number;
};

export type AuthProofFields = {
  roomId: string;
  connectionId: string;
  challengeId: string;
  nonce: string;
  roomEpoch: number;
  action: AuthProofAction;
  deviceId: string;
  clientNonce: string;
  inviteHash?: string;
};

export type AuthMembership = {
  deviceId: string;
  membershipId: string;
  publicJwk: JsonWebKey;
  role: AuthRole;
  authRevision: number;
  createdAt: number;
  revokedAt: number | null;
};

export type InvitationRecord = {
  inviteId: string;
  secretHash: string;
  role: Exclude<AuthRole, 'owner'>;
  createdAt: number;
  expiresAt: number;
  maxUses: number;
  uses: number;
  inviteEpoch: number;
  revokedAt: number | null;
  operationNonce?: string;
};

export type AuthClientMessage =
  | {type: 'auth.prove'; challengeId: string; deviceId: string; clientNonce: string; profile: AuthProfile; signature: string}
  | {type: 'auth.bootstrap'; challengeId: string; publicJwk: JsonWebKey; clientNonce: string; profile: AuthProfile; signature: string}
  | {type: 'auth.enroll'; challengeId: string; capability: string; publicJwk: JsonWebKey; clientNonce: string; profile: AuthProfile; signature: string};

export type ParsedInviteCapability = {inviteId: string; secret: string};

type CryptoLike = Pick<Crypto, 'subtle' | 'getRandomValues'>;
type RandomBytes = (length: number) => Uint8Array;

const encoder = new TextEncoder();
const BASE64URL = /^[A-Za-z0-9_-]+$/;
const ID = /^[A-Za-z0-9_-]{8,80}$/;
const DEVICE_ID = /^dev_[A-Za-z0-9_-]{43}$/;
const SIGNATURE = /^[A-Za-z0-9_-]{80,180}$/;
const INVITE_ID = /^[A-Za-z0-9_-]{16}$/;
const INVITE_SECRET = /^[A-Za-z0-9_-]{43}$/;

const boundedText = (value: unknown, max: number): string =>
  typeof value === 'string' ? value.trim().slice(0, max) : '';

const boundedToken = (value: unknown, max: number): string =>
  typeof value === 'string' && value.length <= max ? value : '';

const boundedTime = (value: unknown): number | null =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === 'object' && !Array.isArray(value));

export const bytesToBase64Url = (bytes: Uint8Array): string => {
  let binary = '';
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  }
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
};

export const base64UrlToBytes = (value: string): Uint8Array | null => {
  if (!value || !BASE64URL.test(value)) return null;
  try {
    const padded = value.replaceAll('-', '+').replaceAll('_', '/') + '='.repeat((4 - value.length % 4) % 4);
    const binary = atob(padded);
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    return bytesToBase64Url(bytes) === value ? bytes : null;
  } catch {
    return null;
  }
};

export const normalizePublicJwk = (value: unknown): JsonWebKey | null => {
  if (!isRecord(value)) return null;
  const x = typeof value.x === 'string' ? value.x : '';
  const y = typeof value.y === 'string' ? value.y : '';
  if (value.kty !== 'EC' || value.crv !== 'P-256' || value.d !== undefined) return null;
  if (!BASE64URL.test(x) || !BASE64URL.test(y) || base64UrlToBytes(x)?.length !== 32 || base64UrlToBytes(y)?.length !== 32) return null;
  if (value.alg !== undefined && value.alg !== 'ES256') return null;
  if (value.use !== undefined && value.use !== 'sig') return null;
  if (value.ext !== undefined && value.ext !== true) return null;
  if (value.key_ops !== undefined && (!Array.isArray(value.key_ops) || value.key_ops.length !== 1 || value.key_ops[0] !== 'verify')) return null;
  return {kty: 'EC', crv: 'P-256', x, y, ext: true, key_ops: ['verify']};
};

const normalizeProfile = (value: unknown): AuthProfile | null => {
  if (!isRecord(value)) return null;
  const name = boundedText(value.name, 32);
  if (!name) return null;
  return {
    name,
    color: typeof value.color === 'string' && /^#[0-9a-fA-F]{6}$/.test(value.color) ? value.color : '#9d8cff',
    emoji: boundedText(value.emoji, 8) || '🫧',
    intention: boundedText(value.intention, 120),
  };
};

export const normalizeAuthChallenge = (value: unknown): AuthChallenge | null => {
  if (!isRecord(value) || value.type !== 'auth.challenge' || value.v !== AUTH_VERSION) return null;
  const challengeId = boundedToken(value.challengeId, 80);
  const nonce = boundedToken(value.nonce, 80);
  const connectionId = boundedToken(value.connectionId, 80);
  const roomEpoch = boundedTime(value.roomEpoch);
  const expiresAt = boundedTime(value.expiresAt);
  const mode = value.mode;
  if (!ID.test(challengeId) || !ID.test(nonce) || !connectionId || roomEpoch === null || expiresAt === null
    || !['unclaimed', 'legacy-open', 'locked'].includes(String(mode))) return null;
  return {type: 'auth.challenge', v: AUTH_VERSION, challengeId, nonce, connectionId, roomEpoch, mode: mode as AuthChallenge['mode'], expiresAt};
};

export const normalizeMembership = (value: unknown): AuthMembership | null => {
  if (!isRecord(value)) return null;
  const publicJwk = normalizePublicJwk(value.publicJwk);
  const deviceId = boundedToken(value.deviceId, 80);
  const membershipId = boundedToken(value.membershipId, 80);
  const authRevision = boundedTime(value.authRevision);
  const createdAt = boundedTime(value.createdAt);
  const revokedAt = value.revokedAt === null ? null : boundedTime(value.revokedAt);
  if (!DEVICE_ID.test(deviceId) || !ID.test(membershipId) || !AUTH_ROLES.includes(value.role as AuthRole)
    || !publicJwk || authRevision === null || createdAt === null || revokedAt === null && value.revokedAt !== null) return null;
  return {deviceId, membershipId, publicJwk, role: value.role as AuthRole, authRevision, createdAt, revokedAt};
};

export const normalizeInvitationRecord = (value: unknown): InvitationRecord | null => {
  if (!isRecord(value)) return null;
  const inviteId = boundedToken(value.inviteId, 80);
  const secretHash = boundedToken(value.secretHash, 80);
  const role = value.role;
  const createdAt = boundedTime(value.createdAt);
  const expiresAt = boundedTime(value.expiresAt);
  const maxUses = boundedTime(value.maxUses);
  const uses = boundedTime(value.uses);
  const inviteEpoch = boundedTime(value.inviteEpoch);
  const revokedAt = value.revokedAt === null ? null : boundedTime(value.revokedAt);
  if (!INVITE_ID.test(inviteId) || !/^[A-Za-z0-9_-]{43}$/.test(secretHash)
    || !['steward', 'member', 'guest'].includes(String(role)) || createdAt === null || expiresAt === null
    || maxUses === null || maxUses < 1 || maxUses > 64 || uses === null || uses > maxUses || inviteEpoch === null
    || revokedAt === null && value.revokedAt !== null) return null;
  return {inviteId, secretHash, role: role as InvitationRecord['role'], createdAt, expiresAt, maxUses, uses, inviteEpoch, revokedAt};
};

export const normalizeAuthClientMessage = (value: unknown): AuthClientMessage | null => {
  if (!isRecord(value)) return null;
  const challengeId = boundedToken(value.challengeId, 80);
  const clientNonce = boundedToken(value.clientNonce, 80);
  const signature = boundedToken(value.signature, 180);
  const profile = normalizeProfile(value.profile);
  if (!ID.test(challengeId) || !ID.test(clientNonce) || !SIGNATURE.test(signature) || !profile) return null;
  if (value.type === 'auth.prove') {
    const deviceId = boundedToken(value.deviceId, 80);
    return DEVICE_ID.test(deviceId) ? {type: value.type, challengeId, deviceId, clientNonce, profile, signature} : null;
  }
  const publicJwk = normalizePublicJwk(value.publicJwk);
  if (!publicJwk) return null;
  if (value.type === 'auth.bootstrap') return {type: value.type, challengeId, publicJwk, clientNonce, profile, signature};
  if (value.type === 'auth.enroll' && parseInviteCapability(value.capability)) {
    return {type: value.type, challengeId, capability: String(value.capability), publicJwk, clientNonce, profile, signature};
  }
  return null;
};

const proofTuple = (fields: AuthProofFields) => {
  if (!/^[a-z0-9-]{1,64}$/.test(fields.roomId) || !fields.connectionId || fields.connectionId.length > 80
    || !ID.test(fields.challengeId) || !ID.test(fields.nonce) || !Number.isSafeInteger(fields.roomEpoch) || fields.roomEpoch < 0
    || !['prove', 'bootstrap', 'enroll'].includes(fields.action) || !DEVICE_ID.test(fields.deviceId)
    || !ID.test(fields.clientNonce) || (fields.inviteHash !== undefined && !/^[A-Za-z0-9_-]{43}$/.test(fields.inviteHash))) {
    throw new TypeError('Invalid authentication proof fields');
  }
  return ['magma-auth-v1', fields.roomId, fields.connectionId, fields.challengeId, fields.nonce,
    fields.roomEpoch, fields.action, fields.deviceId, fields.clientNonce, fields.inviteHash ?? ''] as const;
};

export const canonicalProofBytes = (fields: AuthProofFields): Uint8Array => encoder.encode(JSON.stringify(proofTuple(fields)));

const ownedBuffer = (bytes: Uint8Array): ArrayBuffer => Uint8Array.from(bytes).buffer;

export const generateSigningKeyPair = async (cryptoLike: CryptoLike = crypto): Promise<CryptoKeyPair> =>
  cryptoLike.subtle.generateKey({name: 'ECDSA', namedCurve: 'P-256'}, false, ['sign', 'verify']);

export const exportPublicJwk = async (publicKey: CryptoKey, cryptoLike: CryptoLike = crypto): Promise<JsonWebKey> => {
  const jwk = normalizePublicJwk(await cryptoLike.subtle.exportKey('jwk', publicKey));
  if (!jwk) throw new TypeError('Generated public key was not a valid P-256 verification key');
  return jwk;
};

export const importPublicJwk = async (value: unknown, cryptoLike: CryptoLike = crypto): Promise<CryptoKey> => {
  const jwk = normalizePublicJwk(value);
  if (!jwk) throw new TypeError('Invalid P-256 public JWK');
  return cryptoLike.subtle.importKey('jwk', jwk, {name: 'ECDSA', namedCurve: 'P-256'}, true, ['verify']);
};

export const deriveDeviceId = async (value: unknown, cryptoLike: CryptoLike = crypto): Promise<string> => {
  const publicKey = await importPublicJwk(value, cryptoLike);
  const spki = await cryptoLike.subtle.exportKey('spki', publicKey);
  return `dev_${bytesToBase64Url(new Uint8Array(await cryptoLike.subtle.digest('SHA-256', spki)))}`;
};

export const membershipMatchesDeviceId = async (value: unknown, cryptoLike: CryptoLike = crypto): Promise<boolean> => {
  const membership = normalizeMembership(value);
  return Boolean(membership && await deriveDeviceId(membership.publicJwk, cryptoLike) === membership.deviceId);
};

export const equalBase64Url = (left: string, right: string): boolean => {
  const leftBytes = base64UrlToBytes(left);
  const rightBytes = base64UrlToBytes(right);
  if (!leftBytes || !rightBytes || leftBytes.length !== rightBytes.length) return false;
  let difference = 0;
  for (let index = 0; index < leftBytes.length; index += 1) difference |= leftBytes[index] ^ rightBytes[index];
  return difference === 0;
};

export const signAuthProof = async (privateKey: CryptoKey, fields: AuthProofFields, cryptoLike: CryptoLike = crypto): Promise<string> =>
  bytesToBase64Url(new Uint8Array(await cryptoLike.subtle.sign({name: 'ECDSA', hash: 'SHA-256'}, privateKey, ownedBuffer(canonicalProofBytes(fields)))));

export const verifyAuthProof = async (publicJwk: unknown, fields: AuthProofFields, signature: string, cryptoLike: CryptoLike = crypto): Promise<boolean> => {
  const bytes = base64UrlToBytes(signature);
  if (!bytes || bytes.length !== 64) return false;
  try {
    const publicKey = await importPublicJwk(publicJwk, cryptoLike);
    return cryptoLike.subtle.verify({name: 'ECDSA', hash: 'SHA-256'}, publicKey, ownedBuffer(bytes), ownedBuffer(canonicalProofBytes(fields)));
  } catch {
    return false;
  }
};

const defaultRandomBytes = (cryptoLike: CryptoLike): RandomBytes => (length) => cryptoLike.getRandomValues(new Uint8Array(length));

export const generateInviteCapability = (
  cryptoLike: CryptoLike = crypto,
  randomBytes: RandomBytes = defaultRandomBytes(cryptoLike),
): string => {
  const inviteId = randomBytes(12);
  const secret = randomBytes(32);
  if (inviteId.length !== 12 || secret.length !== 32) throw new TypeError('Random source returned the wrong number of bytes');
  return `mgi1.${bytesToBase64Url(inviteId)}.${bytesToBase64Url(secret)}`;
};

export const parseInviteCapability = (value: unknown): ParsedInviteCapability | null => {
  if (typeof value !== 'string' || value.length > 80) return null;
  const [version, inviteId, secret, extra] = value.split('.');
  return version === 'mgi1' && extra === undefined && INVITE_ID.test(inviteId) && INVITE_SECRET.test(secret)
    ? {inviteId, secret}
    : null;
};

export const hashInviteCapability = async (roomId: string, capability: unknown, cryptoLike: CryptoLike = crypto): Promise<string> => {
  const parsed = parseInviteCapability(capability);
  if (!parsed || !/^[a-z0-9-]{1,64}$/.test(roomId)) throw new TypeError('Invalid invitation capability');
  const payload = encoder.encode(JSON.stringify(['magma-invite-v1', roomId, parsed.inviteId, parsed.secret]));
  return bytesToBase64Url(new Uint8Array(await cryptoLike.subtle.digest('SHA-256', payload)));
};
