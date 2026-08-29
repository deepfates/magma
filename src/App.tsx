import {useEffect, useMemo, useRef, useState} from 'react';
import {
  Bell, BellOff, Check, Circle, Copy, Crown, Flame, ListTodo, Maximize2, Minimize2, Pause, Pin, Play, Plus,
  RotateCcw, Settings, SlidersHorizontal, Sparkles, StickyNote, Timer, Trash2, Users, X,
} from 'lucide-react';
import {useTable} from 'tinybase/ui-react';
import {LavaShader} from './LavaShader';
import {formatRemaining, type TimerMode, type TimerState} from './domain/timer';
import type {Participant, Profile, SessionArtifact} from './domain/protocol';
import {deriveParticipantPosture, isFloor, type PorchMessage} from './domain/porch';
import {deriveSalonPhase} from './domain/salonPhase';
import {store} from './store';
import {useAmbientAudio} from './useAmbientAudio';
import {useFocusAssist} from './useFocusAssist';
import {useRoom} from './useRoom';
import {useYouTubeBackdrop} from './useYouTubeBackdrop';
import {YouTubeBackdrop} from './YouTubeBackdrop';
import {EnvironmentLab} from './EnvironmentLab';
import {BlockAim} from './BlockAim';
import {useBlockRitual} from './useBlockRitual';
import {Porch} from './Porch';
import {ArrivalVeil, RoomAccess, type ArrivalState} from './ArrivalVeil';
import {useRoomAccess} from './useRoomAccess';

const MODES: {id: TimerMode; label: string}[] = [
  {id: 'focus', label: 'Focus'},
  {id: 'shortBreak', label: 'Short break'},
  {id: 'longBreak', label: 'Long break'},
];
const PROFILE_EMOJIS = ['🫧', '🪩', '🧃', '🌋', '🪼', '🌙'];
const PROFILE_COLORS = ['#ff7a90', '#9d8cff', '#65d9c4', '#ffd071', '#7ab8ff', '#ef91ff'];

const roomFromUrl = () => {
  const room = new URLSearchParams(window.location.search).get('room');
  if (room) return room.toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 64) || 'molten-lobby';
  const generated = crypto.randomUUID();
  const url = new URL(window.location.href);
  url.searchParams.set('room', generated);
  window.history.replaceState({}, '', url);
  return generated;
};

const useClock = (remaining: () => number) => {
  const [milliseconds, setMilliseconds] = useState(remaining());
  useEffect(() => {
    setMilliseconds(remaining());
    const interval = window.setInterval(() => setMilliseconds(remaining()), 200);
    return () => window.clearInterval(interval);
  }, [remaining]);
  return milliseconds;
};

function ProfileEditor({profile, onChange, onClose}: {profile: Profile; onChange: (patch: Partial<Profile>) => void; onClose: () => void}) {
  return (
    <div className="profile-editor">
      <div className="editor-heading"><strong>Enter as yourself</strong><button className="icon-button" onClick={onClose} aria-label="Close profile editor"><X size={15} /></button></div>
      <label>Name<input maxLength={32} value={profile.name} onChange={(event) => onChange({name: event.target.value})} /></label>
      <label>Today’s intention<input maxLength={120} value={profile.intention} placeholder="What are you holding?" onChange={(event) => onChange({intention: event.target.value})} /></label>
      <div className="profile-options" aria-label="Choose your room symbol">
        {PROFILE_EMOJIS.map((emoji) => <button className={profile.emoji === emoji ? 'selected' : ''} key={emoji} onClick={() => onChange({emoji})}>{emoji}</button>)}
      </div>
      <div className="color-options" aria-label="Choose your color">
        {PROFILE_COLORS.map((color) => <button aria-label={`Use ${color}`} className={profile.color === color ? 'selected' : ''} key={color} style={{background: color}} onClick={() => onChange({color})} />)}
      </div>
    </div>
  );
}

function People({participants, profile, timer, hostId, isHost, editProfile, transferHost, setPresence, viewerRole, revokeMember}: {
  participants: Participant[]; profile: Profile; hostId: string | null; isHost: boolean;
  timer: TimerState; editProfile: () => void; transferHost: (memberId: string) => void;
  setPresence: (choice: Participant['presence']) => void;
  viewerRole?: Participant['role']; revokeMember?: (memberId: string) => void;
}) {
  const self = participants.find((person) => person.memberId === profile.memberId);
  const ready = participants.filter((person) => deriveParticipantPosture(person.presence, timer) === 'ready').length;
  return (
    <section className="people-card">
      <div className="card-title"><span><Users size={17} /> In the glow</span><small>{ready ? `${ready} ready · ` : ''}{participants.length} {participants.length === 1 ? 'person' : 'people'}</small></div>
      <div className="people">
        {participants.map((person) => {
          const posture = deriveParticipantPosture(person.presence, timer);
          return <div className="person" data-posture={posture} key={person.memberId}>
            <button className="avatar" style={{'--person-color': person.color} as React.CSSProperties} onClick={person.memberId === profile.memberId ? editProfile : undefined} aria-label={person.memberId === profile.memberId ? 'Edit your profile' : `${person.name} profile`}>{person.emoji}</button>
            <div><strong>{person.name}{person.memberId === profile.memberId ? ' · you' : ''}</strong><small><span className="posture">{posture}</span>{person.role !== 'member' ? ` · ${person.role}` : ''}{person.intention ? ` · ${person.intention}` : ''}{person.connections > 1 ? ` · ${person.connections} tabs` : ''}</small></div>
            {person.memberId === hostId ? <Crown className="host-crown" size={13} aria-label="Room host" /> : isHost ? <button className="host-transfer" onClick={() => transferHost(person.memberId)} aria-label={`Make ${person.name} host`}><Crown size={12} /></button> : <span className="pulse" />}
            {person.memberId !== profile.memberId && revokeMember && ((viewerRole === 'owner' && person.role !== 'owner') || (viewerRole === 'steward' && ['member', 'guest'].includes(person.role))) && <button className="icon-button danger" onClick={() => revokeMember(person.memberId)} aria-label={`Remove ${person.name} from room`}><Trash2 size={13} /></button>}
          </div>;
        })}
      </div>
      {self && <div className="presence-choices" aria-label="Your presence"><button aria-pressed={self.presence === 'here'} onClick={() => setPresence('here')}>Here</button><button aria-pressed={self.presence === 'ready'} disabled={isFloor(timer)} onClick={() => setPresence('ready')}>Ready</button><button aria-pressed={self.presence === 'away'} onClick={() => setPresence('away')}>Away</button></div>}
    </section>
  );
}

function Tasks({profile, participants, writable}: {profile: Profile; participants: Participant[]; writable: boolean}) {
  const tasks = useTable('tasks', store);
  const [draft, setDraft] = useState('');
  const ordered = useMemo(() => Object.entries(tasks).sort(([, a], [, b]) => Number(a.createdAt) - Number(b.createdAt)), [tasks]);
  const people = new Map(participants.map((person) => [person.memberId, person]));

  const add = () => {
    const value = draft.trim();
    if (!value) return;
    store.setRow('tasks', crypto.randomUUID(), {text: value, done: false, createdAt: Date.now(), createdBy: profile.name, ownerId: profile.memberId, ownerName: profile.name, completedAt: 0});
    setDraft('');
  };

  return (
    <div className="workspace-content">
      <div className="task-list">
        {ordered.length === 0 && <p className="empty">Drop one small, finishable thing here.</p>}
        {ordered.map(([id, task]) => {
          const owner = people.get(String(task.ownerId));
          return (
            <div className={`task ${task.done ? 'done' : ''}`} key={id}>
              <button className="task-check" disabled={!writable} onClick={() => store.setRow('tasks', id, {...task, done: !task.done, completedAt: task.done ? 0 : Date.now()})} aria-label={`Mark ${task.text} ${task.done ? 'unfinished' : 'done'}`}>{task.done ? <Check size={14} /> : <Circle size={14} />}</button>
              <div><span>{String(task.text)}</span><small>{owner ? `${owner.emoji} ${owner.name}` : task.ownerName ? String(task.ownerName) : 'unclaimed'}</small></div>
              <button className="claim-button" disabled={!writable} onClick={() => store.setRow('tasks', id, {...task, ownerId: task.ownerId === profile.memberId ? '' : profile.memberId, ownerName: task.ownerId === profile.memberId ? '' : profile.name})}>{task.ownerId === profile.memberId ? 'Release' : 'Claim'}</button>
              <button className="icon-button danger" disabled={!writable} onClick={() => store.delRow('tasks', id)} aria-label={`Delete ${task.text}`}><Trash2 size={14} /></button>
            </div>
          );
        })}
      </div>
      {writable ? <div className="add-task"><input value={draft} maxLength={160} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && add()} placeholder="What are we making real?" /><button onClick={add} aria-label="Add intention"><Plus size={17} /></button></div> : <p className="surface-note">Guests can read the workspace. A steward can invite you as a member to edit it.</p>}
    </div>
  );
}

function Sparks({profile, writable}: {profile: Profile; writable: boolean}) {
  const sparks = useTable('sparks', store);
  const [draft, setDraft] = useState('');
  const ordered = useMemo(() => Object.entries(sparks).sort(([, a], [, b]) => Number(b.createdAt) - Number(a.createdAt)), [sparks]);
  const add = () => {
    const value = draft.trim();
    if (!value) return;
    store.setRow('sparks', crypto.randomUUID(), {text: value, authorId: profile.memberId, authorName: profile.name, emoji: profile.emoji, createdAt: Date.now(), pinned: false});
    setDraft('');
  };
  return (
    <div className="workspace-content">
      <div className="spark-list">
        {ordered.length === 0 && <p className="empty">Leave a thought without interrupting the room.</p>}
        {ordered.map(([id, spark]) => <div className="spark" key={id}><span>{String(spark.emoji)}</span><div><p>{String(spark.text)}</p><small>{String(spark.authorName)}</small></div><button className="icon-button" disabled={!writable} onClick={() => store.setCell('sparks', id, 'pinned', !spark.pinned)} aria-label={`${spark.pinned ? 'Unpin' : 'Pin'} note`}><Pin size={13} fill={spark.pinned ? 'currentColor' : 'none'} /></button>{writable && spark.authorId === profile.memberId && <button className="icon-button" onClick={() => store.delRow('sparks', id)} aria-label="Delete your note"><Trash2 size={13} /></button>}</div>)}
      </div>
      {writable ? <div className="add-task"><input value={draft} maxLength={500} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && add()} placeholder="Leave a spark for the room" /><button onClick={add} aria-label="Add room note"><Plus size={17} /></button></div> : <p className="surface-note">Guests can read Sparks without changing them.</p>}
    </div>
  );
}

function Workspace({profile, participants, writable}: {profile: Profile; participants: Participant[]; writable: boolean}) {
  const [tab, setTab] = useState<'tasks' | 'sparks'>('tasks');
  const tasks = useTable('tasks', store);
  const sparks = useTable('sparks', store);
  return (
    <section className="tasks-card">
      <div className="workspace-tabs" role="tablist" aria-label="Room workspace">
        <button role="tab" aria-selected={tab === 'tasks'} className={tab === 'tasks' ? 'active' : ''} onClick={() => setTab('tasks')}><Check size={15} /> Intentions <small>{Object.keys(tasks).length}</small></button>
        <button role="tab" aria-selected={tab === 'sparks'} className={tab === 'sparks' ? 'active' : ''} onClick={() => setTab('sparks')}><StickyNote size={15} /> Sparks <small>{Object.keys(sparks).length}</small></button>
      </div>
      {tab === 'tasks' ? <Tasks profile={profile} participants={participants} writable={writable} /> : <Sparks profile={profile} writable={writable} />}
    </section>
  );
}

function CompletionRitual({artifact, onClose, decision, onDecide}: {artifact: SessionArtifact; onClose: () => void; decision?: 'counted' | 'released'; onDecide: (decision: 'counted' | 'released') => void}) {
  const minutes = Math.round(artifact.durationMs / 60_000);
  return (
    <section className="completion-ritual" aria-live="polite">
      <button className="icon-button completion-close" onClick={onClose} aria-label="Close session ember"><X size={16} /></button>
      <div className="ember-mark"><Flame size={28} fill="currentColor" /></div>
      <p className="eyebrow">session ember · {artifact.mode}</p>
      <h2>{minutes} {minutes === 1 ? 'minute' : 'minutes'} held together.</h2>
      <p>{artifact.participants.length ? artifact.participants.map((person) => `${person.emoji} ${person.name}`).join(' · ') : 'The room kept the flame.'}</p>
      <small>{artifact.reactionCount} reactions · focus #{artifact.focusCount}</small>
      {artifact.mode === 'focus' && <div className="block-verdict">{decision ? <p>{decision === 'counted' ? '◆ Counted in today’s stack.' : 'Released. The work still happened.'}</p> : <><strong>Was it one clean, finish-directed Block?</strong><div><button onClick={() => onDecide('counted')}>Count this Block</button><button onClick={() => onDecide('released')}>It didn’t count</button></div></>}</div>}
    </section>
  );
}

type Surface = 'workspace' | 'environment' | 'tempo' | 'room';

function App() {
  const [room] = useState(roomFromUrl);
  const access = useRoomAccess(room);
  const protectedAccess = access.session.kind === 'admitted' ? access.session : null;
  const legacyAccess = access.session.kind === 'legacy';
  const session = useRoom(room, legacyAccess ? undefined : protectedAccess?.admission ?? null, protectedAccess?.refreshAdmission);
  const milliseconds = useClock(session.remaining);
  const audio = useAmbientAudio();
  const canSteerMedia = session.connected && session.role !== 'guest';
  const backdrop = useYouTubeBackdrop(session.media.source, canSteerMedia);
  const ritual = useBlockRitual();
  const assist = useFocusAssist(session.timer.status === 'running', session.completion, audio.playChime);
  const [copied, setCopied] = useState(false);
  const [justCreated, setJustCreated] = useState(false);
  const [invitationPayload, setInvitationPayload] = useState('');
  const [invitationBusy, setInvitationBusy] = useState<'copying' | 'rotating' | null>(null);
  const [editingProfile, setEditingProfile] = useState(false);
  const [activeSurface, setActiveSurface] = useState<Surface | null>(null);
  const [playerMode, setPlayerMode] = useState(false);
  const [pulse, setPulse] = useState(0);
  const [reviewArtifact, setReviewArtifact] = useState<SessionArtifact | null>(null);
  const [socialTreatment, setSocialTreatment] = useState<{id: number; text: string; glyph: string} | null>(null);
  const seenReactions = useRef(new Set<string>());
  const seenSignals = useRef(new Set<string>());
  const seenSocialBloom = useRef(new Set<string>());
  const queuedSocial = useRef({reactions: 0, signals: 0, names: new Set<string>()});
  const socialFlush = useRef<number | null>(null);
  const socialClear = useRef<number | null>(null);
  const surfaceTrigger = useRef<HTMLButtonElement | null>(null);
  const instrumentRef = useRef<HTMLElement | null>(null);
  const progress = 1 - milliseconds / session.timer.durationMs;
  const salonPhase = deriveSalonPhase(session.timer, session.roomNow());
  const selfPresence = session.participants.find((person) => person.memberId === session.profile.memberId)?.presence ?? 'here';
  const readyCount = session.participants.filter((person) => person.presence === 'ready').length;
  const peopleInRoom = session.participants.length;
  const presenceSymbols = session.participants.slice(0, 3).map((person) => person.emoji).join(' ');

  const applyQuietBoundary = () => {
    backdrop.setMuted(true);
    audio.silence();
    assist.disableNotifications();
  };

  useEffect(() => {
    if (access.session.kind !== 'revoked') return;
    applyQuietBoundary();
    backdrop.setEnabled(false);
    backdrop.setReducedSensory(true);
    setPlayerMode(false);
    setActiveSurface(null);
  }, [access.session.kind]);

  useEffect(() => {
    if (!session.completion) return;
    setActiveSurface(null);
    setPulse(1);
    const timeout = window.setTimeout(() => setPulse(0), 2800);
    return () => window.clearTimeout(timeout);
  }, [session.completion]);

  useEffect(() => {
    const trimSeen = (seen: Set<string>) => {
      while (seen.size > 128) seen.delete(seen.values().next().value!);
    };
    for (const reaction of session.reactions) {
      if (seenReactions.current.has(reaction.id)) continue;
      seenReactions.current.add(reaction.id);
      queuedSocial.current.reactions += 1;
      queuedSocial.current.names.add(reaction.from);
    }
    for (const signal of session.signals) {
      if (seenSignals.current.has(signal.id)) continue;
      seenSignals.current.add(signal.id);
      queuedSocial.current.signals += 1;
      queuedSocial.current.names.add(signal.authorName);
    }
    trimSeen(seenReactions.current);
    trimSeen(seenSignals.current);
    if ((!queuedSocial.current.reactions && !queuedSocial.current.signals) || socialFlush.current !== null) return;
    socialFlush.current = window.setTimeout(() => {
      socialFlush.current = null;
      const queued = queuedSocial.current;
      queuedSocial.current = {reactions: 0, signals: 0, names: new Set<string>()};
      const count = queued.reactions + queued.signals;
      const names = [...queued.names];
      const people = names.length === 0 ? 'The room' : names.length === 1 ? names[0] : `${names.slice(0, 2).join(' and ')}${names.length > 2 ? ` and ${names.length - 2} more` : ''}`;
      const kind = queued.reactions && queued.signals ? 'reactions and signals' : queued.signals ? (count === 1 ? 'a signal' : 'signals') : (count === 1 ? 'a reaction' : 'reactions');
      setSocialTreatment({id: Date.now(), text: `${people} shared ${count === 1 ? '' : `${count} `}${kind}.`, glyph: queued.signals ? '✦' : '◇'});
      void audio.playSocialCue();
      if (socialClear.current !== null) window.clearTimeout(socialClear.current);
      socialClear.current = window.setTimeout(() => setSocialTreatment(null), 4200);
    }, 120);
  }, [audio.playSocialCue, session.reactions, session.signals]);

  useEffect(() => {
    const bloom = session.socialBloom;
    if (!bloom || seenSocialBloom.current.has(bloom.releaseId)) return;
    seenSocialBloom.current.add(bloom.releaseId);
    while (seenSocialBloom.current.size > 32) seenSocialBloom.current.delete(seenSocialBloom.current.values().next().value!);
    if (socialFlush.current !== null) window.clearTimeout(socialFlush.current);
    socialFlush.current = null;
    queuedSocial.current = {reactions: 0, signals: 0, names: new Set<string>()};
    const parts = [
      bloom.totalReactions ? `${bloom.totalReactions} ${bloom.totalReactions === 1 ? 'reaction' : 'reactions'}` : '',
      bloom.totalSignals ? `${bloom.totalSignals} ${bloom.totalSignals === 1 ? 'signal' : 'signals'}` : '',
    ].filter(Boolean).join(' and ');
    setSocialTreatment({id: Date.now(), text: `The room released ${parts} for the Porch.`, glyph: '✦'});
    void audio.playSocialCue();
    if (socialClear.current !== null) window.clearTimeout(socialClear.current);
    socialClear.current = window.setTimeout(() => setSocialTreatment(null), 4200);
  }, [audio.playSocialCue, session.socialBloom]);

  useEffect(() => () => {
    if (socialFlush.current !== null) window.clearTimeout(socialFlush.current);
    if (socialClear.current !== null) window.clearTimeout(socialClear.current);
  }, []);

  useEffect(() => {
    if (!activeSurface) return;
    window.requestAnimationFrame(() => document.getElementById(`surface-${activeSurface}`)?.focus());
  }, [activeSurface]);

  const openSurface = (surface: Surface, trigger: HTMLButtonElement) => {
    surfaceTrigger.current = trigger;
    setActiveSurface(surface);
  };
  const closeSurface = () => {
    setActiveSurface(null);
    window.requestAnimationFrame(() => surfaceTrigger.current?.focus());
  };

  const copyInvite = async (rotate = false, role: 'steward' | 'member' | 'guest' = 'member') => {
    setInvitationBusy(rotate ? 'rotating' : 'copying');
    try {
      const url = new URL(window.location.href);
      url.hash = '';
      if (legacyAccess) {
        const payload = url.toString();
        setInvitationPayload(payload);
        try {
          await navigator.clipboard.writeText(payload);
          setCopied(true);
        } catch {
          setCopied(false);
        }
      } else {
        const capability = await session.createInvitation(role, rotate);
        if (!capability) return false;
        const payload = `Join my Magma room as ${role}:\n${url.toString()}\n\nInvitation code:\n${capability}`;
        setInvitationPayload(payload);
        try {
          await navigator.clipboard.writeText(payload);
          setCopied(true);
        } catch {
          setCopied(false);
        }
      }
      window.setTimeout(() => setCopied(false), 1400);
      return true;
    } finally {
      setInvitationBusy(null);
    }
  };
  const copyPreparedInvitation = async () => {
    if (!invitationPayload) return;
    try {
      await navigator.clipboard.writeText(invitationPayload);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    } catch {
      // The selectable text remains available when clipboard policy denies the write.
    }
  };
  const promotePorchMessage = (message: PorchMessage) => {
    store.setRow('sparks', `porch-${message.id}`, {
      text: message.text,
      authorId: message.authorId,
      authorName: message.authorName,
      emoji: message.authorEmoji,
      createdAt: message.createdAt,
      pinned: false,
    });
  };
  const actionLabel = session.timer.status === 'running' ? 'Pause' : session.timer.status === 'paused' ? 'Resume' : 'Start';
  const stateCopy = session.timer.status === 'running'
    ? 'the room is in flow'
    : session.isHost ? 'you hold the room tempo' : `${session.participants.find((person) => person.memberId === session.hostId)?.name ?? 'the host'} holds the tempo`;
  const surfaceLabel: Record<Surface, string> = {workspace: 'Workspace', environment: 'Environment', tempo: 'Tempo', room: 'Room'};
  const surfaceButtons: Array<{id: Surface | null; label: string; icon: React.ReactNode}> = [
    {id: null, label: 'Focus', icon: <Timer size={18} />},
    {id: 'workspace', label: 'Workspace', icon: <ListTodo size={18} />},
    {id: 'environment', label: 'Environment', icon: <SlidersHorizontal size={18} />},
    {id: 'tempo', label: 'Tempo', icon: <Settings size={18} />},
    {id: 'room', label: 'Room', icon: <Users size={18} />},
  ];
  const arrivalState: ArrivalState = access.session.kind === 'checking'
    ? {kind: 'proving', roomName: room}
    : access.session.kind === 'create'
      ? {kind: 'creating', step: 'form', submitting: access.session.busy, initialDisplayName: session.profile.name, initialEmoji: session.profile.emoji, error: access.session.error}
      : access.session.kind === 'invitation'
        ? {kind: 'invited', roomName: 'this Magma room', role: 'member', phase: 'unknown', invitationRequired: true, displayName: session.profile.name, emoji: session.profile.emoji, entering: access.session.busy, error: access.session.error}
        : access.session.kind === 'revoked'
          ? {kind: 'revoked', roomName: 'this Magma room'}
          : access.session.kind === 'denied'
            ? {kind: 'denied', reason: 'unknown', retryable: access.session.retryable}
            : access.session.kind === 'admitted' && !session.connected
              ? {kind: 'reconnecting', roomName: 'this Magma room'}
              : access.session.kind === 'admitted' && justCreated
                ? {kind: 'creating', step: 'ready', roomName: 'Private focus room', copying: invitationBusy === 'copying', copied, invitationPayload}
              : {kind: 'admitted', roomName: room, role: access.session.kind === 'admitted' ? access.session.admission.role : 'member'};

  return (
    <>
    <main ref={instrumentRef} data-arrival-background className={`instrument-shell ${backdrop.reducedSensory ? 'reduced-sensory' : ''} ${playerMode ? 'player-mode' : ''}`}>
      <section className="media-stage" aria-label="Living view">
        <YouTubeBackdrop enabled={session.mediaReady && backdrop.enabled && !backdrop.reducedSensory} embedUrl={backdrop.embedUrl} title={backdrop.source.label} media={session.media} roomNow={session.roomNow} onCommand={session.mediaCommand} canShare={canSteerMedia} muted={backdrop.muted} />
        {(!backdrop.enabled || backdrop.reducedSensory) && <div className="quiet-field">{!backdrop.reducedSensory && <LavaShader energy={session.timer.status === 'running' ? 1 : 0.3} presence={session.participants.length} pulse={pulse} phase={session.timer.mode === 'focus' ? 0 : 1} />}<span>{backdrop.reducedSensory ? 'Quiet field' : 'Lava field'}</span></div>}
      </section>

      {playerMode && <button className="player-mode-exit" onClick={() => setPlayerMode(false)}><Minimize2 size={15} /> Return to instrument</button>}

      <aside className="instrument-rail" aria-label="Magma focus instrument">
        <header className="instrument-header">
          <a className="brand" href="/" aria-label="Magma home"><Flame size={17} fill="currentColor" /><h1>magma</h1></a>
          <div className="header-actions"><button className="camera-control" onClick={() => setPlayerMode(true)}><Maximize2 size={13} /> Camera controls</button><button className="room-locus" aria-label={session.connected ? `Open Room, ${peopleInRoom} ${peopleInRoom === 1 ? 'person' : 'people'} in room` : 'Open Room, reconnecting'} onClick={(event) => openSurface('room', event.currentTarget)}><span className={`status-dot ${session.connected ? 'online' : ''}`} aria-hidden="true" /><span className="room-presence-symbols" aria-hidden="true">{presenceSymbols || 'Room'}</span><small>{peopleInRoom} in room</small></button></div>
        </header>

        <div className="clock-strip" aria-label="Shared clock summary">
          <button className="clock-summary" onClick={() => setActiveSurface(null)}><span>{MODES.find((mode) => mode.id === session.timer.mode)?.label}</span><strong>{formatRemaining(milliseconds)}</strong></button>
          <button className="clock-transport" onClick={() => session.command({type: session.timer.status === 'running' ? 'pause' : 'start'})} aria-label={session.timer.status === 'running' ? 'Pause clock' : 'Start clock'}>{session.timer.status === 'running' ? <Pause size={14} fill="currentColor" /> : <Play size={14} fill="currentColor" />}</button>
        </div>

        {session.timer.focusCount > 0 && (salonPhase === 'returning' || salonPhase === 'gathering') && session.connected && <section className={`return-band ${salonPhase}`} aria-label="Return to the Floor">
          <div className="return-copy"><span>{salonPhase === 'returning' ? 'Return approaching' : 'The room is gathering'}</span><strong>{salonPhase === 'returning' ? `${formatRemaining(milliseconds)} until the next Block` : `${readyCount} ${readyCount === 1 ? 'person is' : 'people are'} ready`}</strong></div>
          <div className="return-presence" aria-label="Your return posture"><button aria-label="Join the next Block" aria-pressed={selfPresence === 'ready'} onClick={() => session.setPresence('ready')}>Ready</button><button aria-label="Remain on the Porch" aria-pressed={selfPresence === 'here'} onClick={() => session.setPresence('here')}>Stay on Porch</button><button aria-label="Pause my presence" aria-pressed={selfPresence === 'away'} onClick={() => session.setPresence('away')}>Away</button></div>
          {salonPhase === 'gathering' && <button className="return-start" onClick={() => session.command({type: 'start'})}>{session.isHost ? 'Start next Block' : 'Ask to start next Block'}</button>}
        </section>}

        <div className="surface-stack">
          <section className="focus-console" hidden={activeSurface !== null} aria-label="Focus timer">
            {(session.completion || reviewArtifact) ? <CompletionRitual artifact={(session.completion || reviewArtifact)!} decision={ritual.decisions[(session.completion || reviewArtifact)!.id]} onDecide={(decision) => { const artifact = (session.completion || reviewArtifact)!; ritual.decide(artifact.id, decision); if (session.completion?.id === artifact.id) ritual.clearAim(); void audio.playCue(decision === 'counted' ? 'smallWin' : 'reset'); }} onClose={() => { if (session.completion?.mode === 'focus') ritual.clearAim(); session.dismissCompletion(); setReviewArtifact(null); }} /> : <>
              <p className="surface-kicker"><Sparkles size={13} /> {stateCopy}</p>
              {session.proposal && <div className="proposal"><span><Crown size={14} /> {session.proposal.fromName} asks to {session.proposal.command.type === 'mode' ? `switch to ${session.proposal.command.mode}` : session.proposal.command.type}</span>{session.isHost ? <div><button onClick={() => session.approve(session.proposal!.id)}>Allow</button><button onClick={() => session.dismiss(session.proposal!.id)}>Not now</button></div> : <small>Waiting for the host</small>}</div>}
              {session.connected && session.participants.length > 0 && session.timer.mode === 'focus' && session.timer.status !== 'running' && <BlockAim ritual={ritual} sessionId={session.timer.sessionId} />}
              {session.timer.status === 'running' && ritual.finishLine && <div className="held-aim"><span>Finish line</span><strong>{ritual.finishLine}</strong></div>}
              <div className="timer-wrap"><div className="orbit" style={{'--progress': `${Math.max(0, Math.min(1, progress)) * 360}deg`} as React.CSSProperties} /><div className="timer" role="timer" aria-live="off">{formatRemaining(milliseconds)}</div></div>
              <div className="timer-meta"><span>{MODES.find((mode) => mode.id === session.timer.mode)?.label}</span><span>{session.timer.focusCount % 4 + 1} of 4</span></div>
              <div className="timer-actions"><button className="primary" onClick={() => session.command({type: session.timer.status === 'running' ? 'pause' : 'start'})}>{session.timer.status === 'running' ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" />}{session.isHost ? `${actionLabel} together` : `Ask to ${actionLabel.toLowerCase()}`}</button><button className="secondary-action" onClick={() => session.command({type: 'reset'})} aria-label={session.isHost ? 'Reset timer' : 'Ask host to reset timer'}><RotateCcw size={17} /></button></div>
              {session.artifacts[0] && <button className="last-ember" onClick={() => setReviewArtifact(session.artifacts[0])}><Flame size={13} fill="currentColor" /> Last ember · {Math.round(session.artifacts[0].durationMs / 60_000)}m</button>}
            </>}
          </section>

          <section className="tool-surface" hidden={activeSurface !== 'workspace'} aria-labelledby="surface-workspace"><div className="surface-header"><div><p>Shared surface</p><h2 id="surface-workspace" tabIndex={-1}>Workspace</h2></div><button className="icon-button" onClick={closeSurface} aria-label="Close Workspace"><X size={18} /></button></div><Workspace profile={session.profile} participants={session.participants} writable={session.workspaceWritable} /></section>
          <section className="tool-surface" hidden={activeSurface !== 'environment'} aria-labelledby="surface-environment"><div className="surface-header"><div><p>Room + personal</p><h2 id="surface-environment" tabIndex={-1}>Environment</h2></div><button className="icon-button" onClick={closeSurface} aria-label="Close Environment"><X size={18} /></button></div><EnvironmentLab backdrop={backdrop} audio={audio} sendSignal={session.signal} queue={session.mediaQueue} role={session.role} memberId={session.profile.memberId} floor={isFloor(session.timer)} addSource={session.enqueueMedia} moveItem={session.moveMedia} removeItem={session.removeMedia} selectItem={session.selectMedia} setPolicy={session.setDeckPolicy} /></section>
          <section className="tool-surface" hidden={activeSurface !== 'tempo'} aria-labelledby="surface-tempo"><div className="surface-header"><div><p>Room authority</p><h2 id="surface-tempo" tabIndex={-1}>Tempo</h2></div><button className="icon-button" onClick={closeSurface} aria-label="Close Tempo"><X size={18} /></button></div>
            <div className="mode-switcher">{MODES.map((mode) => <button aria-pressed={session.timer.mode === mode.id} className={session.timer.mode === mode.id ? 'active' : ''} key={mode.id} onClick={() => session.command({type: 'mode', mode: mode.id})}>{mode.label}</button>)}</div>
            <div className="timer-settings"><label>Focus <span><input type="number" min="0.5" max="120" step="0.5" defaultValue={session.timer.durations.focus / 60_000} id="focus-duration" /> min</span></label><label>Short break <span><input type="number" min="0.5" max="120" step="0.5" defaultValue={session.timer.durations.shortBreak / 60_000} id="short-duration" /> min</span></label><label>Long break <span><input type="number" min="0.5" max="120" step="0.5" defaultValue={session.timer.durations.longBreak / 60_000} id="long-duration" /> min</span></label><label className="auto-setting"><input type="checkbox" defaultChecked={session.timer.autoAdvance} id="auto-advance" /> Auto-start breaks</label><button disabled={!session.isHost} onClick={() => { const get = (id: string) => Number((document.getElementById(id) as HTMLInputElement).value) * 60_000; session.updateSettings({focus: get('focus-duration'), shortBreak: get('short-duration'), longBreak: get('long-duration')}, (document.getElementById('auto-advance') as HTMLInputElement).checked); }}>{session.isHost ? 'Set room cadence' : 'Host controls cadence'}</button></div>
            <button className="text-action" onClick={assist.requestNotifications}>{assist.notifications ? <Bell size={14} /> : <BellOff size={14} />}{assist.notifications ? 'Completion alerts on' : 'Enable completion alerts'}</button>
          </section>
          <section className="tool-surface" hidden={activeSurface !== 'room'} aria-labelledby="surface-room"><div className="surface-header"><div><p>{legacyAccess ? 'Legacy open room' : 'Private room'}</p><h2 id="surface-room" tabIndex={-1}>Room</h2></div><button className="icon-button" onClick={closeSurface} aria-label="Close Room"><X size={18} /></button></div>
            <div className="room-editor"><span className={`status-dot ${session.connected ? 'online' : ''}`} /><strong>{legacyAccess ? 'Open by link' : 'Invitation only'}</strong>{(legacyAccess || ['owner', 'steward'].includes(session.role)) && <button onClick={() => { void copyInvite(); }}>{copied ? <Check size={14} /> : <Copy size={14} />}{copied ? 'Copied' : legacyAccess ? 'Copy link' : 'Create invite'}</button>}</div>
            <People participants={session.participants} profile={session.profile} timer={session.timer} hostId={session.hostId} isHost={session.isHost} editProfile={() => setEditingProfile(true)} transferHost={session.transferHost} setPresence={session.setPresence} viewerRole={session.role} revokeMember={legacyAccess ? undefined : session.revokeMember} />
            {editingProfile && <div className="profile-card"><ProfileEditor profile={session.profile} onChange={session.updateProfile} onClose={() => setEditingProfile(false)} /></div>}
            <Porch messages={session.porchMessages} floor={isFloor(session.timer)} connected={session.connected} release={session.socialRelease} onSend={session.sendPorchMessage} onPromote={session.workspaceWritable ? promotePorchMessage : undefined} />
            <div className="reactions" aria-label="Send a reaction">{[['🔥','fire'], ['✨','sparkles'], ['🫡','salute'], ['💧','water']].map(([emoji, name]) => <button aria-label={`Send ${name} reaction`} key={emoji} onClick={() => session.react(emoji)}>{emoji}</button>)}</div>
            <small className="reaction-policy">{isFloor(session.timer) ? 'Reactions rest until the Porch opens.' : 'Reactions appear now.'}</small>
            {!legacyAccess && protectedAccess && <RoomAccess role={protectedAccess.admission.role} busy={invitationBusy} copied={copied} onCopyInvitation={(role) => copyInvite(false, role)} onRotateInvitation={(role) => copyInvite(true, role)} />}
            {invitationPayload && <section className="invitation-ready" aria-label="Prepared invitation"><label>Invitation ready<textarea readOnly value={invitationPayload} onFocus={(event) => event.currentTarget.select()} /></label><button type="button" onClick={() => { void copyPreparedInvitation(); }}>{copied ? <Check size={14} /> : <Copy size={14} />}{copied ? 'Copied' : 'Copy invitation'}</button><small>The room address and invitation code stay separate. Share both privately.</small></section>}
            <p className="surface-note">{legacyAccess ? 'This older room remains open to anyone with its link. Make a new room for signed, revocable access.' : 'Profiles are editable; room membership is bound to this device’s private key.'}</p>
          </section>
        </div>

        <nav className="tool-dock" aria-label="Instrument surfaces">{surfaceButtons.map((surface) => <button key={surface.label} aria-label={surface.label} aria-pressed={activeSurface === surface.id} className={activeSurface === surface.id ? 'active' : ''} onClick={(event) => surface.id ? openSurface(surface.id, event.currentTarget) : setActiveSurface(null)}>{surface.icon}<span>{surface.label}</span></button>)}</nav>
        <div className="instrument-status"><span>{session.connected ? 'synced' : 'reconnecting'}</span><span>{activeSurface ? surfaceLabel[activeSurface] : session.isHost ? 'you are host' : 'hosted tempo'}</span></div>
      </aside>

      {socialTreatment && <><div className="social-announcement" role="status" aria-live="polite" aria-atomic="true">{socialTreatment.text}</div><div className="social-bloom-visual" key={socialTreatment.id} aria-hidden="true"><span>{socialTreatment.glyph}</span></div></>}
      <div className="room-live" aria-live="polite">{session.notice}</div>
    </main>
    <ArrivalVeil
      state={arrivalState}
      backgroundRef={instrumentRef}
      onCreate={async (input) => {
        session.updateProfile({name: input.displayName, emoji: input.emoji});
        if (input.setup === 'quiet') applyQuietBoundary();
        if (await access.create({...session.profile, name: input.displayName, emoji: input.emoji})) setJustCreated(true);
      }}
      onCopyInvitation={() => invitationPayload ? copyPreparedInvitation() : copyInvite()}
      onEnterCreatedRoom={() => setJustCreated(false)}
      onEnter={(input) => {
        session.updateProfile({name: input.displayName, emoji: input.emoji});
        if (input.setup === 'quiet') applyQuietBoundary();
        void access.enter({...session.profile, name: input.displayName, emoji: input.emoji}, input.invitationCode ?? '');
      }}
      onRetry={() => { void access.retry(); }}
      onReturnHome={() => window.location.assign(window.location.pathname)}
      onLeaveRoom={() => window.location.assign(window.location.pathname)}
    />
    </>
  );
}

export default App;
