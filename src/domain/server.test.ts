import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import MagmaRoom from '../../party/server';
import {applyTimerCommand, createTimer, type TimerState} from './timer';
import type {Participant, Profile, RoomSnapshot, SessionArtifact} from './protocol';
import type {SocialRelease} from './porch';
import type {MediaQueueState} from './mediaQueue';
import type {RoomMediaState} from './media';
import {
  ROOM_STATE_BACKUP_KEY,
  ROOM_STATE_KEY,
  UnsupportedRoomStateVersionError,
  type LegacyRoomStateBackup,
  type StoredRoomState,
} from './roomState';
import {createMergeableStore} from 'tinybase';
import {contentAsChanges, decodeWorkspaceSnapshot, encodeWorkspaceChanges} from '../workspaceTransport';

const TIMER_KEY = 'magma:timer';
const ARTIFACTS_KEY = 'magma:artifacts';
const PORCH_MESSAGES_KEY = 'magma:porch-messages';
const SOCIAL_NONCES_KEY = 'magma:social-nonces';
const SOCIAL_RELEASE_KEY = 'magma:social-release';
const MEDIA_KEY = 'magma:media';
const MEDIA_QUEUE_KEY = 'magma:media-queue:v1';

class FakeStorage {
  readonly values = new Map<string, unknown>();
  alarm: number | null = null;
  failNextAtomicWrite = false;

  async get<T>(key: string): Promise<T | undefined> {
    return structuredClone(this.values.get(key)) as T | undefined;
  }

  async put<T>(keyOrEntries: string | Record<string, T>, value?: T) {
    if (typeof keyOrEntries === 'string') {
      this.values.set(keyOrEntries, structuredClone(value));
      return;
    }
    if (this.failNextAtomicWrite) {
      this.failNextAtomicWrite = false;
      throw new Error('injected atomic write failure');
    }
    for (const [key, entry] of Object.entries(keyOrEntries)) this.values.set(key, structuredClone(entry));
  }

  async list<T>({prefix = ''}: {prefix?: string} = {}) {
    return new Map([...this.values].filter(([key]) => key.startsWith(prefix))) as Map<string, T>;
  }

  async delete(keyOrKeys: string | string[]) {
    if (Array.isArray(keyOrKeys)) {
      let count = 0;
      for (const key of keyOrKeys) if (this.values.delete(key)) count += 1;
      return count;
    }
    return this.values.delete(keyOrKeys);
  }

  async setAlarm(value: number | Date) {
    this.alarm = typeof value === 'number' ? value : value.getTime();
  }

  async deleteAlarm() {
    this.alarm = null;
  }

  async getAlarm() {
    return this.alarm;
  }

  async transaction<T>(closure: (transaction: FakeStorage) => Promise<T>) {
    const transaction = new FakeStorage();
    for (const [key, value] of this.values) transaction.values.set(key, structuredClone(value));
    transaction.alarm = this.alarm;
    transaction.failNextAtomicWrite = this.failNextAtomicWrite;
    this.failNextAtomicWrite = false;
    const result = await closure(transaction);
    this.values.clear();
    for (const [key, value] of transaction.values) this.values.set(key, structuredClone(value));
    this.alarm = transaction.alarm;
    return result;
  }
}

class FakeConnection {
  state: Participant | null = null;
  readonly sent: Array<Record<string, unknown>> = [];

  constructor(readonly id: string) {}

  setState(state: Participant | null) {
    this.state = state;
    return state;
  }

  send(message: string) {
    this.sent.push(JSON.parse(message) as Record<string, unknown>);
  }
}

class FakeRoom {
  readonly storage = new FakeStorage();
  readonly connections: FakeConnection[] = [];
  readonly broadcasts: Array<Record<string, unknown>> = [];
  readonly rawBroadcasts: string[] = [];
  readonly id = 'test-room';
  readonly internalID = 'test-room';
  readonly name = 'main';
  readonly env = {};
  readonly context = {};
  readonly parties = {};

  getConnections<T>() {
    return this.connections as unknown as Iterable<T>;
  }

  broadcast(message: string | ArrayBuffer | ArrayBufferView) {
    if (typeof message !== 'string') return;
    if (message.startsWith('tinybase:')) this.rawBroadcasts.push(message);
    else this.broadcasts.push(JSON.parse(message) as Record<string, unknown>);
  }
}

const profile = (memberId: string, name: string): Profile => ({
  memberId,
  name,
  color: '#9d8cff',
  emoji: '🫧',
  intention: 'Hold the room',
});

const connect = async (server: MagmaRoom, room: FakeRoom, connection: FakeConnection, person: Profile) => {
  room.connections.push(connection);
  const query = new URLSearchParams(person);
  await server.onConnect(connection as never, {request: new Request(`https://example.test/party?${query}`)} as never);
};

const send = (server: MagmaRoom, connection: FakeConnection, message: Record<string, unknown>) =>
  server.onMessage(JSON.stringify(message), connection as never);

const runningFocus = (sessionId = 'focus-session'): TimerState => {
  const timer = createTimer(sessionId);
  timer.durations = {focus: 30_000, shortBreak: 30_000, longBreak: 30_000};
  timer.durationMs = 30_000;
  timer.remainingMs = 30_000;
  return applyTimerCommand(timer, {type: 'start'}, 1_000, 'host-member', 'unused');
};

const latestSnapshot = (messages: Array<Record<string, unknown>>) =>
  [...messages].reverse().find((message) => message.type === 'snapshot') as RoomSnapshot | undefined;

describe('versioned authoritative room storage', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000);
  });

  afterEach(() => vi.useRealTimers());

  const legacyMessage = {
    id: 'legacy-message-1',
    text: 'Meet here tomorrow',
    authorId: 'legacy-member',
    authorName: 'Legacy',
    authorEmoji: '🌉',
    createdAt: 900,
    sessionId: 'legacy-session',
  };

  it('atomically migrates representative production keys and keeps the prior snapshot recoverable', async () => {
    const room = new FakeRoom();
    const legacyTimer = {...createTimer('legacy-session'), status: 'paused' as const, remainingMs: 420_000, revision: 7};
    await room.storage.put({
      [TIMER_KEY]: legacyTimer,
      [PORCH_MESSAGES_KEY]: [legacyMessage],
      [MEDIA_KEY]: {
        source: {kind: 'live', id: 'BSWhGNXxT9A', label: 'Old production label'},
        status: 'playing', positionSeconds: 0, playlistIndex: 0, changedAt: 900, revision: 3, controllerId: 'legacy-member',
      },
    });

    const server = new MagmaRoom(room as never);
    await server.onStart();

    const envelope = await room.storage.get<StoredRoomState>(ROOM_STATE_KEY);
    const backup = await room.storage.get<LegacyRoomStateBackup>(ROOM_STATE_BACKUP_KEY);
    expect(envelope).toMatchObject({version: 1, values: {timer: {sessionId: 'legacy-session', revision: 7}}});
    expect((envelope?.values.porchMessages as Array<{text: string}>)[0].text).toBe('Meet here tomorrow');
    expect(backup).toEqual({
      version: 1,
      source: 'production-keys',
      capturedAt: 1_000,
      values: {
        timer: legacyTimer,
        media: {
          source: {kind: 'live', id: 'BSWhGNXxT9A', label: 'Old production label'},
          status: 'playing', positionSeconds: 0, playlistIndex: 0, changedAt: 900, revision: 3, controllerId: 'legacy-member',
        },
        porchMessages: [legacyMessage],
      },
    });
    expect(await room.storage.get(TIMER_KEY)).toEqual(legacyTimer);

    const firstBackup = structuredClone(backup);
    const restarted = new MagmaRoom(room as never);
    await restarted.onStart();
    expect(await room.storage.get(ROOM_STATE_BACKUP_KEY)).toEqual(firstBackup);
  });

  it('leaves production keys untouched when the atomic migration persistence fails', async () => {
    const room = new FakeRoom();
    const legacyTimer = {...createTimer('recoverable-session'), status: 'paused' as const, revision: 4};
    await room.storage.put(TIMER_KEY, legacyTimer);
    room.storage.failNextAtomicWrite = true;

    await expect(new MagmaRoom(room as never).onStart()).rejects.toThrow('injected atomic write failure');
    expect(await room.storage.get(TIMER_KEY)).toEqual(legacyTimer);
    expect(await room.storage.get(ROOM_STATE_KEY)).toBeUndefined();
    expect(await room.storage.get(ROOM_STATE_BACKUP_KEY)).toBeUndefined();
  });

  it('fails visibly on a future envelope without writing or normalizing any stored key', async () => {
    const room = new FakeRoom();
    const future = {version: 99, persistedAt: 900, values: {timer: {future: true}}, futureField: 'retain me'};
    await room.storage.put(ROOM_STATE_KEY, future);
    const before = structuredClone([...room.storage.values.entries()]);

    await expect(new MagmaRoom(room as never).onStart()).rejects.toBeInstanceOf(UnsupportedRoomStateVersionError);
    expect([...room.storage.values.entries()]).toEqual(before);
  });
});

describe('Magma room deadline and restart invariants', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000);
  });

  afterEach(() => vi.useRealTimers());

  it('atomically settles a post-deadline Porch message and schedules the auto-break alarm', async () => {
    const room = new FakeRoom();
    await room.storage.put(TIMER_KEY, runningFocus());
    const server = new MagmaRoom(room as never);
    await server.onStart();
    const host = new FakeConnection('host-tab');
    await connect(server, room, host, profile('host-member', 'Host'));

    await send(server, host, {type: 'porch.message', nonce: 'focus-nonce-1', text: 'Held until the Porch'});
    await send(server, host, {type: 'social.signal', nonce: 'signal-nonce-1', cueId: 'breathe'});
    await send(server, host, {type: 'reaction', emoji: '🔥'});
    const restartedDuringFocus = new MagmaRoom(room as never);
    await restartedDuringFocus.onStart();

    vi.setSystemTime(31_000);
    await send(restartedDuringFocus, host, {type: 'porch.message', nonce: 'break-nonce-1', text: 'Now on the Porch'});

    const timer = await room.storage.get<TimerState>(TIMER_KEY);
    const release = await room.storage.get<SocialRelease>(SOCIAL_RELEASE_KEY);
    const artifacts = await room.storage.get<SessionArtifact[]>(ARTIFACTS_KEY);
    expect(timer).toMatchObject({mode: 'shortBreak', status: 'running'});
    expect(room.storage.alarm).toBe(timer?.endsAt);
    expect(artifacts).toHaveLength(1);
    expect(artifacts?.[0]).toMatchObject({id: 'focus-session', reactionCount: 1});
    expect(release).toMatchObject({
      releaseId: 'focus-session',
      signalCounts: {breathe: 1},
      reactionCounts: {'🔥': 1},
      totalSignals: 1,
      totalReactions: 1,
    });
    expect((await room.storage.get<Array<{text: string}>>(PORCH_MESSAGES_KEY))?.map(({text}) => text))
      .toEqual(['Held until the Porch', 'Now on the Porch']);
    expect(room.broadcasts.filter((message) => message.type === 'session.complete')).toHaveLength(1);

    room.broadcasts.length = 0;
    const restarted = new MagmaRoom(room as never);
    await restarted.onStart();
    const returning = new FakeConnection('returning-tab');
    await connect(restarted, room, returning, profile('other-member', 'Other'));
    expect(room.broadcasts.filter((message) => message.type === 'session.complete')).toHaveLength(0);
    expect(latestSnapshot(returning.sent)?.socialRelease).toMatchObject({releaseId: 'focus-session'});
  });

  it('does not consume a nonce when the atomic Porch payload write fails', async () => {
    const room = new FakeRoom();
    const server = new MagmaRoom(room as never);
    await server.onStart();
    const host = new FakeConnection('host-tab');
    await connect(server, room, host, profile('host-member', 'Host'));
    room.storage.failNextAtomicWrite = true;

    const message = {type: 'porch.message', nonce: 'retry-nonce-1', text: 'Please survive retry'};
    await expect(send(server, host, message)).rejects.toThrow('injected atomic write failure');
    expect(await room.storage.get(SOCIAL_NONCES_KEY)).toBeUndefined();
    expect(await room.storage.get(PORCH_MESSAGES_KEY)).toBeUndefined();

    await send(server, host, message);
    await send(server, host, message);
    expect(await room.storage.get(SOCIAL_NONCES_KEY)).toEqual(['retry-nonce-1']);
    expect((await room.storage.get<Array<{text: string}>>(PORCH_MESSAGES_KEY))?.map(({text}) => text))
      .toEqual(['Please survive retry']);
    expect((await room.storage.get<StoredRoomState>(ROOM_STATE_KEY))?.values).toMatchObject({
      socialNonces: ['retry-nonce-1'],
      porchMessages: [{text: 'Please survive retry'}],
    });
    expect(host.sent.filter((entry) => entry.type === 'porch.accepted')).toHaveLength(2);
  });

  it('does not advance live timer memory or its alarm when a start transaction fails', async () => {
    const room = new FakeRoom();
    const server = new MagmaRoom(room as never);
    await server.onStart();
    const host = new FakeConnection('host-tab');
    await connect(server, room, host, profile('host-member', 'Host'));
    await send(server, host, {type: 'porch.message', nonce: 'before-start-1', text: 'Still gathering'});
    room.storage.failNextAtomicWrite = true;

    await expect(send(server, host, {type: 'timer.command', command: {type: 'start'}, expectedRevision: 0}))
      .rejects.toThrow('injected atomic write failure');
    expect(room.storage.alarm).toBeNull();
    expect(await room.storage.get(TIMER_KEY)).toBeUndefined();
    expect((await room.storage.get<Array<{text: string}>>(PORCH_MESSAGES_KEY))?.map(({text}) => text)).toEqual(['Still gathering']);

    await send(server, host, {type: 'timer.command', command: {type: 'start'}, expectedRevision: 0});
    const timer = await room.storage.get<TimerState>(TIMER_KEY);
    expect(timer).toMatchObject({status: 'running', revision: 1});
    expect(room.storage.alarm).toBe(timer?.endsAt);
    expect(await room.storage.get(PORCH_MESSAGES_KEY)).toEqual([]);
  });

  it('retries a failed atomic completion without duplicate artifacts or events', async () => {
    const room = new FakeRoom();
    await room.storage.put(TIMER_KEY, runningFocus());
    const server = new MagmaRoom(room as never);
    await server.onStart();
    vi.setSystemTime(31_000);
    room.storage.failNextAtomicWrite = true;

    await expect(server.onAlarm()).rejects.toThrow('injected atomic write failure');
    expect(await room.storage.get<TimerState>(TIMER_KEY)).toMatchObject({mode: 'focus', status: 'running'});
    expect(await room.storage.get(ARTIFACTS_KEY)).toBeUndefined();
    expect(room.broadcasts.filter((message) => message.type === 'session.complete')).toHaveLength(0);

    await server.onAlarm();
    await server.onAlarm();
    expect(await room.storage.get<TimerState>(TIMER_KEY)).toMatchObject({mode: 'shortBreak', status: 'running'});
    expect(await room.storage.get<SessionArtifact[]>(ARTIFACTS_KEY)).toHaveLength(1);
    expect(room.broadcasts.filter((message) => message.type === 'session.complete')).toHaveLength(1);
  });

  it('catches up an elapsed focus and auto-break in one commit but creates only a focus Ember', async () => {
    const room = new FakeRoom();
    await room.storage.put(TIMER_KEY, runningFocus());
    const server = new MagmaRoom(room as never);
    await server.onStart();
    const host = new FakeConnection('host-tab');
    await connect(server, room, host, profile('host-member', 'Host'));
    await send(server, host, {type: 'social.signal', nonce: 'signal-catchup-1', cueId: 'reset'});
    vi.setSystemTime(61_000);

    await server.onAlarm();

    expect(await room.storage.get<TimerState>(TIMER_KEY)).toMatchObject({mode: 'focus', status: 'idle'});
    expect(room.storage.alarm).toBeNull();
    expect(await room.storage.get<SessionArtifact[]>(ARTIFACTS_KEY)).toHaveLength(1);
    expect((await room.storage.get<SessionArtifact[]>(ARTIFACTS_KEY))?.[0]).toMatchObject({mode: 'focus'});
    expect(await room.storage.get<SocialRelease>(SOCIAL_RELEASE_KEY)).toMatchObject({
      releaseId: 'focus-session', signalCounts: {reset: 1}, totalSignals: 1,
    });
    expect(room.broadcasts.filter((message) => message.type === 'session.complete')).toHaveLength(1);
    expect(room.broadcasts.filter((message) => message.type === 'social.bloom')).toHaveLength(1);
  });

  it('lets any connected person operate the clock directly', async () => {
    const room = new FakeRoom();
    await room.storage.put(TIMER_KEY, runningFocus());
    const server = new MagmaRoom(room as never);
    await server.onStart();
    const host = new FakeConnection('host-tab');
    const guest = new FakeConnection('guest-tab');
    await connect(server, room, host, profile('host-member', 'Host'));
    await connect(server, room, guest, profile('guest-member', 'Guest'));

    await send(server, guest, {type: 'timer.command', command: {type: 'pause'}, expectedRevision: 1});
    expect(latestSnapshot(room.broadcasts)?.proposal).toBeNull();
    expect(await room.storage.get<TimerState>(TIMER_KEY)).toMatchObject({mode: 'focus', status: 'paused'});
  });

  it('rejects stale settings instead of aborting the newly auto-started break', async () => {
    const room = new FakeRoom();
    await room.storage.put(TIMER_KEY, runningFocus());
    const server = new MagmaRoom(room as never);
    await server.onStart();
    const host = new FakeConnection('host-tab');
    await connect(server, room, host, profile('host-member', 'Host'));
    vi.setSystemTime(31_000);

    await send(server, host, {
      type: 'timer.settings',
      durations: {focus: 60_000, shortBreak: 60_000, longBreak: 60_000},
      autoAdvance: false,
      expectedRevision: 1,
      expectedSessionId: 'focus-session',
    });

    expect(await room.storage.get<TimerState>(TIMER_KEY)).toMatchObject({
      mode: 'shortBreak', status: 'running', autoAdvance: true, durationMs: 30_000,
    });
    expect(host.sent.some((message) => message.type === 'notice')).toBe(true);
  });

  it('settles before attributing a late join to phase participants', async () => {
    const room = new FakeRoom();
    await room.storage.put(TIMER_KEY, runningFocus());
    const server = new MagmaRoom(room as never);
    await server.onStart();
    vi.setSystemTime(31_000);

    const late = new FakeConnection('late-tab');
    await connect(server, room, late, profile('late-member', 'Late'));
    const artifacts = await room.storage.get<SessionArtifact[]>(ARTIFACTS_KEY);
    expect(artifacts?.[0].participants).toEqual([]);
    expect((await room.storage.get<SessionArtifact['participants']>('magma:phase-participants'))?.map(({memberId}) => memberId))
      .toEqual(['late-member']);
  });

  it('hydrates a new tab from authoritative same-member presence', async () => {
    const room = new FakeRoom();
    const server = new MagmaRoom(room as never);
    await server.onStart();
    const first = new FakeConnection('first-tab');
    const second = new FakeConnection('second-tab');
    const person = profile('same-member', 'Same');
    await connect(server, room, first, person);
    await send(server, first, {type: 'presence.set', choice: 'away'});
    await connect(server, room, second, person);
    expect(second.state?.presence).toBe('away');
    expect(second.state?.joinedAt).toBe(first.state?.joinedAt);
  });

  it('enforces a room-wide social-event budget across otherwise-valid members', async () => {
    const room = new FakeRoom();
    const server = new MagmaRoom(room as never);
    await server.onStart();
    const members: FakeConnection[] = [];
    for (let index = 0; index < 5; index += 1) {
      const connection = new FakeConnection(`tab-${index}`);
      members.push(connection);
      await connect(server, room, connection, profile(`member-000${index}`, `Member ${index}`));
    }
    room.broadcasts.length = 0;

    for (const connection of members) {
      for (let index = 0; index < 6; index += 1) await send(server, connection, {type: 'reaction', emoji: '✨'});
    }

    expect(room.broadcasts.filter((message) => message.type === 'reaction')).toHaveLength(24);
  });
});

describe('server-authoritative Listening Deck', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000);
  });

  afterEach(() => vi.useRealTimers());

  const source = (id: string) => ({kind: 'video' as const, id, label: `Client label ${id}`});
  const enqueue = (opId: string, id: string, activate = false) => ({
    type: 'media.queue.enqueue', opId, source: source(id), activate,
  });

  it('keeps concurrent enqueues once in accepted server order and makes retries idempotent', async () => {
    const room = new FakeRoom();
    const server = new MagmaRoom(room as never);
    await server.onStart();
    const ada = new FakeConnection('ada-tab');
    const lin = new FakeConnection('lin-tab');
    await connect(server, room, ada, profile('ada-member', 'Ada'));
    await connect(server, room, lin, profile('lin-member', 'Lin'));
    const first = enqueue('queue-op-ada-1', 'abcdefghijk');
    const second = enqueue('queue-op-lin-1', 'lmnopqrstuv');

    await Promise.all([send(server, ada, first), send(server, lin, second)]);
    await send(server, ada, first);

    const queue = await room.storage.get<MediaQueueState>(MEDIA_QUEUE_KEY);
    expect(queue?.items.map((item) => [item.source.id, item.addedById, item.addedByName])).toEqual([
      ['BSWhGNXxT9A', 'server', 'Room'],
      ['abcdefghijk', 'ada-member', 'Ada'],
      ['lmnopqrstuv', 'lin-member', 'Lin'],
    ]);
    expect(queue?.revision).toBe(2);
    expect(ada.sent.filter((message) => message.type === 'media.queue.accepted')).toHaveLength(2);

    const restarted = new MagmaRoom(room as never);
    await restarted.onStart();
    const returning = new FakeConnection('returning-tab');
    await connect(restarted, room, returning, profile('returning-member', 'Returning'));
    expect(latestSnapshot(returning.sent)?.mediaQueue).toMatchObject({revision: 2, policy: 'open'});
  });

  it('stages a Floor selection and activates queue plus transport exactly once at the boundary', async () => {
    const room = new FakeRoom();
    await room.storage.put(TIMER_KEY, runningFocus());
    const server = new MagmaRoom(room as never);
    await server.onStart();
    const host = new FakeConnection('host-tab');
    await connect(server, room, host, profile('host-member', 'Host'));

    await send(server, host, enqueue('queue-stage-op-1', 'abcdefghijk', true));
    const staged = await room.storage.get<MediaQueueState>(MEDIA_QUEUE_KEY);
    const mediaBefore = await room.storage.get<RoomMediaState>(MEDIA_KEY);
    expect(staged?.stagedItemId).toBe(staged?.items[1].id);
    expect(staged?.activeItemId).toBe(staged?.items[0].id);
    expect(mediaBefore?.source.id).toBe('BSWhGNXxT9A');

    vi.setSystemTime(31_000);
    room.storage.failNextAtomicWrite = true;
    await expect(server.onAlarm()).rejects.toThrow('injected atomic write failure');
    expect(await room.storage.get<TimerState>(TIMER_KEY)).toMatchObject({mode: 'focus', status: 'running'});
    expect(await room.storage.get<MediaQueueState>(MEDIA_QUEUE_KEY)).toMatchObject({stagedItemId: staged?.items[1].id, revision: 1});
    expect(await room.storage.get<RoomMediaState>(MEDIA_KEY)).toMatchObject({source: {id: 'BSWhGNXxT9A'}, revision: 0});

    await server.onAlarm();
    const active = await room.storage.get<MediaQueueState>(MEDIA_QUEUE_KEY);
    const mediaAfter = await room.storage.get<RoomMediaState>(MEDIA_KEY);
    expect(active).toMatchObject({activeItemId: staged?.items[1].id, stagedItemId: null, revision: 2});
    expect(mediaAfter).toMatchObject({source: {id: 'abcdefghijk'}, revision: 1, positionSeconds: 0});

    await server.onAlarm();
    expect(await room.storage.get<MediaQueueState>(MEDIA_QUEUE_KEY)).toMatchObject({revision: 2});
    expect(await room.storage.get<RoomMediaState>(MEDIA_KEY)).toMatchObject({revision: 1});
  });

  it('does not adopt a queue mutation until its atomic durable write succeeds', async () => {
    const room = new FakeRoom();
    const server = new MagmaRoom(room as never);
    await server.onStart();
    const member = new FakeConnection('member-tab');
    await connect(server, room, member, profile('member-one', 'Member'));
    const command = enqueue('queue-retry-op-1', 'abcdefghijk');
    room.storage.failNextAtomicWrite = true;

    await expect(send(server, member, command)).rejects.toThrow('injected atomic write failure');
    expect((await room.storage.get<MediaQueueState>(MEDIA_QUEUE_KEY))?.items).toHaveLength(1);
    await send(server, member, command);
    expect((await room.storage.get<MediaQueueState>(MEDIA_QUEUE_KEY))?.items).toHaveLength(2);
  });

  it('lets everyone arrange backgrounds and does not let legacy source commands bypass the queue', async () => {
    const room = new FakeRoom();
    const server = new MagmaRoom(room as never);
    await server.onStart();
    const owner = new FakeConnection('owner-tab');
    const member = new FakeConnection('member-tab');
    const steward = new FakeConnection('steward-tab');
    const guest = new FakeConnection('guest-tab');
    await connect(server, room, owner, profile('owner-member', 'Owner'));
    await connect(server, room, member, profile('plain-member', 'Member'));
    await connect(server, room, steward, profile('steward-member', 'Steward'));
    await connect(server, room, guest, profile('guest-member', 'Guest'));
    (owner.state as unknown as {role: string}).role = 'owner';
    (steward.state as unknown as {role: string}).role = 'steward';
    (guest.state as unknown as {role: string}).role = 'guest';

    await send(server, owner, {type: 'media.queue.policy', opId: 'queue-policy-1', policy: 'stewarded', expectedRevision: 0});
    await send(server, member, enqueue('queue-member-add-1', 'abcdefghijk'));
    let queue = (await room.storage.get<MediaQueueState>(MEDIA_QUEUE_KEY))!;
    const itemId = queue.items[1].id;
    await send(server, member, {type: 'media.queue.select', opId: 'queue-member-select-1', itemId, expectedRevision: queue.revision});
    queue = (await room.storage.get<MediaQueueState>(MEDIA_QUEUE_KEY))!;
    expect(queue.activeItemId).toBe(itemId);

    await send(server, guest, enqueue('queue-guest-add-1', 'lmnopqrstuv'));
    expect((await room.storage.get<MediaQueueState>(MEDIA_QUEUE_KEY))?.items).toHaveLength(3);
    const media = (await room.storage.get<RoomMediaState>(MEDIA_KEY))!;
    await send(server, member, {
      type: 'media.command', command: {type: 'source', source: source('lmnopqrstuv')},
      expectedRevision: media.revision, expectedItemId: queue.activeItemId,
    });
    expect((await room.storage.get<RoomMediaState>(MEDIA_KEY))?.source.id).toBe('abcdefghijk');
  });
});

describe('authenticated durable workspace authority', () => {
  it('accepts stamped client work, rebroadcasts canonical changes, and restores a snapshot after restart', async () => {
    const room = new FakeRoom();
    const server = new MagmaRoom(room as never);
    await server.onStart();
    const author = new FakeConnection('author-tab');
    await connect(server, room, author, profile('author-member', 'Author'));
    const local = createMergeableStore();
    local.setCell('tasks', 'task-one', 'text', 'Converge honestly');

    await server.onMessage(encodeWorkspaceChanges(contentAsChanges(local.getMergeableContent())), author as never);
    expect(room.rawBroadcasts).toHaveLength(1);
    expect(await room.storage.get('magma:workspace:v2')).toBeDefined();

    const restarted = new MagmaRoom(room as never);
    await restarted.onStart();
    const returning = new FakeConnection('returning-tab');
    await connect(restarted, room, returning, profile('returning-member', 'Returning'));
    const snapshotMessage = returning.sent.find((message) => message.type === 'workspace.snapshot');
    const snapshot = decodeWorkspaceSnapshot(JSON.stringify(snapshotMessage));
    const replica = createMergeableStore();
    replica.applyMergeableChanges(snapshot!);
    expect(replica.getCell('tasks', 'task-one', 'text')).toBe('Converge honestly');
  });

  it('lets every admitted person edit the board and never exposes the old HTTP store endpoint', async () => {
    const room = new FakeRoom();
    const server = new MagmaRoom(room as never);
    await server.onStart();
    const guest = new FakeConnection('guest-tab');
    await connect(server, room, guest, profile('guest-member', 'Guest'));
    (guest.state as unknown as {role: string}).role = 'guest';
    const local = createMergeableStore();
    local.setCell('sparks', 'guest-spark', 'text', 'Must not publish');
    await server.onMessage(encodeWorkspaceChanges(contentAsChanges(local.getMergeableContent())), guest as never);
    expect(room.rawBroadcasts).toHaveLength(1);
    expect(await server.onRequest(new Request('https://example.test/store') as never)).toMatchObject({status: 404});
  });

  it('stamps workspace authorship from the authenticated participant instead of client claims', async () => {
    const room = new FakeRoom();
    const server = new MagmaRoom(room as never);
    await server.onStart();
    const author = new FakeConnection('honest-author-tab');
    await connect(server, room, author, profile('author-member', 'Actual Author'));
    const forged = createMergeableStore();
    forged.setRow('sparks', 'forged-spark', {
      text: 'The thought itself is accepted',
      authorId: 'another-member',
      authorName: 'Someone Else',
      emoji: '🕵️',
      createdAt: 1,
      pinned: false,
    });

    await server.onMessage(encodeWorkspaceChanges(contentAsChanges(forged.getMergeableContent())), author as never);
    const returning = new FakeConnection('reader-tab');
    await connect(server, room, returning, profile('reader-member', 'Reader'));
    const snapshotMessage = returning.sent.find((message) => message.type === 'workspace.snapshot');
    const snapshot = decodeWorkspaceSnapshot(JSON.stringify(snapshotMessage));
    const replica = createMergeableStore();
    replica.applyMergeableChanges(snapshot!);
    expect(replica.getRow('sparks', 'forged-spark')).toMatchObject({
      text: 'The thought itself is accepted',
      authorId: 'author-member',
      authorName: 'Actual Author',
      emoji: '🫧',
    });
    expect(replica.getCell('sparks', 'forged-spark', 'createdAt')).toBeGreaterThan(1);
  });
});
