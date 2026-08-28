import {useEffect, useMemo, useState} from 'react';
import {
  Check,
  Circle,
  Copy,
  Flame,
  Link2,
  Pause,
  Play,
  Plus,
  RotateCcw,
  Sparkles,
  Trash2,
  Users,
  Volume2,
  VolumeX,
} from 'lucide-react';
import {useTable} from 'tinybase/ui-react';
import {LavaShader} from './LavaShader';
import {formatRemaining, type TimerMode} from './domain/timer';
import {store} from './store';
import {useRoom} from './useRoom';

const MODES: {id: TimerMode; label: string}[] = [
  {id: 'focus', label: 'Focus'},
  {id: 'shortBreak', label: 'Short break'},
  {id: 'longBreak', label: 'Long break'},
];

const roomFromUrl = () => {
  const room = new URLSearchParams(window.location.search).get('room');
  if (room) return room.toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 40) || 'molten-lobby';
  const generated = `glow-${Math.random().toString(36).slice(2, 7)}`;
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

function Tasks({name}: {name: string}) {
  const tasks = useTable('tasks', store);
  const [draft, setDraft] = useState('');
  const ordered = useMemo(
    () => Object.entries(tasks).sort(([, a], [, b]) => Number(a.createdAt) - Number(b.createdAt)),
    [tasks],
  );

  const add = () => {
    const text = draft.trim();
    if (!text) return;
    store.setRow('tasks', crypto.randomUUID(), {text, done: false, createdAt: Date.now(), createdBy: name});
    setDraft('');
  };

  return (
    <section className="glass tasks-card">
      <div className="card-title"><span><Check size={17} /> Shared intentions</span><small>{ordered.length} in the room</small></div>
      <div className="task-list">
        {ordered.length === 0 && <p className="empty">Drop one small, finishable thing here.</p>}
        {ordered.map(([id, task]) => (
          <div className={`task ${task.done ? 'done' : ''}`} key={id}>
            <button className="task-check" onClick={() => store.setCell('tasks', id, 'done', !task.done)} aria-label={`Mark ${task.text} ${task.done ? 'unfinished' : 'done'}`}>
              {task.done ? <Check size={14} /> : <Circle size={14} />}
            </button>
            <div><span>{String(task.text)}</span><small>{String(task.createdBy)}</small></div>
            <button className="icon-button danger" onClick={() => store.delRow('tasks', id)} aria-label={`Delete ${task.text}`}><Trash2 size={14} /></button>
          </div>
        ))}
      </div>
      <div className="add-task">
        <input value={draft} maxLength={80} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && add()} placeholder="What are we making real?" />
        <button onClick={add} aria-label="Add intention"><Plus size={17} /></button>
      </div>
    </section>
  );
}

function App() {
  const [room] = useState(roomFromUrl);
  const session = useRoom(room);
  const milliseconds = useClock(session.remaining);
  const [copied, setCopied] = useState(false);
  const [sound, setSound] = useState(true);
  const [roomDraft, setRoomDraft] = useState(room);
  const progress = 1 - milliseconds / session.timer.durationMs;

  const copyInvite = async () => {
    await navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
  };

  const joinRoom = () => {
    const next = roomDraft.toLowerCase().trim().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').slice(0, 40);
    if (!next || next === room) return;
    const url = new URL(window.location.href);
    url.searchParams.set('room', next);
    window.location.assign(url);
  };

  return (
    <main>
      <LavaShader energy={session.timer.status === 'running' ? 1 : 0.3} />
      <div className="grain" aria-hidden="true" />
      <header>
        <a className="brand" href="/" aria-label="Magma home"><span className="brand-mark"><Flame size={19} fill="currentColor" /></span><strong>magma</strong><i>focus together</i></a>
        <div className="room-bar glass">
          <span className={`status-dot ${session.connected ? 'online' : ''}`} />
          <input aria-label="Room name" value={roomDraft} onChange={(event) => setRoomDraft(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && joinRoom()} />
          <button className="icon-button" onClick={joinRoom} aria-label="Join room"><Link2 size={15} /></button>
          <button className="invite" onClick={copyInvite}>{copied ? <Check size={15} /> : <Copy size={15} />}{copied ? 'Copied' : 'Invite'}</button>
        </div>
      </header>

      <div className="layout">
        <aside className="left-rail">
          <section className="glass people-card">
            <div className="card-title"><span><Users size={17} /> In the glow</span><small>{session.participants.length} here</small></div>
            <div className="people">
              {session.participants.map((person) => (
                <div className="person" key={person.id}>
                  <span className="avatar" style={{'--person-color': person.color} as React.CSSProperties}>{person.emoji}</span>
                  <div><strong>{person.name}</strong><small>{session.timer.mode === 'focus' && session.timer.status === 'running' ? 'focusing now' : 'hanging out'}</small></div>
                  <span className="pulse" />
                </div>
              ))}
              {!session.connected && <p className="empty">Reaching the room…</p>}
            </div>
          </section>
          <div className="reactions glass" aria-label="Send a reaction">
            {['🔥', '✨', '🫡', '💧'].map((emoji) => <button key={emoji} onClick={() => session.react(emoji)}>{emoji}</button>)}
          </div>
        </aside>

        <section className="timer-stage">
          <p className="eyebrow"><Sparkles size={14} /> {session.timer.status === 'running' ? 'the room is in flow' : 'choose the room tempo'}</p>
          <div className="mode-switcher glass">
            {MODES.map((mode) => <button className={session.timer.mode === mode.id ? 'active' : ''} key={mode.id} onClick={() => session.command({type: 'mode', mode: mode.id})}>{mode.label}</button>)}
          </div>
          <div className="timer-wrap">
            <div className="orbit" style={{'--progress': `${progress * 360}deg`} as React.CSSProperties} />
            <div className="timer" role="timer" aria-live="off">{formatRemaining(milliseconds)}</div>
          </div>
          <p className="focus-copy">One shared clock. Your own way through it.</p>
          <div className="timer-actions">
            <button className="primary" onClick={() => session.command({type: session.timer.status === 'running' ? 'pause' : 'start'})}>
              {session.timer.status === 'running' ? <Pause size={19} fill="currentColor" /> : <Play size={19} fill="currentColor" />}
              {session.timer.status === 'running' ? 'Pause together' : session.timer.status === 'paused' ? 'Resume together' : 'Start together'}
            </button>
            <button className="round-button" onClick={() => session.command({type: 'reset'})} aria-label="Reset timer"><RotateCcw size={18} /></button>
          </div>
          <div className="session-dots" aria-label="Session one of four"><span className="active" /><span /><span /><span /></div>
        </section>

        <aside className="right-rail">
          <Tasks name={session.identity.name} />
          <section className="glass sound-card">
            <div className="card-title"><span><Volume2 size={17} /> Local ambience</span><button className="icon-button" onClick={() => setSound((value) => !value)}>{sound ? <Volume2 size={15} /> : <VolumeX size={15} />}</button></div>
            <div className="sound-row"><span>〰️</span><div><strong>Warm noise</strong><small>Plays only for you</small></div><input type="range" min="0" max="100" defaultValue={sound ? 28 : 0} disabled={!sound} aria-label="Warm noise volume" /></div>
          </section>
        </aside>
      </div>

      <div className="reaction-burst" aria-live="polite">
        {session.reactions.map((reaction, index) => <span key={reaction.id} style={{'--offset': `${(index - 3) * 38}px`} as React.CSSProperties} title={`From ${reaction.from}`}>{reaction.emoji}</span>)}
      </div>

      <footer><span>CRDT workspace</span><i>·</i><span>server-time clock</span><i>·</i><span>{session.connected ? 'synced' : 'offline-ready'}</span></footer>
    </main>
  );
}

export default App;
