import type * as Party from 'partykit/server';
import {InMemorySyncStorage, TLSocketRoom, type RoomSnapshot, type WebSocketMinimal} from '@tldraw/sync-core';
import {createTLSchema, defaultBindingSchemas, defaultShapeSchemas, type TLRecord} from '@tldraw/tlschema';
import {
  TRUSTED_DEVICE_HEADER,
  TRUSTED_MEMBER_HEADER,
  TRUSTED_ROLE_HEADER,
  validateAdmissionBeforeConnect,
} from '../party/access';

const SNAPSHOT_KEY = 'porch:tldraw-snapshot:v1';
const DEFAULT_ALLOWED_ORIGINS = ['https://magma-one-azure.vercel.app', 'http://localhost:5173', 'http://127.0.0.1:5173'];
const schema = createTLSchema({shapes: defaultShapeSchemas, bindings: defaultBindingSchemas});

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

const socketFor = (connection: Party.Connection): WebSocketMinimal => ({
  send: (message) => connection.send(message),
  close: (code, reason) => connection.close(code, reason),
  get readyState() { return connection.readyState; },
});

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

  private sync: TLSocketRoom<TLRecord, void> | null = null;
  private sessions = new Map<string, string>();
  private persistTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(readonly room: Party.Room) {}

  async onStart() {
    const snapshot = await this.room.storage.get<RoomSnapshot>(SNAPSHOT_KEY);
    let storage: InMemorySyncStorage<TLRecord>;
    storage = new InMemorySyncStorage<TLRecord>({
      ...(snapshot ? {snapshot} : {}),
      onChange: () => this.schedulePersist(storage),
    });
    this.sync = new TLSocketRoom<TLRecord, void>({schema, storage, clientTimeout: 30_000});
  }

  onConnect(connection: Party.Connection, context: Party.ConnectionContext) {
    const sessionId = new URL(context.request.url).searchParams.get('sessionId') || connection.id;
    this.sessions.set(connection.id, sessionId);
    this.getSync().handleSocketConnect({sessionId, socket: socketFor(connection)});
  }

  onMessage(message: string | ArrayBuffer | ArrayBufferView, connection: Party.Connection) {
    const sessionId = this.sessions.get(connection.id);
    if (sessionId) this.getSync().handleSocketMessage(sessionId, message);
  }

  onClose(connection: Party.Connection) {
    const sessionId = this.sessions.get(connection.id);
    if (!sessionId) return;
    this.sessions.delete(connection.id);
    this.getSync().handleSocketClose(sessionId);
    void this.persist();
  }

  onError(connection: Party.Connection) {
    const sessionId = this.sessions.get(connection.id);
    if (!sessionId) return;
    this.sessions.delete(connection.id);
    this.getSync().handleSocketError(sessionId);
    void this.persist();
  }

  private getSync() {
    if (!this.sync) throw new Error('Canvas room started without its tldraw engine');
    return this.sync;
  }

  private schedulePersist(storage: InMemorySyncStorage<TLRecord>) {
    if (this.persistTimer) clearTimeout(this.persistTimer);
    this.persistTimer = setTimeout(() => {
      this.persistTimer = null;
      void this.room.storage.put(SNAPSHOT_KEY, storage.getSnapshot());
    }, 250);
  }

  private async persist() {
    if (this.persistTimer) {
      clearTimeout(this.persistTimer);
      this.persistTimer = null;
    }
    const snapshot = this.sync?.storage.getSnapshot?.();
    if (snapshot) await this.room.storage.put(SNAPSHOT_KEY, snapshot);
  }
}
