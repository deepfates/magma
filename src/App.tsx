import {useEffect, useMemo, useState} from 'react';
import {
  Bell, BellOff, Check, Circle, Copy, Crown, Flame, Link2, Pause, Pin, Play, Plus,
  RotateCcw, Settings, Sparkles, StickyNote, Trash2, UserRound, Users, Volume2, VolumeX, X,
} from 'lucide-react';
import {useTable} from 'tinybase/ui-react';
import {LavaShader} from './LavaShader';
import {formatRemaining, type TimerMode} from './domain/timer';
import type {Participant, Profile, SessionArtifact} from './domain/protocol';
import {store} from './store';
import {useAmbientAudio} from './useAmbientAudio';
import {useFocusAssist} from './useFocusAssist';
import {useRoom} from './useRoom';

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
  const generated = `glow-${crypto.randomUUID().replaceAll('-', '')}`;
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

function People({participants, profile, hostId, isHost, editProfile, transferHost}: {
  participants: Participant[]; profile: Profile; hostId: string | null; isHost: boolean;
  editProfile: () => void; transferHost: (memberId: string) => void;
}) {
  return (
    <section className="glass people-card">
      <div className="card-title"><span><Users size={17} /> In the glow</span><small>{participants.length} {participants.length === 1 ? 'person' : 'people'}</small></div>
      <div className="people">
        {participants.map((person) => (
          <div className="person" key={person.memberId}>
            <button className="avatar" style={{'--person-color': person.color} as React.CSSProperties} onClick={person.memberId === profile.memberId ? editProfile : undefined} aria-label={person.memberId === profile.memberId ? 'Edit your profile' : `${person.name} profile`}>{person.emoji}</button>
            <div><strong>{person.name}{person.memberId === profile.memberId ? ' · you' : ''}</strong><small>{person.intention || 'present with the room'}{person.connections > 1 ? ` · ${person.connections} tabs` : ''}</small></div>
            {person.memberId === hostId ? <Crown className="host-crown" size={13} aria-label="Room host" /> : isHost ? <button className="host-transfer" onClick={() => transferHost(person.memberId)} aria-label={`Make ${person.name} host`}><Crown size={12} /></button> : <span className="pulse" />}
          </div>
        ))}
      </div>
    </section>
  );
}

function Tasks({profile, participants}: {profile: Profile; participants: Participant[]}) {
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
              <button className="task-check" onClick={() => store.setRow('tasks', id, {...task, done: !task.done, completedAt: task.done ? 0 : Date.now()})} aria-label={`Mark ${task.text} ${task.done ? 'unfinished' : 'done'}`}>{task.done ? <Check size={14} /> : <Circle size={14} />}</button>
              <div><span>{String(task.text)}</span><small>{owner ? `${owner.emoji} ${owner.name}` : task.ownerName ? String(task.ownerName) : 'unclaimed'}</small></div>
              <button className="claim-button" onClick={() => store.setRow('tasks', id, {...task, ownerId: task.ownerId === profile.memberId ? '' : profile.memberId, ownerName: task.ownerId === profile.memberId ? '' : profile.name})}>{task.ownerId === profile.memberId ? 'Release' : 'Claim'}</button>
              <button className="icon-button danger" onClick={() => store.delRow('tasks', id)} aria-label={`Delete ${task.text}`}><Trash2 size={14} /></button>
            </div>
          );
        })}
      </div>
      <div className="add-task"><input value={draft} maxLength={160} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && add()} placeholder="What are we making real?" /><button onClick={add} aria-label="Add intention"><Plus size={17} /></button></div>
    </div>
  );
}

function Sparks({profile}: {profile: Profile}) {
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
        {ordered.map(([id, spark]) => <div className="spark" key={id}><span>{String(spark.emoji)}</span><div><p>{String(spark.text)}</p><small>{String(spark.authorName)}</small></div><button className="icon-button" onClick={() => store.setCell('sparks', id, 'pinned', !spark.pinned)} aria-label={`${spark.pinned ? 'Unpin' : 'Pin'} note`}><Pin size={13} fill={spark.pinned ? 'currentColor' : 'none'} /></button>{spark.authorId === profile.memberId && <button className="icon-button" onClick={() => store.delRow('sparks', id)} aria-label="Delete your note"><Trash2 size={13} /></button>}</div>)}
      </div>
      <div className="add-task"><input value={draft} maxLength={500} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && add()} placeholder="Leave a spark for the room" /><button onClick={add} aria-label="Add room note"><Plus size={17} /></button></div>
    </div>
  );
}

function Workspace({profile, participants}: {profile: Profile; participants: Participant[]}) {
  const [tab, setTab] = useState<'tasks' | 'sparks'>('tasks');
  const tasks = useTable('tasks', store);
  const sparks = useTable('sparks', store);
  return (
    <section className="glass tasks-card">
      <div className="workspace-tabs" role="tablist" aria-label="Room workspace">
        <button role="tab" aria-selected={tab === 'tasks'} className={tab === 'tasks' ? 'active' : ''} onClick={() => setTab('tasks')}><Check size={15} /> Intentions <small>{Object.keys(tasks).length}</small></button>
        <button role="tab" aria-selected={tab === 'sparks'} className={tab === 'sparks' ? 'active' : ''} onClick={() => setTab('sparks')}><StickyNote size={15} /> Sparks <small>{Object.keys(sparks).length}</small></button>
      </div>
      {tab === 'tasks' ? <Tasks profile={profile} participants={participants} /> : <Sparks profile={profile} />}
    </section>
  );
}

function CompletionRitual({artifact, onClose}: {artifact: SessionArtifact; onClose: () => void}) {
  const minutes = Math.round(artifact.durationMs / 60_000);
  return (
    <section className="completion-ritual glass" aria-live="polite">
      <button className="icon-button completion-close" onClick={onClose} aria-label="Close session ember"><X size={16} /></button>
      <div className="ember-mark"><Flame size={28} fill="currentColor" /></div>
      <p className="eyebrow">session ember · {artifact.mode}</p>
      <h2>{minutes} {minutes === 1 ? 'minute' : 'minutes'} held together.</h2>
      <p>{artifact.participants.length ? artifact.participants.map((person) => `${person.emoji} ${person.name}`).join(' · ') : 'The room kept the flame.'}</p>
      <small>{artifact.reactionCount} reactions · focus #{artifact.focusCount}</small>
    </section>
  );
}

function App() {
  const [room] = useState(roomFromUrl);
  const session = useRoom(room);
  const milliseconds = useClock(session.remaining);
  const audio = useAmbientAudio();
  const assist = useFocusAssist(session.timer.status === 'running', session.completion, audio.playChime);
  const [copied, setCopied] = useState(false);
  const [roomDraft, setRoomDraft] = useState(room);
  const [editingProfile, setEditingProfile] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [pulse, setPulse] = useState(0);
  const [reviewArtifact, setReviewArtifact] = useState<SessionArtifact | null>(null);
  const progress = 1 - milliseconds / session.timer.durationMs;

  useEffect(() => {
    if (!session.completion) return;
    setPulse(1);
    const timeout = window.setTimeout(() => setPulse(0), 2800);
    return () => window.clearTimeout(timeout);
  }, [session.completion]);

  const copyInvite = async () => {
    await navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
  };
  const joinRoom = () => {
    const next = roomDraft.toLowerCase().trim().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').slice(0, 64);
    if (!next || next === room) return;
    const url = new URL(window.location.href);
    url.searchParams.set('room', next);
    window.location.assign(url);
  };
  const actionLabel = session.timer.status === 'running' ? 'Pause' : session.timer.status === 'paused' ? 'Resume' : 'Start';

  return (
    <main>
      <LavaShader energy={session.timer.status === 'running' ? 1 : 0.3} presence={session.participants.length} pulse={pulse} phase={session.timer.mode === 'focus' ? 0 : 1} />
      <div className="grain" aria-hidden="true" />
      <header>
        <a className="brand" href="/" aria-label="Magma home"><span className="brand-mark"><Flame size={19} fill="currentColor" /></span><strong>magma</strong><i>focus together</i></a>
        <div className="room-bar glass"><span className={`status-dot ${session.connected ? 'online' : ''}`} /><input aria-label="Room name" value={roomDraft} onChange={(event) => setRoomDraft(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && joinRoom()} /><button className="icon-button" onClick={joinRoom} aria-label="Join room"><Link2 size={15} /></button><button className="invite" onClick={copyInvite}>{copied ? <Check size={15} /> : <Copy size={15} />}{copied ? 'Copied' : 'Invite'}</button></div>
      </header>

      <div className="layout">
        <aside className="left-rail" aria-label="People and reactions">
          <People participants={session.participants} profile={session.profile} hostId={session.hostId} isHost={session.isHost} editProfile={() => setEditingProfile(true)} transferHost={session.transferHost} />
          {editingProfile && <section className="glass profile-card"><ProfileEditor profile={session.profile} onChange={session.updateProfile} onClose={() => setEditingProfile(false)} /></section>}
          <div className="reactions glass" aria-label="Send a reaction">{[['🔥','fire'], ['✨','sparkles'], ['🫡','salute'], ['💧','water']].map(([emoji, name]) => <button aria-label={`Send ${name} reaction`} key={emoji} onClick={() => session.react(emoji)}>{emoji}</button>)}</div>
        </aside>

        <section className="timer-stage">
          {(session.completion || reviewArtifact) && <CompletionRitual artifact={(session.completion || reviewArtifact)!} onClose={() => { session.dismissCompletion(); setReviewArtifact(null); }} />}
          <p className="eyebrow"><Sparkles size={14} /> {session.timer.status === 'running' ? 'the room is in flow' : session.isHost ? 'you hold the room tempo' : `${session.participants.find((person) => person.memberId === session.hostId)?.name ?? 'the host'} holds the tempo`}</p>
          {session.proposal && <div className="proposal glass"><span><Crown size={14} /> {session.proposal.fromName} asks to {session.proposal.command.type === 'mode' ? `switch to ${session.proposal.command.mode}` : session.proposal.command.type}</span>{session.isHost ? <div><button onClick={() => session.approve(session.proposal!.id)}>Allow</button><button onClick={() => session.dismiss(session.proposal!.id)}>Not now</button></div> : <small>Waiting for the host</small>}</div>}
          <div className="mode-switcher glass">{MODES.map((mode) => <button aria-pressed={session.timer.mode === mode.id} className={session.timer.mode === mode.id ? 'active' : ''} key={mode.id} onClick={() => session.command({type: 'mode', mode: mode.id})}>{mode.label}</button>)}</div>
          <div className="timer-wrap"><div className="orbit" style={{'--progress': `${Math.max(0, Math.min(1, progress)) * 360}deg`} as React.CSSProperties} /><div className="timer" role="timer" aria-live="off">{formatRemaining(milliseconds)}</div></div>
          <p className="focus-copy">One shared clock. Your own way through it.</p>
          <div className="timer-actions"><button className="primary" onClick={() => session.command({type: session.timer.status === 'running' ? 'pause' : 'start'})}>{session.timer.status === 'running' ? <Pause size={19} fill="currentColor" /> : <Play size={19} fill="currentColor" />}{session.isHost ? `${actionLabel} together` : `Ask to ${actionLabel.toLowerCase()}`}</button><button className="round-button" onClick={() => session.command({type: 'reset'})} aria-label={session.isHost ? 'Reset timer' : 'Ask host to reset timer'}><RotateCcw size={18} /></button><button className="round-button" onClick={() => setShowSettings((value) => !value)} aria-label="Timer settings"><Settings size={18} /></button></div>
          <div className="session-dots" role="img" aria-label={`${session.timer.focusCount % 4} of four focus sessions complete`}>{[0,1,2,3].map((index) => <span className={index < session.timer.focusCount % 4 ? 'complete' : index === session.timer.focusCount % 4 ? 'active' : ''} key={index} />)}</div>
          {showSettings && <div className="timer-settings glass"><label>Focus <input type="number" min="0.5" max="120" step="0.5" defaultValue={session.timer.durations.focus / 60_000} id="focus-duration" /> min</label><label>Short <input type="number" min="0.5" max="120" step="0.5" defaultValue={session.timer.durations.shortBreak / 60_000} id="short-duration" /> min</label><label>Long <input type="number" min="0.5" max="120" step="0.5" defaultValue={session.timer.durations.longBreak / 60_000} id="long-duration" /> min</label><label className="auto-setting"><input type="checkbox" defaultChecked={session.timer.autoAdvance} id="auto-advance" /> Auto-start breaks</label><button disabled={!session.isHost} onClick={() => { const get = (id: string) => Number((document.getElementById(id) as HTMLInputElement).value) * 60_000; session.updateSettings({focus: get('focus-duration'), shortBreak: get('short-duration'), longBreak: get('long-duration')}, (document.getElementById('auto-advance') as HTMLInputElement).checked); }}>{session.isHost ? 'Set room cadence' : 'Host controls cadence'}</button></div>}
          {session.artifacts[0] && !session.completion && !reviewArtifact && <button className="last-ember" onClick={() => setReviewArtifact(session.artifacts[0])}><Flame size={13} fill="currentColor" /> Last ember · {Math.round(session.artifacts[0].durationMs / 60_000)}m · {session.artifacts[0].participants.length} together</button>}
        </section>

        <aside className="right-rail" aria-label="Shared workspace and personal ambience">
          <Workspace profile={session.profile} participants={session.participants} />
          <section className="glass sound-card"><div className="card-title"><span><Volume2 size={17} /> Local ambience</span><button className="icon-button" onClick={audio.toggle} aria-label={audio.enabled ? 'Mute warm noise' : 'Play warm noise'}>{audio.enabled ? <Volume2 size={15} /> : <VolumeX size={15} />}</button></div><div className="sound-row"><span>〰️</span><div><strong>Warm noise</strong><small>{audio.enabled ? `${Math.round(audio.volume * 100)}% · only for you` : 'Tap sound to begin'}</small></div><input type="range" min="0" max="100" value={Math.round(audio.volume * 100)} onChange={(event) => audio.setVolume(Number(event.target.value) / 100)} disabled={!audio.enabled} aria-label="Warm noise volume" /></div><button className="notification-toggle" onClick={assist.requestNotifications}>{assist.notifications ? <Bell size={13} /> : <BellOff size={13} />}{assist.notifications ? 'Completion alerts on' : 'Enable completion alerts'}</button></section>
        </aside>
      </div>

      <div className="reaction-burst" aria-live="polite">{session.reactions.map((reaction, index) => <span key={reaction.id} style={{'--offset': `${(index - 3) * 38}px`} as React.CSSProperties} title={`From ${reaction.from}`}>{reaction.emoji}</span>)}</div>
      <div className="room-live" aria-live="polite">{session.notice}</div>
      <footer><span>public room · do not share secrets</span><i>·</i><span>{session.isHost ? 'you are host' : 'hosted tempo'}</span><i>·</i><span>{session.connected ? 'synced' : 'reconnecting'}</span></footer>
    </main>
  );
}

export default App;
