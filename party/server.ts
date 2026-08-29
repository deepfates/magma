import type * as Party from 'partykit/server';
import {TinyBasePartyKitServer} from 'tinybase/persisters/persister-partykit-server';
import {applyTimerCommand, applyTimerSettings, createTimer, normalizeTimer, settleElapsed, type TimerCommand, type TimerDurations, type TimerState} from '../src/domain/timer';
import {applyMediaCommand, createMediaState, normalizeMediaState, type RoomMediaState} from '../src/domain/media';
import {isClientMessage, type Participant, type Profile, type SessionArtifact, type TimerProposal} from '../src/domain/protocol';
import {SCENE_PRESETS, type YouTubeSource} from '../src/domain/youtube';

type Connection = Party.Connection<Participant>;

const TIMER_KEY = 'magma:timer';
const ARTIFACTS_KEY = 'magma:artifacts';
const PHASE_PARTICIPANTS_KEY = 'magma:phase-participants';
const REACTION_COUNT_KEY = 'magma:reaction-count';
const MEDIA_KEY = 'magma:media';
const ALLOWED_TABLES = new Set(['tasks', 'sparks']);
const ALLOWED_REACTIONS = new Set(['🔥', '✨', '🫡', '💧']);
const ALLOWED_CELLS: Record<string, Set<string>> = {
  tasks: new Set(['text', 'done', 'createdAt', 'createdBy', 'ownerId', 'ownerName', 'completedAt']),
  sparks: new Set(['text', 'authorId', 'authorName', 'emoji', 'createdAt', 'pinned']),
};
const MAX_MESSAGE_BYTES = 4_096;

const text = (value: unknown, max: number) =>
  typeof value === 'string' ? value.trim().slice(0, max) : '';

const sanitizeProfile = (value: Profile): Profile | null => {
  const memberId = text(value.memberId, 64);
  const name = text(value.name, 32);
  if (!/^[a-zA-Z0-9-]{8,64}$/.test(memberId) || !name) return null;
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
  private timer: TimerState = createTimer();
  private artifacts: SessionArtifact[] = [];
  private phaseParticipants: SessionArtifact['participants'] = [];
  private reactionCount = 0;
  private media: RoomMediaState = createMediaState();
  private hostMemberId: string | null = null;
  private proposal: TimerProposal | null = null;
  private messageTimes = new Map<string, number[]>();
  private mediaQueue: Promise<void> = Promise.resolve();

  constructor(readonly room: Party.Room) {
    super(room);
    this.config.messagePrefix = 'tinybase:';
  }

  async onStart() {
    this.timer = normalizeTimer(await this.room.storage.get<TimerState>(TIMER_KEY));
    this.artifacts = (await this.room.storage.get<SessionArtifact[]>(ARTIFACTS_KEY)) ?? [];
    this.phaseParticipants = (await this.room.storage.get<SessionArtifact['participants']>(PHASE_PARTICIPANTS_KEY)) ?? [];
    this.reactionCount = (await this.room.storage.get<number>(REACTION_COUNT_KEY)) ?? 0;
    this.media = normalizeMediaState(await this.room.storage.get<RoomMediaState>(MEDIA_KEY));
    this.media = {...this.media, source: this.canonicalSource(this.media.source)};
    await this.settleTimer('server');
    await this.scheduleAlarm();
  }

  onConnect(connection: Connection, context: Party.ConnectionContext) {
    const url = new URL(context.request.url);
    const profile = sanitizeProfile({
      memberId: url.searchParams.get('memberId') ?? '',
      name: url.searchParams.get('name') ?? '',
      color: url.searchParams.get('color') ?? '',
      emoji: url.searchParams.get('emoji') ?? '',
      intention: url.searchParams.get('intention') ?? '',
    });
    if (profile) {
      connection.setState({...profile, connectionId: connection.id, joinedAt: Date.now(), connections: 1});
      this.ensureHost();
      if (this.timer.status === 'running') void this.rememberPhaseParticipant(profile);
    }
    connection.send(JSON.stringify(this.snapshot()));
    this.broadcastSnapshot();
  }

  async onMessage(message: string, connection: Connection) {
    if (typeof message !== 'string' || message.length > MAX_MESSAGE_BYTES || !this.withinRateLimit(connection.id)) {
      connection.send(JSON.stringify({type: 'notice', level: 'error', message: 'That room message was rejected.'}));
      return;
    }
    if (message.startsWith('tinybase:')) {
      if (!connection.state) return;
      await super.onMessage(message, connection);
      return;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(message);
    } catch {
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
      const previousJoinedAt = connection.state?.joinedAt;
      connection.setState({...profile, connectionId: connection.id, joinedAt: previousJoinedAt ?? Date.now(), connections: 1});
      this.ensureHost();
      if (this.timer.status === 'running') await this.rememberPhaseParticipant(profile);
      this.broadcastSnapshot();
      return;
    }

    const participant = connection.state;
    if (!participant) {
      connection.send(JSON.stringify({type: 'notice', level: 'error', message: 'Join the room before changing it.'}));
      return;
    }

    if (parsed.type === 'reaction') {
      if (!ALLOWED_REACTIONS.has(parsed.emoji)) return;
      this.reactionCount += 1;
      await this.room.storage.put(REACTION_COUNT_KEY, this.reactionCount);
      this.room.broadcast(JSON.stringify({type: 'reaction', id: crypto.randomUUID(), emoji: text(parsed.emoji, 8), from: participant.name}));
      return;
    }

    if (parsed.type === 'media.command') {
      const operation = this.mediaQueue.then(async () => {
        if (parsed.expectedRevision !== this.media.revision) {
          connection.send(JSON.stringify({type: 'notice', level: 'error', message: 'The shared view changed—try that again.'}));
          connection.send(JSON.stringify(this.snapshot()));
          return;
        }
        const command = parsed.command.type === 'source'
          ? {...parsed.command, source: this.canonicalSource(parsed.command.source)}
          : parsed.command;
        const next = applyMediaCommand(this.media, command, Date.now(), participant.memberId);
        await this.room.storage.put(MEDIA_KEY, next);
        this.media = next;
        this.broadcastSnapshot();
      });
      this.mediaQueue = operation.catch(() => undefined);
      await operation;
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
      if (!this.isHost(connection)) return;
      const durations = validDurations(parsed.durations);
      if (!durations) return;
      this.timer = applyTimerSettings(this.timer, durations, parsed.autoAdvance, participant.memberId);
      await this.persistTimer();
      await this.scheduleAlarm();
      this.broadcastSnapshot();
      return;
    }

    if (parsed.type === 'timer.approve' || parsed.type === 'timer.dismiss') {
      if (!this.isHost(connection) || this.proposal?.id !== parsed.proposalId) return;
      const proposal = this.proposal;
      this.proposal = null;
      if (parsed.type === 'timer.approve' && proposal) await this.applyCommand(proposal.command, participant.memberId);
      else this.broadcastSnapshot();
      return;
    }

    if (parsed.type === 'timer.command') {
      if (parsed.expectedRevision !== this.timer.revision) {
        connection.send(JSON.stringify({type: 'notice', level: 'error', message: 'The clock changed—try that again.'}));
        return;
      }
      if (this.isHost(connection)) await this.applyCommand(parsed.command, participant.memberId);
      else {
        this.proposal = {id: crypto.randomUUID(), fromId: participant.memberId, fromName: participant.name, command: parsed.command, createdAt: Date.now()};
        this.broadcastSnapshot();
      }
    }
  }

  async onAlarm() {
    await this.settleTimer('server');
    await this.scheduleAlarm();
    this.broadcastSnapshot();
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
    this.timer = applyTimerCommand(this.timer, command, Date.now(), memberId);
    if (command.type === 'start') {
      this.phaseParticipants = this.uniqueParticipants().map(({memberId, name, color, emoji, intention}) => ({memberId, name, color, emoji, intention}));
      this.reactionCount = 0;
      await Promise.all([
        this.room.storage.put(PHASE_PARTICIPANTS_KEY, this.phaseParticipants),
        this.room.storage.put(REACTION_COUNT_KEY, 0),
      ]);
    }
    await this.persistTimer();
    await this.scheduleAlarm();
    this.broadcastSnapshot();
  }

  private async settleTimer(controllerId: string) {
    const result = settleElapsed(this.timer, Date.now(), controllerId);
    this.timer = result.timer;
    if (!result.completion) return;
    const artifact: SessionArtifact = {
      ...result.completion,
      id: result.completion.sessionId,
      focusCount: this.timer.focusCount,
      participants: this.phaseParticipants,
      reactionCount: this.reactionCount,
    };
    if (!this.artifacts.some((item) => item.id === artifact.id)) this.artifacts = [artifact, ...this.artifacts].slice(0, 24);
    this.phaseParticipants = this.timer.status === 'running'
      ? this.uniqueParticipants().map(({memberId, name, color, emoji, intention}) => ({memberId, name, color, emoji, intention}))
      : [];
    this.reactionCount = 0;
    await Promise.all([
      this.persistTimer(),
      this.room.storage.put(ARTIFACTS_KEY, this.artifacts),
      this.room.storage.put(PHASE_PARTICIPANTS_KEY, this.phaseParticipants),
      this.room.storage.put(REACTION_COUNT_KEY, 0),
    ]);
    this.room.broadcast(JSON.stringify({type: 'session.complete', artifact}));
  }

  private async persistTimer() {
    await this.room.storage.put(TIMER_KEY, this.timer);
  }

  private async scheduleAlarm() {
    if (this.timer.status === 'running' && this.timer.endsAt) await this.room.storage.setAlarm(this.timer.endsAt);
    else await this.room.storage.deleteAlarm();
  }

  private async rememberPhaseParticipant(profile: Profile) {
    if (this.phaseParticipants.some((participant) => participant.memberId === profile.memberId)) return;
    this.phaseParticipants.push({...profile});
    await this.room.storage.put(PHASE_PARTICIPANTS_KEY, this.phaseParticipants);
  }

  private uniqueParticipants(): Participant[] {
    const byMember = new Map<string, Participant>();
    for (const connection of this.room.getConnections<Participant>()) {
      const participant = connection.state;
      if (!participant) continue;
      const existing = byMember.get(participant.memberId);
      if (existing) existing.connections += 1;
      else byMember.set(participant.memberId, {...participant, connections: 1});
    }
    return [...byMember.values()].sort((a, b) => a.joinedAt - b.joinedAt);
  }

  private ensureHost(excludedConnectionId?: string) {
    const connections = Array.from(this.room.getConnections<Participant>()).filter((connection) => connection.id !== excludedConnectionId && connection.state);
    if (this.hostMemberId && connections.some((connection) => connection.state!.memberId === this.hostMemberId)) return;
    const next = Array.from(this.room.getConnections<Participant>())
      .filter((connection) => connection.id !== excludedConnectionId && connection.state)
      .sort((a, b) => a.state!.joinedAt - b.state!.joinedAt)[0];
    this.hostMemberId = next?.state?.memberId ?? null;
  }

  private isHost(connection: Connection) {
    this.ensureHost();
    return Boolean(connection.state && this.hostMemberId === connection.state.memberId);
  }

  private snapshot() {
    const participants = this.uniqueParticipants();
    const hostId = this.hostMemberId;
    return {type: 'snapshot' as const, serverNow: Date.now(), timer: this.timer, participants, hostId, proposal: this.proposal, artifacts: this.artifacts, media: this.media};
  }

  private canonicalSource(source: YouTubeSource): YouTubeSource {
    const known = SCENE_PRESETS.find((candidate) => candidate.id === source.id && candidate.kind === source.kind);
    if (known) return {kind: known.kind, id: known.id, label: known.label};
    return {kind: source.kind, id: source.id, label: source.kind === 'playlist' ? 'Room playlist' : source.kind === 'live' ? 'Room live stream' : 'Room video'};
  }

  private broadcastSnapshot() {
    this.room.broadcast(JSON.stringify(this.snapshot()));
  }

  private withinRateLimit(connectionId: string) {
    const now = Date.now();
    const recent = (this.messageTimes.get(connectionId) ?? []).filter((timestamp) => timestamp > now - 10_000);
    recent.push(now);
    this.messageTimes.set(connectionId, recent);
    return recent.length <= 40;
  }
}

MagmaRoom satisfies Party.Worker;
