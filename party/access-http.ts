import {
  RoomAccessController,
  type AccessResult,
  type ConsumeProof,
} from './access';
import type {AuthProofAction} from '../src/domain/auth';

export const ACCESS_HTTP_PREFIX = '/access';
export const MAX_ACCESS_REQUEST_BYTES = 8 * 1024;

const jsonHeaders = (origin: string | null, allowedOrigins: ReadonlySet<string>) => {
  const headers = new Headers({
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    vary: 'Origin',
  });
  if (origin && allowedOrigins.has(origin)) headers.set('access-control-allow-origin', origin);
  return headers;
};

const response = (
  body: unknown,
  status: number,
  origin: string | null,
  allowedOrigins: ReadonlySet<string>,
) => new Response(JSON.stringify(body), {status, headers: jsonHeaders(origin, allowedOrigins)});

const resultResponse = <T>(
  result: AccessResult<T>,
  origin: string | null,
  allowedOrigins: ReadonlySet<string>,
) => result.ok
  ? response(result.value, 200, origin, allowedOrigins)
  : response({reason: result.reason}, ['already-claimed', 'invalid-challenge'].includes(result.reason) ? 409 : 403, origin, allowedOrigins);

const readBoundedJson = async (request: Request): Promise<Record<string, unknown> | null> => {
  const declared = Number(request.headers.get('content-length') ?? 0);
  if (Number.isFinite(declared) && declared > MAX_ACCESS_REQUEST_BYTES) return null;
  const body = await request.text();
  if (new TextEncoder().encode(body).byteLength > MAX_ACCESS_REQUEST_BYTES) return null;
  try {
    const parsed = JSON.parse(body);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null;
  } catch {
    return null;
  }
};

export async function handleAccessHttp(
  request: Request,
  controller: RoomAccessController,
  allowedOriginValues: Iterable<string>,
): Promise<Response | null> {
  const url = new URL(request.url);
  const marker = url.pathname.lastIndexOf(ACCESS_HTTP_PREFIX);
  if (marker < 0) return null;
  const path = url.pathname.slice(marker + ACCESS_HTTP_PREFIX.length) || '/';
  const origin = request.headers.get('origin');
  const allowedOrigins = new Set(allowedOriginValues);
  if (origin && !allowedOrigins.has(origin)) return response({reason: 'origin-denied'}, 403, null, allowedOrigins);

  if (request.method === 'OPTIONS') {
    const headers = jsonHeaders(origin, allowedOrigins);
    headers.set('access-control-allow-methods', 'GET, POST, OPTIONS');
    headers.set('access-control-allow-headers', 'content-type');
    headers.set('access-control-max-age', '600');
    return new Response(null, {status: 204, headers});
  }
  if (path === '/status' && request.method === 'GET') {
    return response({classification: await controller.classify()}, 200, origin, allowedOrigins);
  }
  if (request.method !== 'POST') return response({reason: 'method-not-allowed'}, 405, origin, allowedOrigins);
  const body = await readBoundedJson(request);
  if (!body) return response({reason: 'invalid-request'}, 400, origin, allowedOrigins);

  if (path === '/challenge') {
    const action = body.action;
    if (!['bootstrap', 'prove', 'enroll'].includes(String(action))) {
      return response({reason: 'invalid-request'}, 400, origin, allowedOrigins);
    }
    return resultResponse(await controller.issueChallenge({
      connectionId: typeof body.connectionId === 'string' ? body.connectionId : '',
      action: action as AuthProofAction,
      ...(typeof body.deviceId === 'string' ? {deviceId: body.deviceId} : {}),
      ...(typeof body.inviteId === 'string' ? {inviteId: body.inviteId} : {}),
    }), origin, allowedOrigins);
  }
  if (path === '/proof') {
    const proof: ConsumeProof = {
      challengeId: typeof body.challengeId === 'string' ? body.challengeId : '',
      deviceId: typeof body.deviceId === 'string' ? body.deviceId : '',
      clientNonce: typeof body.clientNonce === 'string' ? body.clientNonce : '',
      signature: typeof body.signature === 'string' ? body.signature : '',
      ...(body.publicJwk && typeof body.publicJwk === 'object' ? {publicJwk: body.publicJwk as JsonWebKey} : {}),
      ...(typeof body.capability === 'string' ? {capability: body.capability} : {}),
    };
    return resultResponse(await controller.consumeProof(proof), origin, allowedOrigins);
  }
  return response({reason: 'not-found'}, 404, origin, allowedOrigins);
}
