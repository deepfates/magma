import {lazy, Suspense, useEffect, useRef, useState} from 'react';
import {Check, Copy, Eye, EyeOff, Hand, Map, MessageCircle, Pause, PenLine, Play, Plus, Radio, RotateCcw, StickyNote, Users, Volume2, VolumeX, X} from 'lucide-react';
import {LavaShader} from './LavaShader';
import {YouTubeBackdrop} from './YouTubeBackdrop';
import {ArrivalVeil, type ArrivalState} from './ArrivalVeil';
import {Porch} from './Porch';
import type {PorchTool} from './PorchCanvas';
import {parseYouTubeSource, SCENE_PRESETS} from './domain/youtube';
import {formatRemaining} from './domain/timer';
import {useAmbientAudio} from './useAmbientAudio';
import {useRoom} from './useRoom';
import {useRoomAccess} from './useRoomAccess';
import {useYouTubeBackdrop} from './useYouTubeBackdrop';

const PorchCanvas = lazy(() => import('./PorchCanvas').then((module) => ({default: module.PorchCanvas})));

const roomFromUrl = () => {
  const room = new URLSearchParams(window.location.search).get('room');
  if (room) return room.toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 64) || 'front-porch';
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

export default function App() {
  const [room] = useState(roomFromUrl);
  const access = useRoomAccess(room);
  const protectedAccess = access.session.kind === 'admitted' ? access.session : null;
  const legacyAccess = access.session.kind === 'legacy';
  const session = useRoom(room, legacyAccess ? undefined : protectedAccess?.admission ?? null, protectedAccess?.refreshAdmission);
  const remaining = useClock(session.remaining);
  const backdrop = useYouTubeBackdrop(session.media.source, session.connected);
  const audio = useAmbientAudio();
  const backgroundRef = useRef<HTMLElement | null>(null);
  const [tool, setTool] = useState<PorchTool>('select');
  const [glassVisible, setGlassVisible] = useState(true);
  const [tunerOpen, setTunerOpen] = useState(false);
  const [peopleOpen, setPeopleOpen] = useState(false);
  const [draftSource, setDraftSource] = useState('');
  const [sourceStatus, setSourceStatus] = useState('');
  const [justCreated, setJustCreated] = useState(false);
  const [invitationPayload, setInvitationPayload] = useState('');
  const [copied, setCopied] = useState(false);

  const share = async () => {
    const url = new URL(window.location.href);
    url.hash = '';
    const capability = legacyAccess ? null : await session.createInvitation('member', false);
    const payload = capability ? `Come sit on the Porch:\n${url.toString()}\n\nCode:\n${capability}` : url.toString();
    setInvitationPayload(payload);
    try { await navigator.clipboard.writeText(payload); setCopied(true); window.setTimeout(() => setCopied(false), 1400); } catch { setCopied(false); }
  };
  const useSource = (source: (typeof SCENE_PRESETS)[number]) => {
    session.enqueueMedia(source, true);
    backdrop.setEnabled(true);
    backdrop.setReducedSensory(false);
    setSourceStatus(`${source.label.replace(' · live', '')} is now in the window.`);
  };
  const addSource = () => {
    const source = parseYouTubeSource(draftSource);
    if (!source) { setSourceStatus('Paste a YouTube video or playlist link.'); return; }
    session.enqueueMedia(source, true);
    backdrop.setEnabled(true);
    backdrop.setReducedSensory(false);
    setDraftSource('');
    setSourceStatus('The window changed for everyone.');
  };
  const quiet = () => {
    backdrop.setEnabled(false);
    backdrop.setReducedSensory(true);
    audio.silence();
  };
  const arrivalState: ArrivalState = access.session.kind === 'checking'
    ? {kind: 'proving', roomName: room}
    : access.session.kind === 'create'
      ? {kind: 'creating', step: 'form', submitting: access.session.busy, initialDisplayName: session.profile.name, initialEmoji: session.profile.emoji, error: access.session.error}
      : access.session.kind === 'invitation'
        ? {kind: 'invited', roomName: 'this Porch', role: 'member', phase: 'unknown', invitationRequired: true, displayName: session.profile.name, emoji: session.profile.emoji, entering: access.session.busy, error: access.session.error}
        : access.session.kind === 'revoked'
          ? {kind: 'revoked', roomName: 'this Porch'}
          : access.session.kind === 'denied'
            ? {kind: 'denied', reason: 'unknown', retryable: access.session.retryable}
            : access.session.kind === 'admitted' && !session.connected
              ? {kind: 'reconnecting', roomName: 'this Porch'}
              : access.session.kind === 'admitted' && justCreated
                ? {kind: 'creating', step: 'ready', roomName: 'Your porch', copying: false, copied, invitationPayload}
                : {kind: 'admitted', roomName: room, role: 'member'};
  const porchAdmitted = legacyAccess || access.session.kind === 'admitted';

  return <>
    <main className={`porch-shell ${backdrop.reducedSensory ? 'reduced-sensory' : ''}`} ref={backgroundRef} data-arrival-background>
      <section className="porch-world" aria-label="The shared window">
        <YouTubeBackdrop enabled={session.mediaReady && backdrop.enabled && !backdrop.reducedSensory} embedUrl={backdrop.embedUrl} title={backdrop.source.label} media={session.media} roomNow={session.roomNow} onCommand={session.mediaCommand} canShare={session.connected} muted={backdrop.muted} />
        {(!backdrop.enabled || backdrop.reducedSensory) && <div className="porch-glow">{!backdrop.reducedSensory && <LavaShader energy={session.timer.status === 'running' ? 0.8 : 0.25} presence={session.participants.length} pulse={0} phase={0} />}<span>{backdrop.reducedSensory ? 'Quiet' : 'Glow'}</span></div>}
      </section>

      {porchAdmitted && <Suspense fallback={<div className="porch-canvas-status">Opening the glass…</div>}>
        <PorchCanvas room={room} profile={session.profile} refreshAdmission={protectedAccess?.refreshAdmission} glassVisible={glassVisible} tool={tool} />
      </Suspense>}
      <section className="porch-fixed-clock" aria-label="Shared clock">
        <small>shared clock</small><strong>{formatRemaining(remaining)}</strong>
        <div><button onClick={() => session.command({type: session.timer.status === 'running' ? 'pause' : 'start'})}>{session.timer.status === 'running' ? <Pause size={14} fill="currentColor" /> : <Play size={14} fill="currentColor" />}{session.timer.status === 'running' ? 'Pause' : 'Start'}</button><button onClick={() => session.command({type: 'reset'})} aria-label="Reset shared clock"><RotateCcw size={14} /></button></div>
      </section>

      <header className="porch-header">
        <button className="porch-place" onClick={() => setTunerOpen((open) => !open)} aria-expanded={tunerOpen}>
          <span className="porch-mark">P</span><span><strong>The Porch</strong><small>{backdrop.enabled && !backdrop.reducedSensory ? backdrop.source.label.replace(' · live', '') : backdrop.reducedSensory ? 'Quiet window' : 'Glow window'} · change the view</small></span>
        </button>
        <div className="porch-company">
          <button aria-label={glassVisible ? 'Glass on' : 'Glass off'} onClick={() => setGlassVisible((visible) => !visible)} aria-pressed={glassVisible}>{glassVisible ? <Eye size={16} /> : <EyeOff size={16} />}<span>{glassVisible ? 'Glass on' : 'Glass off'}</span></button>
          <button aria-label={`${session.participants.length || 0} here`} onClick={() => setPeopleOpen((open) => !open)} aria-expanded={peopleOpen}><Users size={16} /><span>{session.participants.length || '—'} here</span></button>
          <button aria-label={copied ? 'Invitation copied' : 'Invite'} className="invite-button" onClick={() => void share()}>{copied ? <Check size={15} /> : <Copy size={15} />}<span>{copied ? 'Copied' : 'Invite'}</span></button>
        </div>
      </header>

      {tunerOpen && <section className="porch-tuner" aria-label="Change the shared view">
        <div className="tuner-heading"><div><small>THE WINDOW</small><h2>Where should we look?</h2></div><button onClick={() => setTunerOpen(false)} aria-label="Close the tuner"><X size={18} /></button></div>
        <div className="tuner-shelf">
          {SCENE_PRESETS.map((source) => <button key={source.id} className={session.media.source.id === source.id && backdrop.enabled ? 'active' : ''} onClick={() => useSource(source)}><span style={{background: source.accent}}><Map size={17} /></span><strong>{source.label.replace(' · live', '')}</strong><small>{source.description}</small></button>)}
          <button className={!backdrop.enabled && !backdrop.reducedSensory ? 'active' : ''} onClick={() => { backdrop.setEnabled(false); backdrop.setReducedSensory(false); }}><span className="glow-chip"><Radio size={17} /></span><strong>Glow</strong><small>A slow light of our own</small></button>
          <button className={backdrop.reducedSensory ? 'active' : ''} onClick={quiet}><span className="quiet-chip"><EyeOff size={17} /></span><strong>Quiet</strong><small>Nothing moving behind the glass</small></button>
        </div>
        <div className="tuner-compose"><input value={draftSource} onChange={(event) => setDraftSource(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && addSource()} placeholder="Paste a YouTube video, live feed, or playlist" /><button onClick={addSource}><Plus size={15} /> Add</button></div>
        <div className="tuner-local"><button onClick={() => backdrop.setMuted(!backdrop.muted)}>{backdrop.muted ? <VolumeX size={15} /> : <Volume2 size={15} />}{backdrop.muted ? 'Unmute for me' : 'Mute for me'}</button><button onClick={() => void audio.toggle()}>{audio.enabled ? <Volume2 size={15} /> : <VolumeX size={15} />}{audio.enabled ? 'Warm sound on' : 'Warm sound off'}</button><small>{sourceStatus}</small></div>
      </section>}

      {peopleOpen && <aside className="porch-sidecar" aria-label="People and conversation">
        <div className="sidecar-heading"><div><small>ON THE PORCH</small><h2>{session.participants.length} {session.participants.length === 1 ? 'person' : 'people'}</h2></div><button onClick={() => setPeopleOpen(false)} aria-label="Close people"><X size={18} /></button></div>
        <div className="porch-people">{session.participants.map((person) => <div key={person.memberId}><span style={{'--person-color': person.color} as React.CSSProperties}>{person.emoji}</span><p><strong>{person.name}{person.memberId === session.profile.memberId ? ' · you' : ''}</strong><small>{person.intention || 'here now'}</small></p></div>)}</div>
        <Porch messages={session.porchMessages} floor={false} connected={session.connected} release={session.socialRelease} onSend={session.sendPorchMessage} />
        {invitationPayload && <label className="porch-share-copy">Invite<textarea readOnly value={invitationPayload} onFocus={(event) => event.currentTarget.select()} /></label>}
      </aside>}

      <nav className="porch-tools" aria-label="Things to use on the porch">
        {([{id: 'select', label: 'Move', icon: <Hand size={19} />}, {id: 'draw', label: 'Draw', icon: <PenLine size={19} />}, {id: 'note', label: 'Note', icon: <StickyNote size={19} />} ] as const).map((item) => <button key={item.id} className={tool === item.id ? 'active' : ''} aria-pressed={tool === item.id} onClick={() => setTool(item.id)}>{item.icon}<span>{item.label}</span></button>)}
        <button onClick={() => setPeopleOpen(true)}><MessageCircle size={19} /><span>Talk</span></button>
      </nav>
      <div className="porch-connection"><span className={session.connected ? 'online' : ''} />{session.connected ? 'together' : 'reconnecting'}</div>
      <div className="room-live" aria-live="polite">{session.notice}</div>
    </main>
    <ArrivalVeil state={arrivalState} backgroundRef={backgroundRef}
      onCreate={async (input) => { session.updateProfile({name: input.displayName, emoji: input.emoji}); if (input.setup === 'quiet') quiet(); if (await access.create({...session.profile, name: input.displayName, emoji: input.emoji})) setJustCreated(true); }}
      onCopyInvitation={() => void share()} onEnterCreatedRoom={() => setJustCreated(false)}
      onEnter={(input) => { session.updateProfile({name: input.displayName, emoji: input.emoji}); if (input.setup === 'quiet') quiet(); void access.enter({...session.profile, name: input.displayName, emoji: input.emoji}, input.invitationCode ?? ''); }}
      onRetry={() => { void access.retry(); }} onReturnHome={() => window.location.assign(window.location.pathname)} onLeaveRoom={() => window.location.assign(window.location.pathname)} />
  </>;
}
