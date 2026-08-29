import {describe, expect, it} from 'vitest';
import {handleAccessHttp, MAX_ACCESS_REQUEST_BYTES} from '../../party/access-http';

const allowed = ['https://magma.test'];
const controller = (overrides: Record<string, unknown> = {}) => ({
  classify: async () => 'protected',
  issueChallenge: async (request: unknown) => ({ok: true, value: {request}}),
  consumeProof: async (proof: unknown) => ({ok: true, value: {proof}}),
  ...overrides,
}) as never;

const request = (path: string, init: RequestInit = {}) => new Request(`https://room.test/parties/main/room${path}`, {
  ...init,
  headers: {origin: allowed[0], ...(init.headers ?? {})},
});

describe('bounded public access HTTP surface', () => {
  it('exposes classification without cache or wildcard CORS', async () => {
    const result = await handleAccessHttp(request('/access/status'), controller(), allowed);
    expect(result?.status).toBe(200);
    expect(await result?.json()).toEqual({classification: 'protected'});
    expect(result?.headers.get('access-control-allow-origin')).toBe(allowed[0]);
    expect(result?.headers.get('cache-control')).toBe('no-store');
  });

  it('passes only bounded challenge and proof fields into the controller', async () => {
    const challenge = await handleAccessHttp(request('/access/challenge', {
      method: 'POST', body: JSON.stringify({connectionId: 'connection-one', action: 'prove', deviceId: 'device-one', ignored: 'nope'}),
    }), controller(), allowed);
    expect((await challenge?.json()).request).toEqual({connectionId: 'connection-one', action: 'prove', deviceId: 'device-one'});

    const proof = await handleAccessHttp(request('/access/proof', {
      method: 'POST', body: JSON.stringify({challengeId: 'challenge-one', deviceId: 'device-one', clientNonce: 'nonce-one', signature: 'signature-one'}),
    }), controller(), allowed);
    expect((await proof?.json()).proof).toEqual({challengeId: 'challenge-one', deviceId: 'device-one', clientNonce: 'nonce-one', signature: 'signature-one'});
  });

  it('rejects foreign origins, malformed actions, and oversized bodies before controller work', async () => {
    const denied = await handleAccessHttp(new Request('https://room.test/parties/main/room/access/status', {
      headers: {origin: 'https://attacker.test'},
    }), controller(), allowed);
    expect(denied?.status).toBe(403);
    expect(denied?.headers.get('access-control-allow-origin')).toBeNull();

    const invalid = await handleAccessHttp(request('/access/challenge', {method: 'POST', body: '{"action":"steal"}'}), controller(), allowed);
    expect(invalid?.status).toBe(400);
    const oversized = await handleAccessHttp(request('/access/proof', {method: 'POST', body: 'x'.repeat(MAX_ACCESS_REQUEST_BYTES + 1)}), controller(), allowed);
    expect(oversized?.status).toBe(400);
  });
});
