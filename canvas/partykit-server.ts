import type * as Party from 'partykit/server';
import * as Y from 'yjs';
import {
  TRUSTED_DEVICE_HEADER,
  TRUSTED_MEMBER_HEADER,
  TRUSTED_ROLE_HEADER,
  validateAdmissionBeforeConnect,
} from '../party/access';
import {CanvasPresenceIndex, parseCanvasPresenceClientMessage} from '../src/canvasPresence';

const SNAPSHOT_KEY = 'porch:excalidraw-yjs:v1';
const DEFAULT_ALLOWED_ORIGINS = ['https://magma-one-azure.vercel.app', 'http://localhost:5173', 'http://127.0.0.1:5173'];

const allowedOrigins = (env: Record<string, unknown>) => new Set([
  ...DEFAULT_ALLOWED_ORIGINS,
  ...(typeof env.MAGMA_ALLOWED_ORIGINS === 'string' ? env.MAGMA_ALLOWED_ORIGINS.split(',').map((value) => value.trim()).filter(Boolean) : []),
]);

const cleanRequest = (request: Party.Request) => {
  const headers = new Headers();
  request.headers.forEach((value, key) => {
    if (![TRUSTED_MEMBER_HEADER, TRUSTED_DEVICE_HEADER, TRUSTED_ROLE_HEADER].includes(key.toLowerCase())) headers.append(key, value);
  });
  return new Request(request.url, {method: request.method, headers}) as Party.Request;
};

const encodeUpdate = (update: Uint8Array) => {
  let binary = '';
  for (let offset = 0; offset < update.byteLength; offset += 0x8000) {
    binary += String.fromCharCode(...update.subarray(offset, offset + 0x8000));
  }
  return JSON.stringify({type: 'scene.update', update: btoa(binary)});
};

const decodeUpdate = (value: unknown) => {
  if (!value || typeof value !== 'object' || (value as {type?: unknown}).type !== 'scene.update' || typeof (value as {update?: unknown}).update !== 'string') return null;
  const binary = atob((value as {update: string}).update);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
};

export default class PorchCanvasRoom implements Party.Server {
  static async onBeforeConnect(request: Party.Request, lobby: Party.Lobby): Promise<Party.Request | Response> {
    const origin = request.headers.get('origin');
    if (origin && !allowedOrigins(lobby.env).has(origin)) return new Response('Origin not allowed', {status: 403});
    const clean = cleanRequest(request);
    const status = await lobby.parties.main.get(lobby.id).fetch('/access/status');
    if (!status.ok) return new Response('Room access unavailable', {status: 503});
    const body = await status.json() as {classification?: unknown};
    if (body.classification === 'legacy-open') return clean;
    if (!['protected', 'unclaimed'].includes(String(body.classification))) return new Response('Room access unavailable', {status: 503});
    const secret = typeof lobby.env.MAGMA_INTERNAL_SECRET === 'string' && lobby.env.MAGMA_INTERNAL_SECRET.length >= 32
      ? lobby.env.MAGMA_INTERNAL_SECRET
      : '';
    if (!secret) return new Response('Private room admission is not configured', {status: 503});
    return validateAdmissionBeforeConnect(clean, lobby, {partyName: 'main', internalSecret: secret}) as Promise<Party.Request | Response>;
  }

  private readonly document = new Y.Doc();
  private readonly presence = new CanvasPresenceIndex();
  private persistTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(readonly room: Party.Room) {}

  async onStart() {
    const snapshot = await this.room.storage.get<Uint8Array>(SNAPSHOT_KEY);
    if (snapshot?.byteLength) Y.applyUpdateV2(this.document, snapshot, 'storage');
  }

  onConnect(connection: Party.Connection<{trustedMemberId: string | null}>, context: Party.ConnectionContext) {
    connection.setState({trustedMemberId: context.request.headers.get(TRUSTED_MEMBER_HEADER)});
    connection.send(encodeUpdate(Y.encodeStateAsUpdateV2(this.document)));
    connection.send(JSON.stringify({type: 'presence.snapshot', presences: this.presence.snapshot()}));
  }

  onMessage(message: string | ArrayBuffer | ArrayBufferView, connection: Party.Connection<{trustedMemberId: string | null}>) {
    if (typeof message !== 'string' || message.length > 6_800_000) return;
    try {
      const parsed = JSON.parse(message) as unknown;
      const presenceMessage = parseCanvasPresenceClientMessage(parsed);
      if (presenceMessage?.type === 'presence.hello') {
        const presence = this.presence.identify(connection.id, presenceMessage.profile, connection.state?.trustedMemberId);
        if (presence) this.room.broadcast(JSON.stringify({type: 'presence.state', presence}));
        return;
      }
      if (presenceMessage?.type === 'presence.update') {
        const {type: _type, ...update} = presenceMessage;
        const presence = this.presence.update(connection.id, update, Date.now());
        if (presence) this.room.broadcast(JSON.stringify({type: 'presence.state', presence}));
        return;
      }
      if (parsed && typeof parsed === 'object' && String((parsed as {type?: unknown}).type).startsWith('presence.')) return;
      const update = decodeUpdate(parsed);
      if (!update || update.byteLength > 5_000_000) return;
      Y.applyUpdateV2(this.document, update, connection.id);
      this.room.broadcast(message, [connection.id]);
      this.schedulePersist();
    } catch {
      connection.close(1003, 'Invalid canvas message');
    }
  }

  onClose(connection: Party.Connection) {
    const memberId = this.presence.leave(connection.id);
    if (memberId) this.room.broadcast(JSON.stringify({type: 'presence.leave', memberId}));
    void this.persist();
  }

  private schedulePersist() {
    if (this.persistTimer) clearTimeout(this.persistTimer);
    this.persistTimer = setTimeout(() => {
      this.persistTimer = null;
      void this.persist();
    }, 250);
  }

  private async persist() {
    if (this.persistTimer) {
      clearTimeout(this.persistTimer);
      this.persistTimer = null;
    }
    await this.room.storage.put(SNAPSHOT_KEY, Y.encodeStateAsUpdateV2(this.document));
  }
}
