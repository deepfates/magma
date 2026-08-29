import type * as Party from 'partykit/server';
import {createMergeableStore} from 'tinybase';
import {hasStoreInStorage, loadStoreFromStorage, TinyBasePartyKitServer} from 'tinybase/persisters/persister-partykit-server';
import type {MergeableChanges, MergeableContent, MergeableStore} from 'tinybase/mergeable-store';
import {applyTimerCommand, applyTimerSettings, createTimer, normalizeTimer, settleElapsed, type TimerCommand, type TimerDurations, type TimerState} from '../src/domain/timer';
import {applyMediaCommand, createMediaState, normalizeMediaState, type RoomMediaState} from '../src/domain/media';
import {
  activeQueueItem, canArrangeQueue, canContributeToQueue, canRemoveQueueItem, canSetDeckPolicy,
  createMediaQueue, enqueueMedia, moveMedia, normalizeMediaQueue, releaseHeldMedia, removeMedia, selectMedia, setDeckPolicy,
  type MediaQueueItem, type MediaQueueState,
} from '../src/domain/mediaQueue';
import {isClientMessage, type Participant, type Profile, type SessionArtifact, type TimerProposal} from '../src/domain/protocol';
import {SCENE_PRESETS, type YouTubeSource} from '../src/domain/youtube';
import {
  MAX_HELD_SIGNALS, MAX_PORCH_MESSAGES, createPorchMessage, isFloor, normalizeHeldSignals, normalizePorchMessages,
  normalizeSocialRelease, ROOM_CUES, type PorchMessage, type PresenceChoice, type RoomCueId, type RoomSignal, type SocialReaction, type SocialRelease,
} from '../src/domain/porch';
import {
  LEGACY_ROOM_KEYS,
  ROOM_STATE_BACKUP_KEY,
  ROOM_STATE_V1_BACKUP_KEY,
  ROOM_STATE_KEY,
  legacyEntries,
  migrateRoomState,
  updateStoredRoomState,
  type LegacyRoomStateValues,
  type RoomStateField,
  type RoomStateValues,
  type StoredRoomState,
} from '../src/domain/roomState';
import {applySceneCommand, createScene, DAYLIGHT_OVERLAY, KEXP_RADIO, normalizeScene, reconcileVisual, withVisual, type PorchScene} from '../src/domain/scene';
import type {AuthRole} from '../src/domain/auth';
import {
  decodeWorkspaceChanges, encodeWorkspaceChanges, encodeWorkspaceSnapshot, hasWorkspaceChanges, MAX_WORKSPACE_MESSAGE_BYTES,
} from '../src/workspaceTransport';
import {
  INTERNAL_ADMISSION_PATH,
  RoomAccessController,
  TRUSTED_DEVICE_HEADER,
  TRUSTED_MEMBER_HEADER,
  TRUSTED_ROLE_HEADER,
  handleInternalAdmission,
  partyAccessStorage,
  validateAdmissionBeforeConnect,
} from './access';
import {handleAccessHttp} from './access-http';

type ConnectionState = Participant & {
  accessMode: 'protected' | 'legacy-open';
  deviceId: string | null;
  role: AuthRole;
  profileReady: boolean;
};
type Connection = Party.Connection<ConnectionState>;
type ReactionEvent = SocialReaction;
type RevisionBoundProposal = TimerProposal & {baseRevision: number; baseSessionId: string};
type ClockSocialState = {
  timer: TimerState;
  artifacts: SessionArtifact[];
  phaseParticipants: SessionArtifact['participants'];
  porchMessages: PorchMessage[];
  heldSignals: RoomSignal[];
  heldReactions: ReactionEvent[];
  reactionCount: number;
  signalCounts: Partial<Record<RoomCueId, number>>;
  reactionCounts: Record<string, number>;
  socialRelease: SocialRelease | null;
  media: RoomMediaState;
  mediaQueue: MediaQueueState;
  scene: PorchScene;
};
type QueueReceipt = {memberId: string; opId: string; fingerprint: string; revision: number; outcome: string};

const ALLOWED_TABLES = new Set(['tasks', 'sparks']);
const ALLOWED_REACTIONS = new Set(['🔥', '✨', '🫡', '💧']);
const ALLOWED_CELLS: Record<string, Set<string>> = {
  tasks: new Set(['text', 'done', 'createdAt', 'createdBy', 'ownerId', 'ownerName', 'completedAt']),
  sparks: new Set(['text', 'authorId', 'authorName', 'emoji', 'createdAt', 'pinned']),
};
const MAX_MESSAGE_BYTES = 4_096;
const MAX_HELD_REACTIONS = 32;
const MAX_SOCIAL_NONCES = 128;
const MAX_MEDIA_QUEUE_RECEIPTS = 128;
const MAX_WORKSPACE_ROWS_PER_TABLE = 256;
const WORKSPACE_SCHEMA = {
  tasks: {
    text: {type: 'string'}, done: {type: 'boolean', default: false}, createdAt: {type: 'number'}, createdBy: {type: 'string'},
    ownerId: {type: 'string', default: ''}, ownerName: {type: 'string', default: ''}, completedAt: {type: 'number', default: 0},
  },
  sparks: {
    text: {type: 'string'}, authorId: {type: 'string'}, authorName: {type: 'string'}, emoji: {type: 'string'},
    createdAt: {type: 'number'}, pinned: {type: 'boolean', default: false},
  },
} as const;
const createWorkspaceStore = () => createMergeableStore().setTablesSchema(WORKSPACE_SCHEMA);
const DEFAULT_ALLOWED_ORIGINS = ['https://magma-one-azure.vercel.app', 'http://localhost:5173', 'http://127.0.0.1:5173'];

const allowedOrigins = (env: Record<string, unknown>) => new Set([
  ...DEFAULT_ALLOWED_ORIGINS,
  ...(typeof env.MAGMA_ALLOWED_ORIGINS === 'string' ? env.MAGMA_ALLOWED_ORIGINS.split(',').map((value) => value.trim()).filter(Boolean) : []),
]);

const internalSecret = (env: Record<string, unknown>, _request: {url: string}) =>
  typeof env.MAGMA_INTERNAL_SECRET === 'string' && env.MAGMA_INTERNAL_SECRET.length >= 32
    ? env.MAGMA_INTERNAL_SECRET
    : '';

const withoutTrustedHeaders = (request: Party.Request) => {
  const headers = new Headers();
  request.headers.forEach((value, key) => {
    if (![TRUSTED_MEMBER_HEADER, TRUSTED_DEVICE_HEADER, TRUSTED_ROLE_HEADER].includes(key.toLowerCase())) headers.append(key, value);
  });
  return new Request(request.url, {method: request.method, headers}) as unknown as Party.Request;
};

const isInviteCommand = (value: unknown): value is {type: 'access.invite.create'; nonce: string; role: 'steward' | 'member' | 'guest'; rotate: boolean} => {
  if (!value || typeof value !== 'object') return false;
  const command = value as Record<string, unknown>;
  return command.type === 'access.invite.create'
    && typeof command.nonce === 'string' && /^[A-Za-z0-9-]{8,80}$/.test(command.nonce)
    && ['steward', 'member', 'guest'].includes(String(command.role))
    && typeof command.rotate === 'boolean';
};
const isMemberRevokeCommand = (value: unknown): value is {type: 'access.member.revoke'; memberId: string} => {
  if (!value || typeof value !== 'object') return false;
  const command = value as Record<string, unknown>;
  return command.type === 'access.member.revoke' && typeof command.memberId === 'string' && /^[A-Za-z0-9_-]{8,80}$/.test(command.memberId);
};

const text = (value: unknown, max: number) =>
  typeof value === 'string' ? value.trim().slice(0, max) : '';

const sanitizeProfile = (value: Profile): Profile | null => {
  const memberId = text(value.memberId, 64);
  const name = text(value.name, 32);
  if (!/^[a-zA-Z0-9_-]{8,64}$/.test(memberId) || !name) return null;
  return {
    memberId,
    name,
    color: /^#[0-9a-fA-F]{6}$/.test(value.color) ? value.color : '#9d8cff',
    emoji: text(value.emoji, 8) || '🫧',
    intention: text(value.intention, 120),
  };
};

const validDurations = (value: TimerDurations): TimerDurations | null => {
  const bounded = (duration: number) => Number.isFinite(duration) && duration >= 30_000 && duration <= 2 * 60 * 60_000;
  return bounded(value.focus) && bounded(value.shortBreak) && bounded(value.longBreak) ? value : null;
};

export default class MagmaRoom extends TinyBasePartyKitServer {
  static async onBeforeConnect(request: Party.Request, lobby: Party.Lobby): Promise<Party.Request | Response> {
    const clean = withoutTrustedHeaders(request);
    const status = await lobby.parties.main.get(lobby.id).fetch('/access/status');
    if (!status.ok) return new Response('Room access unavailable', {status: 503});
    const body = await status.json() as {classification?: unknown};
    if (body.classification === 'legacy-open') return clean;
    if (!['protected', 'unclaimed'].includes(String(body.classification))) return new Response('Room access unavailable', {status: 503});
    const secret = internalSecret(lobby.env, request);
    if (!secret) return new Response('Private room admission is not configured', {status: 503});
    return validateAdmissionBeforeConnect(clean, lobby, {partyName: 'main', internalSecret: secret}) as Promise<Party.Request | Response>;
  }

  private timer: TimerState = createTimer();
  private artifacts: SessionArtifact[] = [];
  private phaseParticipants: SessionArtifact['participants'] = [];
  private reactionCount = 0;
  private media: RoomMediaState = createMediaState();
  private listeningQueue: MediaQueueState = createMediaQueue(createMediaState().source);
  private scene: PorchScene = createScene(createMediaState().source);
  private hostMemberId: string | null = null;
  private proposal: RevisionBoundProposal | null = null;
  private messageTimes = new Map<string, number[]>();
  private roomQueue: Promise<void> = Promise.resolve();
  private mediaQueueReceipts: QueueReceipt[] = [];
  private queueTimes = new Map<string, number[]>();
  private roomQueueTimes: number[] = [];
  private porchMessages: PorchMessage[] = [];
  private heldSignals: RoomSignal[] = [];
  private heldReactions: ReactionEvent[] = [];
  private socialNonces: string[] = [];
  private socialRelease: SocialRelease | null = null;
  private signalCounts: Partial<Record<RoomCueId, number>> = {};
  private reactionCounts: Record<string, number> = {};
  private signalTimes = new Map<string, number[]>();
  private roomSignalTimes: number[] = [];
  private readonly access: RoomAccessController;
  private readonly workspace = createWorkspaceStore();
  private workspaceQueue: Promise<void> = Promise.resolve();
  private storedRoomState: StoredRoomState = migrateRoomState(undefined, {}, Date.now()).state;

  constructor(readonly room: Party.Room) {
    super(room);
    this.config.messagePrefix = 'tinybase:';
    this.access = new RoomAccessController(partyAccessStorage(room.storage), room.id);
  }

  async onStart() {
    const classification = await this.access.classify();
    await this.loadRoomState(classification !== 'unclaimed');
    const stored = this.storedRoomState.values;
    this.timer = normalizeTimer(stored.timer as TimerState | undefined);
    this.artifacts = (stored.artifacts as SessionArtifact[] | undefined) ?? [];
    this.phaseParticipants = (stored.phaseParticipants as SessionArtifact['participants'] | undefined) ?? [];
    this.reactionCount = this.normalizeReactionCount(stored.reactionCount);
    this.media = normalizeMediaState(stored.media as RoomMediaState | undefined);
    this.media = {...this.media, source: this.canonicalSource(this.media.source)};
    this.scene = reconcileVisual(normalizeScene(stored.scene, this.media.source), this.media.source);
    const storedQueue = stored.mediaQueue as MediaQueueState | undefined;
    this.listeningQueue = normalizeMediaQueue(storedQueue, this.media.source, this.media.changedAt);
    const activeItem = activeQueueItem(this.listeningQueue);
    if (activeItem.source.kind !== this.media.source.kind || activeItem.source.id !== this.media.source.id) {
      this.listeningQueue = {
        ...this.listeningQueue,
        items: this.listeningQueue.items.map((item) => item.id === this.listeningQueue.activeItemId
          ? {...item, source: this.media.source}
          : item),
      };
    }
    this.mediaQueueReceipts = this.normalizeQueueReceipts(stored.mediaQueueReceipts);
    this.porchMessages = normalizePorchMessages(stored.porchMessages);
    this.heldSignals = normalizeHeldSignals(stored.heldSignals);
    this.heldReactions = this.normalizeHeldReactions(stored.heldReactions);
    this.socialNonces = this.normalizeSocialNonces(stored.socialNonces);
    this.socialRelease = normalizeSocialRelease(stored.socialRelease);
    this.signalCounts = this.normalizeSignalCounts(stored.signalCounts);
    this.reactionCounts = this.normalizeReactionCounts(stored.reactionCounts);
    const workspace = stored.workspace as MergeableContent | undefined;
    let migratedTinyBaseWorkspace = false;
    if (workspace) this.workspace.applyMergeableChanges(workspace);
    else if (await hasStoreInStorage(this.room.storage)) {
      this.workspace.setContent(await loadStoreFromStorage(this.room.storage));
      migratedTinyBaseWorkspace = true;
    }
    if (classification !== 'unclaimed') {
      await this.persistEnvelopeOnly(this.currentStoredValues());
      // Keep the two production keys that the previous server eagerly
      // canonicalized so a rollback reads the same active source and queue.
      await this.persistRoomState({media: this.media, mediaQueue: this.listeningQueue, scene: this.scene});
      if (migratedTinyBaseWorkspace) await this.persistRoomState({workspace: this.workspace.getMergeableContent()});
    }
    await this.settleTimer('server');
    await this.scheduleAlarm();
  }

  async onConnect(connection: Connection, context: Party.ConnectionContext) {
    const url = new URL(context.request.url);
    const trustedMembershipId = context.request.headers.get(TRUSTED_MEMBER_HEADER);
    const trustedDeviceId = context.request.headers.get(TRUSTED_DEVICE_HEADER);
    const trustedRole = context.request.headers.get(TRUSTED_ROLE_HEADER) as AuthRole | null;
    const protectedConnection = Boolean(trustedMembershipId && trustedDeviceId && trustedRole
      && ['owner', 'steward', 'member', 'guest'].includes(trustedRole));
    const legacyProfile = protectedConnection ? null : sanitizeProfile({
      memberId: url.searchParams.get('memberId') ?? '', name: url.searchParams.get('name') ?? '',
      color: url.searchParams.get('color') ?? '', emoji: url.searchParams.get('emoji') ?? '',
      intention: url.searchParams.get('intention') ?? '',
    });
    await this.enqueueRoomMutation(async () => {
      if (protectedConnection && !(await this.access.validateClaims({
        membershipId: trustedMembershipId!,
        deviceId: trustedDeviceId!,
        role: trustedRole!,
      }))) {
        connection.send(JSON.stringify({type: 'access.revoked'}));
        connection.close(4003, 'Room access revoked');
        return;
      }
      await this.settleTimer('server');
      const profile = protectedConnection ? {
        memberId: trustedMembershipId!, name: '', color: '#9d8cff', emoji: '🫧', intention: '',
      } : legacyProfile;
      if (profile) {
        const memberState = this.memberState(profile.memberId, connection.id);
        connection.setState({
          ...profile,
          connectionId: connection.id,
          joinedAt: memberState?.joinedAt ?? Date.now(),
          connections: 1,
          presence: memberState?.presence ?? 'here',
          accessMode: protectedConnection ? 'protected' : 'legacy-open',
          deviceId: protectedConnection ? trustedDeviceId : null,
          role: protectedConnection ? trustedRole! : 'member',
          profileReady: !protectedConnection,
        });
        this.ensureHost();
        if (!protectedConnection && this.isActiveRunningPhase()) await this.rememberPhaseParticipant(profile);
      }
      await this.ensureWorkspaceStore();
      connection.send(JSON.stringify(this.snapshot()));
      connection.send(encodeWorkspaceSnapshot(this.workspace.getMergeableContent()));
      this.broadcastSnapshot();
    });
  }

  async onMessage(message: string, connection: Connection) {
    if (typeof message !== 'string') return;
    const workspaceMessage = message.startsWith('tinybase:');
    const maxBytes = workspaceMessage ? MAX_WORKSPACE_MESSAGE_BYTES : MAX_MESSAGE_BYTES;
    if (new TextEncoder().encode(message).byteLength > maxBytes || !this.withinRateLimit(connection.id, workspaceMessage ? 120 : 40)) {
      connection.send(JSON.stringify({type: 'notice', level: 'error', message: 'That room message was rejected.'}));
      return;
    }
    if (workspaceMessage) {
      if (!connection.state) return;
      const changes = decodeWorkspaceChanges(message);
      if (!changes) return;
      const operation = this.workspaceQueue.then(() => this.mergeWorkspaceChanges(changes, connection));
      this.workspaceQueue = operation.catch(() => undefined);
      await operation;
      return;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(message);
    } catch {
      return;
    }
    if (isInviteCommand(parsed)) {
      const actor = connection.state;
      if (!actor?.deviceId || actor.accessMode !== 'protected') return;
      const invitation = await this.access.createInvite(actor.deviceId, {
        role: parsed.role,
        maxUses: 8,
        expiresAt: Date.now() + 7 * 24 * 60 * 60_000,
        rotate: parsed.rotate,
        operationNonce: parsed.nonce,
      });
      connection.send(JSON.stringify(invitation.ok
        ? {type: 'access.invite.created', nonce: parsed.nonce, ...invitation.value, role: parsed.role}
        : {type: 'access.invite.rejected', nonce: parsed.nonce, reason: invitation.reason}));
      return;
    }
    if (isMemberRevokeCommand(parsed)) {
      await this.enqueueRoomMutation(async () => {
        const actor = connection.state;
        const targets = Array.from(this.room.getConnections<ConnectionState>())
          .filter((candidate) => candidate.state?.accessMode === 'protected' && candidate.state.memberId === parsed.memberId);
        if (!actor?.deviceId || actor.accessMode !== 'protected') return;
        const revoked = await this.access.revokeMembership(actor.deviceId, parsed.memberId);
        if (!revoked.ok) {
          connection.send(JSON.stringify({type: 'notice', level: 'error', message: 'That member could not be removed.'}));
          return;
        }
        for (const target of targets) {
          target.send(JSON.stringify({type: 'access.revoked'}));
          target.setState(null);
        }
        this.ensureHost();
        this.broadcastSnapshot();
        for (const target of targets) target.close(4003, 'Room access revoked');
      });
      return;
    }
    if (!isClientMessage(parsed)) return;

    if (parsed.type === 'clock.ping') {
      connection.send(JSON.stringify({type: 'clock.pong', clientSentAt: parsed.clientSentAt, serverNow: Date.now()}));
      return;
    }

    if (parsed.type === 'hello') {
      const profile = sanitizeProfile(parsed.profile);
      if (!profile) return;
      await this.enqueueRoomMutation(async () => {
        await this.settleTimer('server');
        const protectedMemberId = connection.state?.accessMode === 'protected' ? connection.state.memberId : null;
        const acceptedProfile = protectedMemberId ? {...profile, memberId: protectedMemberId} : profile;
        const memberState = this.memberState(acceptedProfile.memberId, connection.id);
        const currentState = connection.state?.memberId === acceptedProfile.memberId ? connection.state : null;
        connection.setState({
          ...acceptedProfile,
          connectionId: connection.id,
          joinedAt: currentState?.joinedAt ?? memberState?.joinedAt ?? Date.now(),
          connections: 1,
          presence: currentState?.presence ?? memberState?.presence ?? 'here',
          accessMode: currentState?.accessMode ?? 'legacy-open',
          deviceId: currentState?.deviceId ?? null,
          role: currentState?.role ?? 'member',
          profileReady: true,
        });
        this.ensureHost();
        if (this.isActiveRunningPhase()) await this.rememberPhaseParticipant(acceptedProfile);
        this.broadcastSnapshot();
      });
      return;
    }

    const participant = connection.state;
    if (!participant) {
      connection.send(JSON.stringify({type: 'notice', level: 'error', message: 'Join the room before changing it.'}));
      return;
    }

    if (parsed.type === 'reaction') {
      if (!ALLOWED_REACTIONS.has(parsed.emoji)) return;
      if (!this.withinSignalRate(participant.memberId)) return;
      await this.enqueueRoomMutation(async () => {
        await this.settleTimer('server');
        const reaction: ReactionEvent = {id: crypto.randomUUID(), emoji: text(parsed.emoji, 8), from: participant.name, fromId: participant.memberId, createdAt: Date.now()};
        if (isFloor(this.timer)) {
          const reactionCount = Math.min(10_000, this.reactionCount + 1);
          const reactionCounts = {...this.reactionCounts, [reaction.emoji]: Math.min(10_000, (this.reactionCounts[reaction.emoji] ?? 0) + 1)};
          await this.persistRoomState({reactionCount, reactionCounts});
          this.reactionCount = reactionCount;
          this.reactionCounts = reactionCounts;
        } else {
          this.room.broadcast(JSON.stringify({type: 'reaction', ...reaction}));
        }
      });
      return;
    }

    if (parsed.type === 'presence.set') {
      await this.enqueueRoomMutation(async () => {
        await this.settleTimer('server');
        const choice: PresenceChoice = parsed.choice === 'ready' && isFloor(this.timer) ? 'here' : parsed.choice;
        for (const candidate of this.room.getConnections<Participant>()) {
          if (candidate.state?.memberId === participant.memberId) candidate.setState({...candidate.state, presence: choice});
        }
        await this.scheduleAlarm();
        this.broadcastSnapshot();
      });
      return;
    }

    if (parsed.type === 'porch.message') {
      await this.enqueueRoomMutation(async () => {
        await this.settleTimer('server');
        const porchMessage = createPorchMessage(parsed.text, participant, Date.now(), this.timer.sessionId);
        if (!porchMessage) return;
        if (this.socialNonces.includes(parsed.nonce)) {
          connection.send(JSON.stringify({type: 'porch.accepted', nonce: parsed.nonce}));
          return;
        }
        const porchMessages = [...this.porchMessages, porchMessage].slice(-MAX_PORCH_MESSAGES);
        const socialNonces = [...this.socialNonces, parsed.nonce].slice(-MAX_SOCIAL_NONCES);
        await this.persistRoomState({porchMessages, socialNonces});
        this.porchMessages = porchMessages;
        this.socialNonces = socialNonces;
        connection.send(JSON.stringify({type: 'porch.accepted', nonce: parsed.nonce, message: porchMessage}));
        if (!isFloor(this.timer)) this.room.broadcast(JSON.stringify({type: 'porch.message', message: porchMessage}));
      });
      return;
    }

    if (parsed.type === 'social.signal') {
      if (!this.withinSignalRate(participant.memberId)) return;
      await this.enqueueRoomMutation(async () => {
        await this.settleTimer('server');
        const signal = normalizeHeldSignals([{
          id: crypto.randomUUID(), cueId: parsed.cueId, authorId: participant.memberId, authorName: participant.name,
          authorEmoji: participant.emoji, createdAt: Date.now(), sessionId: this.timer.sessionId,
        }])[0];
        if (!signal || this.socialNonces.includes(parsed.nonce)) return;
        const socialNonces = [...this.socialNonces, parsed.nonce].slice(-MAX_SOCIAL_NONCES);
        if (isFloor(this.timer)) {
          const signalCounts = {...this.signalCounts, [signal.cueId]: Math.min(MAX_HELD_SIGNALS, (this.signalCounts[signal.cueId] ?? 0) + 1)};
          await this.persistRoomState({signalCounts, socialNonces});
          this.signalCounts = signalCounts;
        } else {
          await this.persistRoomState({socialNonces});
          this.room.broadcast(JSON.stringify({type: 'social.signal', signal}));
        }
        this.socialNonces = socialNonces;
      });
      return;
    }

    if (parsed.type === 'media.command') {
      await this.enqueueRoomMutation(async () => {
        await this.settleTimer('server');
        if (parsed.command.type === 'source') {
          connection.send(JSON.stringify({type: 'notice', level: 'error', message: 'Add sources through the Listening Deck.'}));
          connection.send(JSON.stringify(this.snapshot()));
          return;
        }
        if (parsed.expectedRevision !== this.media.revision || parsed.expectedItemId !== this.listeningQueue.activeItemId) {
          connection.send(JSON.stringify({type: 'notice', level: 'error', message: 'The shared view changed—try that again.'}));
          connection.send(JSON.stringify(this.snapshot()));
          return;
        }
        const next = applyMediaCommand(this.media, parsed.command, Date.now(), participant.memberId);
        await this.persistRoomState({media: next});
        this.media = next;
        this.broadcastSnapshot();
      });
      return;
    }

    if (parsed.type === 'scene.command') {
      await this.enqueueRoomMutation(async () => {
        if (parsed.expectedRevision !== this.scene.revision) {
          connection.send(JSON.stringify({type: 'notice', level: 'error', message: 'The room scene changed—try that again.'}));
          connection.send(JSON.stringify(this.snapshot()));
          return;
        }
        const command = parsed.command.type === 'radio'
          ? {type: 'radio' as const, radio: parsed.command.radio?.id === KEXP_RADIO.id ? KEXP_RADIO : null}
          : {type: 'overlays' as const, overlays: parsed.command.overlays.some((overlay) => overlay.id === DAYLIGHT_OVERLAY.id) ? [DAYLIGHT_OVERLAY] : []};
        const scene = applySceneCommand(this.scene, command, Date.now(), participant.memberId);
        await this.persistRoomState({scene});
        this.scene = scene;
        this.broadcastSnapshot();
      });
      return;
    }

    if (parsed.type.startsWith('media.queue.')) {
      await this.enqueueRoomMutation(async () => {
        await this.settleTimer('server');
        const command = parsed as Extract<typeof parsed, {type: `media.queue.${string}`}>;
        const fingerprint = JSON.stringify(command);
        const receipt = this.mediaQueueReceipts.find((item) => item.memberId === participant.memberId && item.opId === command.opId);
        if (receipt) {
          if (receipt.fingerprint === fingerprint) {
            connection.send(JSON.stringify({type: 'media.queue.accepted', opId: command.opId, revision: receipt.revision, outcome: receipt.outcome}));
            connection.send(JSON.stringify(this.snapshot()));
          } else {
            this.rejectQueue(connection, command.opId, 'That deck operation identifier was already used.');
          }
          return;
        }
        if (!participant.profileReady || !canContributeToQueue(participant.role)) {
          this.rejectQueue(connection, command.opId, 'This room role can listen but cannot change the deck.');
          return;
        }
        if (!this.withinQueueRate(participant.memberId)) {
          this.rejectQueue(connection, command.opId, 'The deck is moving quickly. Take a breath and try again.');
          return;
        }

        const current = this.listeningQueue;
        let next: MediaQueueState | null = null;
        let outcome = '';
        if (command.type === 'media.queue.enqueue') {
          if (command.activate && !canArrangeQueue(participant.role, current.policy)) {
            this.rejectQueue(connection, command.opId, 'Your source was not added because only deck stewards can select what plays right now.');
            return;
          }
          const sequence = current.items.reduce((highest, item) => Math.max(highest, item.sequence), -1) + 1;
          const item: MediaQueueItem = {
            id: `mq_${crypto.randomUUID().replaceAll('-', '')}`,
            source: this.canonicalSource(command.source),
            addedById: participant.memberId,
            addedByName: participant.name,
            addedByEmoji: participant.emoji,
            addedAt: Date.now(),
            sequence,
            origin: 'member',
            heldForSessionId: isFloor(this.timer) ? this.timer.sessionId : null,
          };
          next = enqueueMedia(current, item, command.activate, isFloor(this.timer));
          outcome = command.activate ? (isFloor(this.timer) ? 'staged' : 'activated') : 'enqueued';
        } else {
          if (command.expectedRevision !== current.revision) {
            this.rejectQueue(connection, command.opId, 'The Listening Deck changed—review the latest order and try again.');
            return;
          }
          if (command.type === 'media.queue.move') {
            if (!canArrangeQueue(participant.role, current.policy)) return this.rejectQueue(connection, command.opId, 'Only deck stewards can arrange this room right now.');
            next = moveMedia(current, command.itemId, command.beforeItemId);
            outcome = 'moved';
          } else if (command.type === 'media.queue.remove') {
            const item = current.items.find((candidate) => candidate.id === command.itemId);
            if (!item || !canRemoveQueueItem(participant.role, current.policy, participant.memberId, item)) return this.rejectQueue(connection, command.opId, 'You cannot remove that deck item.');
            next = removeMedia(current, command.itemId);
            outcome = 'removed';
          } else if (command.type === 'media.queue.select') {
            if (!canArrangeQueue(participant.role, current.policy)) return this.rejectQueue(connection, command.opId, 'Only deck stewards can select the room view right now.');
            next = selectMedia(current, command.itemId, isFloor(this.timer));
            outcome = isFloor(this.timer) ? 'staged' : 'activated';
          } else if (command.type === 'media.queue.policy') {
            if (!canSetDeckPolicy(participant.role)) return this.rejectQueue(connection, command.opId, 'Only the room owner can change deck policy.');
            next = setDeckPolicy(current, command.policy);
            outcome = 'policy';
          }
        }
        if (!next) {
          this.rejectQueue(connection, command.opId, 'That deck change is no longer available.');
          return;
        }
        const nextMedia = next.activeItemId !== current.activeItemId
          ? applyMediaCommand(this.media, {type: 'source', source: activeQueueItem(next).source}, Date.now(), participant.memberId)
          : this.media;
        const nextScene = nextMedia === this.media ? this.scene : withVisual(this.scene, nextMedia.source, Date.now(), participant.memberId);
        const receipts = [...this.mediaQueueReceipts, {
          memberId: participant.memberId, opId: command.opId, fingerprint, revision: next.revision, outcome,
        }].slice(-MAX_MEDIA_QUEUE_RECEIPTS);
        await this.persistRoomState({mediaQueue: next, media: nextMedia, scene: nextScene, mediaQueueReceipts: receipts});
        this.listeningQueue = next;
        this.media = nextMedia;
        this.scene = nextScene;
        this.mediaQueueReceipts = receipts;
        connection.send(JSON.stringify({type: 'media.queue.accepted', opId: command.opId, revision: next.revision, outcome}));
        this.broadcastSnapshot();
      });
      return;
    }

    if (parsed.type === 'host.transfer') {
      if (!this.isHost(connection)) return;
      const target = Array.from(this.room.getConnections<Participant>()).find((candidate) => candidate.state?.memberId === parsed.memberId);
      if (target) {
        this.hostMemberId = target.state!.memberId;
        this.proposal = null;
        this.broadcastSnapshot();
      }
      return;
    }

    if (parsed.type === 'timer.settings') {
      const durations = validDurations(parsed.durations);
      if (!durations) return;
      await this.enqueueRoomMutation(async () => {
        await this.settleTimer('server');
        if (parsed.expectedRevision !== this.timer.revision || parsed.expectedSessionId !== this.timer.sessionId) {
          this.rejectStaleClock(connection);
          return;
        }
        const wasFloor = isFloor(this.timer);
        const timer = applyTimerSettings(this.timer, durations, parsed.autoAdvance, participant.memberId);
        const state = this.stateForTimerTransition(wasFloor, timer, this.phaseParticipants);
        await this.commitClockAndSocial(state);
        this.adoptClockAndSocial(state);
        this.broadcastSnapshot();
      });
      return;
    }

    if (parsed.type === 'timer.approve' || parsed.type === 'timer.dismiss') {
      if (!this.isHost(connection) || this.proposal?.id !== parsed.proposalId) return;
      await this.enqueueRoomMutation(async () => {
        await this.settleTimer('server');
        const proposal = this.proposal;
        this.proposal = null;
        if (parsed.type === 'timer.approve' && proposal
          && proposal.baseRevision === this.timer.revision
          && proposal.baseSessionId === this.timer.sessionId) await this.applyCommand(proposal.command, participant.memberId);
        else this.broadcastSnapshot();
      });
      return;
    }

    if (parsed.type === 'timer.command') {
      await this.enqueueRoomMutation(async () => {
        await this.settleTimer('server');
        if (parsed.expectedRevision !== this.timer.revision) {
          connection.send(JSON.stringify({type: 'notice', level: 'error', message: 'The clock changed—try that again.'}));
          connection.send(JSON.stringify(this.snapshot()));
          return;
        }
        this.proposal = null;
        await this.applyCommand(parsed.command, participant.memberId);
      });
    }
  }

  async onAlarm() {
    await this.enqueueRoomMutation(async () => {
      await this.settleTimer('server');
      await this.scheduleAlarm();
      this.broadcastSnapshot();
    });
  }

  async onRequest(request: Party.Request) {
    const standardRequest = request as unknown as Request;
    const internal = await handleInternalAdmission(standardRequest, this.access, internalSecret(this.room.env, request));
    if (internal) return internal;
    const access = await handleAccessHttp(standardRequest, this.access, allowedOrigins(this.room.env));
    if (access) return access;
    // TinyBase's default HTTP bootstrap endpoint is intentionally not exposed;
    // authenticated sockets receive and merge the workspace snapshot instead.
    if (new URL(request.url).pathname.endsWith(this.config.storePath ?? '/store')) {
      return new Response('Not found', {status: 404, headers: {'cache-control': 'no-store'}});
    }
    return new Response('Not found', {status: 404});
  }

  onClose(connection: Connection) {
    this.messageTimes.delete(connection.id);
    this.ensureHost(connection.id);
    this.broadcastSnapshot();
  }

  async canSetTable(tableId: string) {
    return ALLOWED_TABLES.has(tableId);
  }

  async canDelTable() {
    return false;
  }

  async canSetRow(tableId: string, rowId: string) {
    return ALLOWED_TABLES.has(tableId) && rowId.length <= 80;
  }

  async canDelRow(tableId: string, rowId: string) {
    return ALLOWED_TABLES.has(tableId) && rowId.length <= 80;
  }

  async canSetCell(tableId: string, _rowId: string, cellId: string, cell: string | number | boolean) {
    const schemas: Record<string, Record<string, (value: typeof cell) => boolean>> = {
      tasks: {
        text: (value) => typeof value === 'string' && value.length <= 160,
        done: (value) => typeof value === 'boolean',
        createdAt: (value) => typeof value === 'number' && Number.isFinite(value),
        createdBy: (value) => typeof value === 'string' && value.length <= 40,
        ownerId: (value) => typeof value === 'string' && value.length <= 64,
        ownerName: (value) => typeof value === 'string' && value.length <= 40,
        completedAt: (value) => typeof value === 'number' && Number.isFinite(value),
      },
      sparks: {
        text: (value) => typeof value === 'string' && value.length <= 500,
        authorId: (value) => typeof value === 'string' && value.length <= 64,
        authorName: (value) => typeof value === 'string' && value.length <= 40,
        emoji: (value) => typeof value === 'string' && value.length <= 8,
        createdAt: (value) => typeof value === 'number' && Number.isFinite(value),
        pinned: (value) => typeof value === 'boolean',
      },
    };
    return schemas[tableId]?.[cellId]?.(cell) ?? false;
  }

  async canDelCell(tableId: string, _rowId: string, cellId: string) {
    return ALLOWED_CELLS[tableId]?.has(cellId) ?? false;
  }

  async canSetValue() {
    return false;
  }

  async canDelValue() {
    return false;
  }

  private async applyCommand(command: TimerCommand, memberId: string) {
    await this.settleTimer('server');
    const wasFloor = isFloor(this.timer);
    const timer = applyTimerCommand(this.timer, command, Date.now(), memberId);
    const enteredNewFloor = !wasFloor && isFloor(timer);
    const phaseParticipants = enteredNewFloor
      ? this.uniqueParticipants().map(({memberId, name, color, emoji, intention}) => ({memberId, name, color, emoji, intention}))
      : this.phaseParticipants;
    const state = this.stateForTimerTransition(wasFloor, timer, phaseParticipants);
    await this.commitClockAndSocial(state);
    this.adoptClockAndSocial(state);
    if (enteredNewFloor) this.resetReadyPresence();
    this.broadcastSnapshot();
  }

  private async settleTimer(controllerId: string) {
    const now = Date.now();
    let timer = this.timer;
    let artifacts = this.artifacts;
    let phaseParticipants = this.phaseParticipants;
    let socialRelease = this.socialRelease;
    let heldSignals = this.heldSignals;
    let heldReactions = this.heldReactions;
    let reactionCount = this.reactionCount;
    let signalCounts = this.signalCounts;
    let reactionCounts = this.reactionCounts;
    let media = this.media;
    let mediaQueue = this.listeningQueue;
    let scene = this.scene;
    const newFocusCompletions: Array<{artifact: SessionArtifact; release: SocialRelease}> = [];
    let completedAnyPhase = false;

    while (true) {
      const wasFloor = isFloor(timer);
      const result = settleElapsed(timer, now, controllerId);
      if (!result.completion) {
        timer = result.timer;
        break;
      }
      completedAnyPhase = true;

      if (result.completion.mode === 'focus') {
        const existingArtifact = artifacts.find((item) => item.id === result.completion!.sessionId);
        const artifact: SessionArtifact = existingArtifact ?? {
          ...result.completion,
          id: result.completion.sessionId,
          focusCount: result.timer.focusCount,
          participants: phaseParticipants,
          reactionCount,
        };
        if (!existingArtifact) artifacts = [artifact, ...artifacts].slice(0, 24);
        const release = socialRelease?.releaseId === result.completion.sessionId
          ? socialRelease
          : normalizeSocialRelease({
              releaseId: result.completion.sessionId,
              sessionId: result.completion.sessionId,
              createdAt: result.completion.completedAt,
              signalCounts,
              reactionCounts,
            })!;
        socialRelease = release;
        if (!existingArtifact) newFocusCompletions.push({artifact, release});
      }

      phaseParticipants = result.timer.status === 'running'
        ? this.uniqueParticipants().map(({memberId, name, color, emoji, intention}) => ({memberId, name, color, emoji, intention}))
        : [];
      if (wasFloor !== isFloor(result.timer)) {
        heldSignals = [];
        heldReactions = [];
        reactionCount = 0;
        signalCounts = {};
        reactionCounts = {};
      }
      if (wasFloor && !isFloor(result.timer)) {
        const activated = releaseHeldMedia(mediaQueue, timer.sessionId);
        if (activated.activeItemId !== mediaQueue.activeItemId) {
          mediaQueue = activated;
          media = applyMediaCommand(media, {type: 'source', source: activeQueueItem(activated).source}, now, controllerId);
          scene = withVisual(scene, media.source, now, controllerId);
        } else mediaQueue = activated;
      }
      timer = result.timer;
    }

    if (!completedAnyPhase) {
      this.timer = timer;
      return false;
    }
    const state: ClockSocialState = {
      timer, artifacts, phaseParticipants, porchMessages: this.porchMessages, heldSignals, heldReactions,
      reactionCount, signalCounts, reactionCounts, socialRelease, media, mediaQueue, scene,
    };
    await this.commitClockAndSocial(state);
    this.adoptClockAndSocial(state);
    this.proposal = null;
    for (const {artifact, release} of newFocusCompletions) {
      this.room.broadcast(JSON.stringify({type: 'session.complete', artifact}));
      if (release.totalSignals || release.totalReactions) {
        this.room.broadcast(JSON.stringify({type: 'social.bloom', release}));
      }
    }
    this.broadcastSnapshot();
    return true;
  }

  private currentStoredValues(): RoomStateValues {
    return {
      timer: this.timer,
      artifacts: this.artifacts,
      phaseParticipants: this.phaseParticipants,
      reactionCount: this.reactionCount,
      media: this.media,
      mediaQueue: this.listeningQueue,
      mediaQueueReceipts: this.mediaQueueReceipts,
      porchMessages: this.porchMessages,
      heldSignals: this.heldSignals,
      heldReactions: this.heldReactions,
      socialNonces: this.socialNonces,
      socialRelease: this.socialRelease,
      signalCounts: this.signalCounts,
      reactionCounts: this.reactionCounts,
      workspace: this.workspace.getMergeableContent(),
      scene: this.scene,
    };
  }

  private async loadRoomState(persistMigration: boolean) {
    const stored = await this.room.storage.get(ROOM_STATE_KEY);
    const legacyValues: LegacyRoomStateValues = {};
    if (stored === undefined) {
      for (const [field, key] of Object.entries(LEGACY_ROOM_KEYS) as Array<[RoomStateField, string]>) {
        const value = await this.room.storage.get(key);
        if (value !== undefined) legacyValues[field] = value;
      }
    }
    const migration = migrateRoomState(stored, legacyValues, Date.now());
    if (!migration.migrated || !persistMigration) {
      this.storedRoomState = migration.state;
      return;
    }
    let committed = migration.state;
    await this.room.storage.transaction(async (transaction) => {
      const current = await transaction.get(ROOM_STATE_KEY);
      const checked = migrateRoomState(current, legacyValues, migration.state.persistedAt);
      if (!checked.migrated) {
        committed = checked.state;
        return;
      }
      await transaction.put({
        ...(checked.backup ? {[ROOM_STATE_BACKUP_KEY]: checked.backup} : {}),
        ...(checked.versionBackup ? {[ROOM_STATE_V1_BACKUP_KEY]: checked.versionBackup} : {}),
        [ROOM_STATE_KEY]: checked.state,
      });
      committed = checked.state;
    });
    this.storedRoomState = committed;
  }

  private async persistRoomState(
    patch: RoomStateValues,
    alarm: {type: 'set'; at: number} | {type: 'delete'} | null = null,
  ) {
    let committed: StoredRoomState | null = null;
    await this.room.storage.transaction(async (transaction) => {
      const stored = await transaction.get(ROOM_STATE_KEY);
      const base = stored === undefined
        ? this.storedRoomState
        : migrateRoomState(stored, {}, Date.now()).state;
      const next = updateStoredRoomState(base, patch, Date.now());
      await transaction.put({...legacyEntries(patch), [ROOM_STATE_KEY]: next});
      if (alarm?.type === 'set') await transaction.setAlarm(alarm.at);
      else if (alarm?.type === 'delete') await transaction.deleteAlarm();
      committed = next;
    });
    this.storedRoomState = committed!;
  }

  private async persistEnvelopeOnly(patch: RoomStateValues) {
    let committed: StoredRoomState | null = null;
    await this.room.storage.transaction(async (transaction) => {
      const stored = await transaction.get(ROOM_STATE_KEY);
      const base = stored === undefined
        ? this.storedRoomState
        : migrateRoomState(stored, {}, Date.now()).state;
      const next = updateStoredRoomState(base, patch, Date.now());
      await transaction.put(ROOM_STATE_KEY, next);
      committed = next;
    });
    this.storedRoomState = committed!;
  }

  private async commitClockAndSocial(state: ClockSocialState) {
    await this.persistRoomState({
      timer: state.timer,
      artifacts: state.artifacts,
      phaseParticipants: state.phaseParticipants,
      porchMessages: state.porchMessages,
      heldSignals: state.heldSignals,
      heldReactions: state.heldReactions,
      reactionCount: state.reactionCount,
      signalCounts: state.signalCounts,
      reactionCounts: state.reactionCounts,
      socialRelease: state.socialRelease,
      media: state.media,
      mediaQueue: state.mediaQueue,
      scene: state.scene,
    }, state.timer.status === 'running' && state.timer.endsAt !== null
      ? {type: 'set', at: state.timer.endsAt}
      : {type: 'delete'});
  }

  private stateForTimerTransition(wasFloor: boolean, timer: TimerState, phaseParticipants: SessionArtifact['participants']): ClockSocialState {
    const nowFloor = isFloor(timer);
    const crossedFloorBoundary = wasFloor !== nowFloor;
    const mediaQueue = wasFloor && !nowFloor ? releaseHeldMedia(this.listeningQueue, this.timer.sessionId) : this.listeningQueue;
    const media = mediaQueue.activeItemId !== this.listeningQueue.activeItemId
      ? applyMediaCommand(this.media, {type: 'source', source: activeQueueItem(mediaQueue).source}, Date.now(), 'server')
      : this.media;
    const scene = media === this.media ? this.scene : withVisual(this.scene, media.source, Date.now(), 'server');
    return {
      timer,
      artifacts: this.artifacts,
      phaseParticipants,
      porchMessages: nowFloor && !wasFloor ? [] : this.porchMessages,
      heldSignals: crossedFloorBoundary ? [] : this.heldSignals,
      heldReactions: crossedFloorBoundary ? [] : this.heldReactions,
      reactionCount: crossedFloorBoundary ? 0 : this.reactionCount,
      signalCounts: crossedFloorBoundary ? {} : this.signalCounts,
      reactionCounts: crossedFloorBoundary ? {} : this.reactionCounts,
      socialRelease: nowFloor && !wasFloor ? null : this.socialRelease,
      media,
      mediaQueue,
      scene,
    };
  }

  private adoptClockAndSocial(state: ClockSocialState) {
    this.timer = state.timer;
    this.artifacts = state.artifacts;
    this.phaseParticipants = state.phaseParticipants;
    this.porchMessages = state.porchMessages;
    this.heldSignals = state.heldSignals;
    this.heldReactions = state.heldReactions;
    this.reactionCount = state.reactionCount;
    this.signalCounts = state.signalCounts;
    this.reactionCounts = state.reactionCounts;
    this.socialRelease = state.socialRelease;
    this.media = state.media;
    this.listeningQueue = state.mediaQueue;
    this.scene = state.scene;
  }

  private resetReadyPresence() {
    for (const connection of this.room.getConnections<ConnectionState>()) {
      if (connection.state?.presence === 'ready') connection.setState({...connection.state, presence: 'here'});
    }
  }

  private async scheduleAlarm() {
    if (this.timer.status === 'running' && this.timer.endsAt) await this.room.storage.setAlarm(this.timer.endsAt);
    else await this.room.storage.deleteAlarm();
  }

  private async rememberPhaseParticipant(profile: Profile) {
    if (this.phaseParticipants.some((participant) => participant.memberId === profile.memberId)) return;
    const phaseParticipants = [...this.phaseParticipants, {...profile}];
    await this.persistRoomState({phaseParticipants});
    this.phaseParticipants = phaseParticipants;
  }

  private uniqueParticipants(): Participant[] {
    const byMember = new Map<string, Participant>();
    for (const connection of this.room.getConnections<ConnectionState>()) {
      const participant = connection.state;
      if (!participant?.profileReady) continue;
      const existing = byMember.get(participant.memberId);
      if (existing) existing.connections += 1;
      else byMember.set(participant.memberId, {
        memberId: participant.memberId, name: participant.name, color: participant.color, emoji: participant.emoji,
        intention: participant.intention, connectionId: participant.connectionId, joinedAt: participant.joinedAt,
        connections: 1, presence: participant.presence, role: participant.role,
      });
    }
    return [...byMember.values()].sort((a, b) => a.joinedAt - b.joinedAt);
  }

  private ensureHost(excludedConnectionId?: string) {
    const connections = Array.from(this.room.getConnections<ConnectionState>()).filter((connection) => connection.id !== excludedConnectionId && connection.state?.profileReady);
    if (this.hostMemberId && connections.some((connection) => connection.state!.memberId === this.hostMemberId)) return;
    const next = Array.from(this.room.getConnections<ConnectionState>())
      .filter((connection) => connection.id !== excludedConnectionId && connection.state?.profileReady)
      .sort((a, b) => a.state!.joinedAt - b.state!.joinedAt)[0];
    this.hostMemberId = next?.state?.memberId ?? null;
  }

  private isHost(connection: Connection) {
    this.ensureHost();
    return Boolean(connection.state && this.hostMemberId === connection.state.memberId);
  }

  private memberState(memberId: string, excludedConnectionId?: string) {
    return Array.from(this.room.getConnections<ConnectionState>())
      .filter((candidate) => candidate.id !== excludedConnectionId && candidate.state?.memberId === memberId)
      .sort((a, b) => a.state!.joinedAt - b.state!.joinedAt)[0]?.state ?? null;
  }

  private isActiveRunningPhase() {
    return this.timer.status === 'running' && this.timer.endsAt !== null && this.timer.endsAt > Date.now();
  }

  private rejectStaleClock(connection: Connection) {
    connection.send(JSON.stringify({type: 'notice', level: 'error', message: 'The clock changed—try that again.'}));
    connection.send(JSON.stringify(this.snapshot()));
  }

  private enqueueRoomMutation(operation: () => Promise<void>) {
    const pending = this.roomQueue.then(operation);
    this.roomQueue = pending.catch(() => undefined);
    return pending;
  }

  private normalizeSocialNonces(value: unknown) {
    if (!Array.isArray(value)) return [];
    return value.filter((nonce): nonce is string => typeof nonce === 'string' && /^[a-zA-Z0-9-]{8,80}$/.test(nonce)).slice(-MAX_SOCIAL_NONCES);
  }

  private normalizeQueueReceipts(value: unknown): QueueReceipt[] {
    if (!Array.isArray(value)) return [];
    return value.flatMap((candidate) => {
      if (!candidate || typeof candidate !== 'object') return [];
      const receipt = candidate as Record<string, unknown>;
      return typeof receipt.memberId === 'string' && /^[A-Za-z0-9_-]{8,64}$/.test(receipt.memberId)
        && typeof receipt.opId === 'string' && /^[A-Za-z0-9-]{8,80}$/.test(receipt.opId)
        && typeof receipt.fingerprint === 'string' && receipt.fingerprint.length <= 1_024
        && Number.isSafeInteger(receipt.revision) && Number(receipt.revision) >= 0
        && typeof receipt.outcome === 'string' && receipt.outcome.length <= 24
        ? [{memberId: receipt.memberId, opId: receipt.opId, fingerprint: receipt.fingerprint, revision: Number(receipt.revision), outcome: receipt.outcome}]
        : [];
    }).slice(-MAX_MEDIA_QUEUE_RECEIPTS);
  }

  private normalizeReactionCount(value: unknown) {
    return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : 0;
  }

  private normalizeSignalCounts(value: unknown): Partial<Record<RoomCueId, number>> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    const counts: Partial<Record<RoomCueId, number>> = {};
    for (const cueId of ROOM_CUES) {
      const count = (value as Record<string, unknown>)[cueId];
      if (typeof count === 'number' && Number.isSafeInteger(count) && count > 0) counts[cueId] = count;
    }
    return counts;
  }

  private normalizeReactionCounts(value: unknown): Record<string, number> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    const counts: Record<string, number> = {};
    for (const emoji of ALLOWED_REACTIONS) {
      const count = (value as Record<string, unknown>)[emoji];
      if (typeof count === 'number' && Number.isSafeInteger(count) && count > 0) counts[emoji] = count;
    }
    return counts;
  }

  private normalizeHeldReactions(value: unknown): ReactionEvent[] {
    if (!Array.isArray(value)) return [];
    return value.flatMap((candidate) => {
      if (!candidate || typeof candidate !== 'object') return [];
      const record = candidate as Record<string, unknown>;
      const emoji = text(record.emoji, 8);
      const from = text(record.from, 32);
      const fromId = text(record.fromId, 64);
      const id = text(record.id, 80);
      const createdAt = typeof record.createdAt === 'number' && Number.isFinite(record.createdAt) ? Math.max(0, Math.floor(record.createdAt)) : -1;
      return id && from && fromId && ALLOWED_REACTIONS.has(emoji) && createdAt >= 0 ? [{id, emoji, from, fromId, createdAt}] : [];
    }).slice(-MAX_HELD_REACTIONS);
  }

  private withinSignalRate(memberId: string) {
    const now = Date.now();
    const recent = (this.signalTimes.get(memberId) ?? []).filter((timestamp) => timestamp > now - 10_000);
    this.roomSignalTimes = this.roomSignalTimes.filter((timestamp) => timestamp > now - 10_000);
    if (recent.length >= 6 || this.roomSignalTimes.length >= 24) {
      this.signalTimes.set(memberId, recent);
      return false;
    }
    recent.push(now);
    this.roomSignalTimes.push(now);
    this.signalTimes.set(memberId, recent);
    return true;
  }

  private withinQueueRate(memberId: string) {
    const now = Date.now();
    const recent = (this.queueTimes.get(memberId) ?? []).filter((timestamp) => timestamp > now - 10_000);
    this.roomQueueTimes = this.roomQueueTimes.filter((timestamp) => timestamp > now - 10_000);
    if (recent.length >= 4 || this.roomQueueTimes.length >= 12) {
      this.queueTimes.set(memberId, recent);
      return false;
    }
    recent.push(now);
    this.roomQueueTimes.push(now);
    this.queueTimes.set(memberId, recent);
    return true;
  }

  private rejectQueue(connection: Connection, opId: string, message: string) {
    connection.send(JSON.stringify({type: 'media.queue.rejected', opId, revision: this.listeningQueue.revision, message}));
    connection.send(JSON.stringify({type: 'notice', level: 'error', message}));
    connection.send(JSON.stringify(this.snapshot()));
  }

  private snapshot() {
    const participants = this.uniqueParticipants();
    const hostId = this.hostMemberId;
    return {
      type: 'snapshot' as const,
      serverNow: Date.now(),
      timer: this.timer,
      participants,
      hostId,
      proposal: this.proposal,
      artifacts: this.artifacts,
      media: this.media,
      mediaQueue: this.publicMediaQueue(),
      scene: this.scene,
      porchMessages: isFloor(this.timer) ? [] : this.porchMessages,
      socialRelease: isFloor(this.timer) ? null : this.socialRelease,
    };
  }

  private publicMediaQueue(): MediaQueueState {
    if (!isFloor(this.timer)) return this.listeningQueue;
    return {
      ...this.listeningQueue,
      items: this.listeningQueue.items.filter((item) => item.heldForSessionId !== this.timer.sessionId),
      stagedItemId: null,
    };
  }

  private canonicalSource(source: YouTubeSource): YouTubeSource {
    const known = SCENE_PRESETS.find((candidate) => candidate.id === source.id && candidate.kind === source.kind);
    if (known) return {kind: known.kind, id: known.id, label: known.label};
    return {kind: source.kind, id: source.id, label: source.kind === 'playlist' ? 'Room playlist' : source.kind === 'live' ? 'Room live stream' : 'Room video'};
  }

  private broadcastSnapshot() {
    this.room.broadcast(JSON.stringify(this.snapshot()));
  }

  private withinRateLimit(connectionId: string, limit: number) {
    const now = Date.now();
    const recent = (this.messageTimes.get(connectionId) ?? []).filter((timestamp) => timestamp > now - 10_000);
    recent.push(now);
    this.messageTimes.set(connectionId, recent);
    return recent.length <= limit;
  }

  private async ensureWorkspaceStore() {
    if (this.storedRoomState.values.workspace !== undefined) return;
    if (await hasStoreInStorage(this.room.storage) && this.workspace.getTableIds().length === 0) {
      this.workspace.setContent(await loadStoreFromStorage(this.room.storage));
    }
    await this.persistRoomState({workspace: this.workspace.getMergeableContent()});
  }

  private validWorkspace(workspace: MergeableStore) {
    if (workspace.getValueIds().length > 0) return false;
    const allowedTables = ALLOWED_TABLES;
    if (workspace.getTableIds().some((tableId) => !allowedTables.has(tableId))) return false;
    for (const tableId of workspace.getTableIds()) {
      const rowIds = workspace.getRowIds(tableId);
      if (rowIds.length > MAX_WORKSPACE_ROWS_PER_TABLE || rowIds.some((rowId) => rowId.length > 80)) return false;
      for (const rowId of rowIds) {
        for (const cellId of workspace.getCellIds(tableId, rowId)) {
          const value = workspace.getCell(tableId, rowId, cellId);
          const validator = ALLOWED_CELLS[tableId]?.has(cellId)
            && (tableId === 'tasks'
              ? ({
                  text: typeof value === 'string' && value.length <= 160,
                  done: typeof value === 'boolean',
                  createdAt: typeof value === 'number' && Number.isFinite(value),
                  createdBy: typeof value === 'string' && value.length <= 40,
                  ownerId: typeof value === 'string' && value.length <= 64,
                  ownerName: typeof value === 'string' && value.length <= 40,
                  completedAt: typeof value === 'number' && Number.isFinite(value),
                } as Record<string, boolean>)[cellId]
              : ({
                  text: typeof value === 'string' && value.length <= 500,
                  authorId: typeof value === 'string' && value.length <= 64,
                  authorName: typeof value === 'string' && value.length <= 40,
                  emoji: typeof value === 'string' && value.length <= 8,
                  createdAt: typeof value === 'number' && Number.isFinite(value),
                  pinned: typeof value === 'boolean',
                } as Record<string, boolean>)[cellId]);
          if (!validator) return false;
        }
      }
    }
    return true;
  }

  private canonicalizeWorkspace(candidate: MergeableStore, actor: ConnectionState) {
    const now = Date.now();
    const originalTaskIds = new Set(this.workspace.getRowIds('tasks'));
    for (const rowId of candidate.getRowIds('tasks')) {
      const original = originalTaskIds.has(rowId) ? this.workspace.getRow('tasks', rowId) : null;
      if (!original) {
        candidate.setCell('tasks', rowId, 'createdAt', now);
        candidate.setCell('tasks', rowId, 'createdBy', actor.name);
        const claimed = candidate.getCell('tasks', rowId, 'ownerId');
        candidate.setCell('tasks', rowId, 'ownerId', claimed === '' ? '' : actor.memberId);
        candidate.setCell('tasks', rowId, 'ownerName', claimed === '' ? '' : actor.name);
        candidate.setCell('tasks', rowId, 'completedAt', candidate.getCell('tasks', rowId, 'done') === true ? now : 0);
        continue;
      }
      candidate.setCell('tasks', rowId, 'createdAt', original.createdAt);
      candidate.setCell('tasks', rowId, 'createdBy', original.createdBy);
      const originalOwner = String(original.ownerId ?? '');
      const requestedOwner = String(candidate.getCell('tasks', rowId, 'ownerId') ?? '');
      if (requestedOwner !== originalOwner) {
        const acceptedOwner = requestedOwner === '' || requestedOwner === actor.memberId ? requestedOwner : originalOwner;
        candidate.setCell('tasks', rowId, 'ownerId', acceptedOwner);
        candidate.setCell('tasks', rowId, 'ownerName', acceptedOwner === '' ? '' : acceptedOwner === actor.memberId ? actor.name : original.ownerName);
      } else {
        candidate.setCell('tasks', rowId, 'ownerName', original.ownerName);
      }
      if (candidate.getCell('tasks', rowId, 'done') !== original.done) {
        candidate.setCell('tasks', rowId, 'completedAt', candidate.getCell('tasks', rowId, 'done') === true ? now : 0);
      } else {
        candidate.setCell('tasks', rowId, 'completedAt', original.completedAt);
      }
    }

    const originalSparkIds = new Set(this.workspace.getRowIds('sparks'));
    for (const rowId of originalSparkIds) {
      if (candidate.hasRow('sparks', rowId)) continue;
      const original = this.workspace.getRow('sparks', rowId);
      if (original.authorId !== actor.memberId && !['owner', 'steward'].includes(actor.role)) {
        candidate.setRow('sparks', rowId, original);
      }
    }
    for (const rowId of candidate.getRowIds('sparks')) {
      const original = originalSparkIds.has(rowId) ? this.workspace.getRow('sparks', rowId) : null;
      if (!original) {
        candidate.setCell('sparks', rowId, 'authorId', actor.memberId);
        candidate.setCell('sparks', rowId, 'authorName', actor.name);
        candidate.setCell('sparks', rowId, 'emoji', actor.emoji);
        candidate.setCell('sparks', rowId, 'createdAt', now);
        continue;
      }
      candidate.setCell('sparks', rowId, 'text', original.text);
      candidate.setCell('sparks', rowId, 'authorId', original.authorId);
      candidate.setCell('sparks', rowId, 'authorName', original.authorName);
      candidate.setCell('sparks', rowId, 'emoji', original.emoji);
      candidate.setCell('sparks', rowId, 'createdAt', original.createdAt);
    }

  }

  private async mergeWorkspaceChanges(changes: MergeableChanges, connection: Connection) {
    const candidate = createWorkspaceStore();
    candidate.applyMergeableChanges(this.workspace.getMergeableContent());
    candidate.applyMergeableChanges(changes);
    if (!this.validWorkspace(candidate)) {
      connection.send(JSON.stringify({type: 'notice', level: 'error', message: 'That workspace change was rejected.'}));
      return;
    }
    if (!connection.state?.profileReady) return;
    this.canonicalizeWorkspace(candidate, connection.state);
    // Restamp the accepted plain content in the room authority so hostile or
    // far-future client clocks cannot permanently dominate the CRDT.
    const content = candidate.getContent();
    let accepted: MergeableChanges = [[{}], [{}], 1];
    const listener = this.workspace.addDidFinishTransactionListener(() => {
      accepted = this.workspace.getTransactionMergeableChanges();
    });
    this.workspace.setContent(content);
    this.workspace.delListener(listener);
    if (!hasWorkspaceChanges(accepted)) return;
    await this.persistRoomState({workspace: this.workspace.getMergeableContent()});
    this.room.broadcast(encodeWorkspaceChanges(accepted));
  }
}

MagmaRoom satisfies Party.Worker;
