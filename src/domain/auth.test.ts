import {describe, expect, it} from 'vitest';
import {
  base64UrlToBytes,
  bytesToBase64Url,
  canonicalProofBytes,
  deriveDeviceId,
  equalBase64Url,
  exportPublicJwk,
  generateInviteCapability,
  generateSigningKeyPair,
  hashInviteCapability,
  normalizeAuthChallenge,
  normalizeAuthClientMessage,
  normalizeInvitationRecord,
  normalizeMembership,
  normalizePublicJwk,
  parseInviteCapability,
  membershipMatchesDeviceId,
  signAuthProof,
  verifyAuthProof,
  type AuthProofFields,
} from './auth';

const proof = (deviceId: string): AuthProofFields => ({
  roomId: 'glow-room',
  connectionId: 'connection-one',
  challengeId: 'challenge-one',
  nonce: 'server-nonce-one',
  roomEpoch: 3,
  action: 'prove',
  deviceId,
  clientNonce: 'client-nonce-one',
});

describe('authentication cryptography', () => {
  it('creates a non-extractable signing key and a strict, stable device fingerprint', async () => {
    const pair = await generateSigningKeyPair();
    const jwk = await exportPublicJwk(pair.publicKey);
    expect(pair.privateKey.extractable).toBe(false);
    expect(pair.privateKey.usages).toEqual(['sign']);
    expect(normalizePublicJwk(jwk)).toEqual(jwk);
    expect(await deriveDeviceId(jwk)).toMatch(/^dev_[A-Za-z0-9_-]{43}$/);
    expect(await deriveDeviceId({...jwk})).toBe(await deriveDeviceId(jwk));
  });

  it('uses deterministic fixed-field bytes and rejects every replay-context change', async () => {
    const pair = await generateSigningKeyPair();
    const jwk = await exportPublicJwk(pair.publicKey);
    const fields = proof(await deriveDeviceId(jwk));
    const signature = await signAuthProof(pair.privateKey, fields);
    expect(canonicalProofBytes({...fields})).toEqual(canonicalProofBytes(fields));
    expect(await verifyAuthProof(jwk, fields, signature)).toBe(true);

    const changes: AuthProofFields[] = [
      {...fields, roomId: 'other-room'},
      {...fields, connectionId: 'connection-two'},
      {...fields, challengeId: 'challenge-two'},
      {...fields, nonce: 'server-nonce-two'},
      {...fields, roomEpoch: 4},
      {...fields, action: 'bootstrap'},
      {...fields, deviceId: `dev_${'A'.repeat(43)}`},
      {...fields, clientNonce: 'client-nonce-two'},
      {...fields, inviteHash: 'B'.repeat(43)},
    ];
    for (const changed of changes) expect(await verifyAuthProof(jwk, changed, signature)).toBe(false);
    const tamperedSignature = base64UrlToBytes(signature)!;
    tamperedSignature[0] ^= 1;
    expect(await verifyAuthProof(jwk, fields, bytesToBase64Url(tamperedSignature))).toBe(false);
  });

  it('round-trips base64url without Node Buffer', () => {
    const bytes = Uint8Array.from([0, 1, 2, 127, 128, 254, 255]);
    const encoded = bytesToBase64Url(bytes);
    expect(encoded).not.toMatch(/[+/=]/);
    expect(base64UrlToBytes(encoded)).toEqual(bytes);
    expect(base64UrlToBytes('not valid!')).toBeNull();
    expect(equalBase64Url(encoded, encoded)).toBe(true);
    expect(equalBase64Url(encoded, bytesToBase64Url(Uint8Array.from([1, 2, 3])))).toBe(false);
  });

  it('strictly rejects private, wrong-curve, and over-permissive public JWKs', async () => {
    const pair = await generateSigningKeyPair();
    const jwk = await exportPublicJwk(pair.publicKey);
    expect(normalizePublicJwk({...jwk, d: 'secret'})).toBeNull();
    expect(normalizePublicJwk({...jwk, crv: 'P-384'})).toBeNull();
    expect(normalizePublicJwk({...jwk, key_ops: ['verify', 'sign']})).toBeNull();
    expect(normalizePublicJwk({...jwk, x: 'short'})).toBeNull();
    expect(normalizePublicJwk({...jwk, ext: false})).toBeNull();
  });
});

describe('invitation capabilities', () => {
  it('generates, parses, and room-binds a hash without retaining plaintext', async () => {
    const capability = generateInviteCapability(crypto, (length) => Uint8Array.from({length}, (_, index) => index + length));
    const parsed = parseInviteCapability(capability);
    expect(parsed?.inviteId).toHaveLength(16);
    expect(parsed?.secret).toHaveLength(43);
    const first = await hashInviteCapability('glow-room', capability);
    expect(first).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(await hashInviteCapability('other-room', capability)).not.toBe(first);
    const changed = `${capability.slice(0, -1)}${capability.endsWith('A') ? 'B' : 'A'}`;
    expect(await hashInviteCapability('glow-room', changed)).not.toBe(first);
  });

  it('rejects malformed or unbounded capability strings', () => {
    expect(parseInviteCapability('mgi1.short.secret')).toBeNull();
    expect(parseInviteCapability(`mgi1.${'a'.repeat(16)}.${'b'.repeat(43)}.extra`)).toBeNull();
    expect(parseInviteCapability('x'.repeat(81))).toBeNull();
  });
});

describe('bounded auth wire and storage shapes', () => {
  it('normalizes challenges and rejects malformed bounds', () => {
    const challenge = normalizeAuthChallenge({
      type: 'auth.challenge', v: 1, challengeId: 'challenge-one', nonce: 'server-nonce-one',
      connectionId: 'connection-one', roomEpoch: 0, mode: 'locked', expiresAt: 1_000,
    });
    expect(challenge).toMatchObject({mode: 'locked', roomEpoch: 0});
    expect(normalizeAuthChallenge({...challenge, expiresAt: Number.POSITIVE_INFINITY})).toBeNull();
    expect(normalizeAuthChallenge({...challenge, nonce: 'x'.repeat(81)})).toBeNull();
  });

  it('normalizes membership, invitation, and client messages defensively', async () => {
    const pair = await generateSigningKeyPair();
    const publicJwk = await exportPublicJwk(pair.publicKey);
    const deviceId = await deriveDeviceId(publicJwk);
    const membership = normalizeMembership({
      deviceId, membershipId: 'membership-one', publicJwk, role: 'member', authRevision: 1, createdAt: 10, revokedAt: null,
    });
    expect(membership?.role).toBe('member');
    expect(await membershipMatchesDeviceId(membership)).toBe(true);
    expect(await membershipMatchesDeviceId({...membership, deviceId: `dev_${'A'.repeat(43)}`})).toBe(false);
    expect(normalizeMembership({...membership, role: 'wizard'})).toBeNull();
    expect(normalizeMembership({...membership, publicJwk: {...publicJwk, d: 'private'}})).toBeNull();

    const capability = generateInviteCapability();
    const parsed = parseInviteCapability(capability)!;
    const invitation = normalizeInvitationRecord({
      inviteId: parsed.inviteId, secretHash: await hashInviteCapability('glow-room', capability), role: 'guest',
      createdAt: 10, expiresAt: 20, maxUses: 1, uses: 0, inviteEpoch: 1, revokedAt: null,
    });
    expect(invitation?.role).toBe('guest');
    expect(normalizeInvitationRecord({...invitation, maxUses: 65})).toBeNull();
    expect(normalizeInvitationRecord({...invitation, uses: 2})).toBeNull();

    const signature = 'A'.repeat(86);
    const message = normalizeAuthClientMessage({
      type: 'auth.enroll', challengeId: 'challenge-one', capability, publicJwk, clientNonce: 'client-nonce-one', signature,
      profile: {name: '  Ada  ', color: 'bad', emoji: '', intention: 'x'.repeat(200)},
    });
    expect(message).toMatchObject({type: 'auth.enroll', profile: {name: 'Ada', color: '#9d8cff', emoji: '🫧'}});
    expect(message?.profile.intention).toHaveLength(120);
    expect(normalizeAuthClientMessage({...message, signature: 'short'})).toBeNull();
    expect(normalizeAuthClientMessage({...message, capability: 'bad'})).toBeNull();
  });
});
