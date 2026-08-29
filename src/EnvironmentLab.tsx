import {useState} from 'react';
import {ChevronDown, ChevronUp, Eye, EyeOff, Radio, Trash2, Volume2, VolumeX} from 'lucide-react';
import {parseYouTubeSource, SCENE_PRESETS, type YouTubeSource} from './domain/youtube';
import type {useAmbientAudio} from './useAmbientAudio';
import type {useYouTubeBackdrop} from './useYouTubeBackdrop';
import type {RoomCueId} from './domain/porch';
import {canArrangeQueue, canRemoveQueueItem, type DeckPolicy, type MediaQueueState} from './domain/mediaQueue';
import type {AuthRole} from './domain/auth';

const SOCIAL_SIGNALS: Array<{id: RoomCueId; label: string; symbol: string; meaning: string}> = [
  {id: 'smallWin', label: 'Nice', symbol: '✦', meaning: 'Acknowledge movement'},
  {id: 'breathe', label: 'With you', symbol: '〰', meaning: 'Offer quiet support'},
];

export function EnvironmentLab({
  backdrop, audio, sendSignal, queue, role, memberId, floor, addSource, moveItem, removeItem, selectItem, setPolicy,
}: {
  backdrop: ReturnType<typeof useYouTubeBackdrop>;
  audio: ReturnType<typeof useAmbientAudio>;
  sendSignal: (cueId: RoomCueId) => void;
  queue: MediaQueueState;
  role: AuthRole;
  memberId: string;
  floor: boolean;
  addSource: (source: YouTubeSource, activate?: boolean) => void;
  moveItem: (itemId: string, beforeItemId: string | null) => void;
  removeItem: (itemId: string) => void;
  selectItem: (itemId: string) => void;
  setPolicy: (policy: DeckPolicy) => void;
}) {
  const [draft, setDraft] = useState('');
  const [lastCue, setLastCue] = useState('');
  const [deckStatus, setDeckStatus] = useState('');
  const apply = () => {
    const source = parseYouTubeSource(draft);
    if (!source) {
      setDeckStatus('Paste a YouTube video or playlist link.');
      return;
    }
    addSource(source, false);
    setDraft('');
    setDeckStatus(floor ? 'Saved quietly for the break.' : 'Added to the background queue.');
  };
  const quietEverything = () => {
    backdrop.setEnabled(false);
    backdrop.setReducedSensory(true);
    audio.silence();
  };
  const setWindowOpen = (enabled: boolean) => {
    if (enabled) backdrop.setReducedSensory(false);
    backdrop.setEnabled(enabled);
  };
  const active = queue.items.find((item) => item.id === queue.activeItemId) ?? queue.items[0];
  const canArrange = backdrop.canShare && canArrangeQueue(role, queue.policy);
  const usePreset = (source: YouTubeSource) => {
    addSource(source, canArrange);
    setDeckStatus(canArrange
      ? floor ? `${source.label} is saved for the break.` : `${source.label} is now in the room.`
      : `${source.label} was added for a steward to arrange.`);
  };
  const moveEarlier = (itemId: string) => {
    const index = queue.items.findIndex((item) => item.id === itemId);
    if (index > 0) moveItem(itemId, queue.items[index - 1].id);
  };
  const moveLater = (itemId: string) => {
    const index = queue.items.findIndex((item) => item.id === itemId);
    if (index >= 0 && index < queue.items.length - 1) moveItem(itemId, queue.items[index + 2]?.id ?? null);
  };

  return (
    <div className="environment-lab">
      <div className="surface-section-heading"><strong>On this device</strong><small>These controls never change another person’s setup.</small></div>
      <div className="inline-controls">
        <button aria-pressed={backdrop.enabled && !backdrop.reducedSensory} onClick={() => setWindowOpen(!(backdrop.enabled && !backdrop.reducedSensory))}>{backdrop.enabled && !backdrop.reducedSensory ? <Eye size={14} /> : <EyeOff size={14} />}{backdrop.enabled && !backdrop.reducedSensory ? 'View open' : 'View closed'}</button>
        <button aria-pressed={!backdrop.muted} onClick={() => backdrop.setMuted(!backdrop.muted)}>{backdrop.muted ? <VolumeX size={14} /> : <Volume2 size={14} />}{backdrop.muted ? 'Shared sound muted' : 'Shared sound on'}</button>
        <button className={backdrop.reducedSensory ? 'selected' : ''} onClick={quietEverything}>Quiet everything</button>
      </div>

      <section className="listening-deck" aria-labelledby="listening-deck-title">
        <div className="surface-section-heading"><strong id="listening-deck-title">Background queue</strong><small>{queue.policy === 'open' ? 'Everyone can add and reorder.' : 'Everyone can add; stewards reorder.'}</small></div>
        {active && <article className="deck-now" aria-label="Now in the room"><span><Radio size={12} /> NOW IN THE ROOM</span><strong>{active.source.label}</strong><small>added by {active.addedByEmoji} {active.addedByName}</small></article>}
        {queue.stagedItemId && <p className="deck-staged">Saved for the break · {queue.items.find((item) => item.id === queue.stagedItemId)?.source.label}</p>}
        <ol className="deck-list" aria-label="Background queue order">
          {queue.items.filter((item) => item.id !== queue.activeItemId).map((item) => {
            const index = queue.items.findIndex((candidate) => candidate.id === item.id);
            const removable = backdrop.canShare && canRemoveQueueItem(role, queue.policy, memberId, item);
            return <li key={item.id} className={item.id === queue.stagedItemId ? 'staged' : ''}>
              <div><strong>{item.source.label}</strong><small>{item.addedByEmoji} {item.addedByName}{item.id === queue.stagedItemId ? ' · saved for break' : ''}</small></div>
              {canArrange && <div className="deck-actions">
                <button disabled={index <= 0} onClick={() => moveEarlier(item.id)} aria-label={`Move ${item.source.label} earlier`}><ChevronUp size={14} /></button>
                <button disabled={index >= queue.items.length - 1} onClick={() => moveLater(item.id)} aria-label={`Move ${item.source.label} later`}><ChevronDown size={14} /></button>
                <button onClick={() => { selectItem(item.id); setDeckStatus(floor ? `${item.source.label} is saved for the break.` : `${item.source.label} is now in the room.`); }}>{floor ? 'For break' : 'Use now'}</button>
              </div>}
              {removable && <button className="deck-remove" onClick={() => removeItem(item.id)} aria-label={`Remove ${item.source.label}`}><Trash2 size={13} /></button>}
            </li>;
          })}
        </ol>
        {backdrop.canShare ? <details className="deck-composer"><summary>Add a background</summary>
          <div className="scene-list">
            {SCENE_PRESETS.map((scene) => <button className={backdrop.source.id === scene.id ? 'scene-option selected' : 'scene-option'} key={scene.id} onClick={() => usePreset(scene)}><span><Radio size={12} /> {canArrange ? floor ? 'SAVE FOR BREAK' : 'USE NOW' : 'ADD'}</span><strong>{scene.label.replace(' · live', '')}</strong><small>{scene.description}</small></button>)}
          </div>
          <div className="custom-scene"><input value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && apply()} placeholder="YouTube video or playlist URL" aria-label="YouTube video or playlist URL" /><button onClick={apply}>Add to queue</button></div>
        </details> : <p className="surface-note">{role === 'guest' ? 'Guests can listen without changing the queue.' : 'Reconnect to change the queue.'}</p>}
        {role === 'owner' && <label className="deck-policy">Who can reorder<select value={queue.policy} onChange={(event) => setPolicy(event.target.value as DeckPolicy)}><option value="open">Everyone</option><option value="stewarded">Stewards only</option></select></label>}
        <div className="cue-status" aria-live="polite">{deckStatus}</div>
      </section>

      <div className="surface-section-heading"><strong>Personal sound</strong><small>Local, reversible, and off until chosen.</small></div>
      <div className="inline-controls">
        <button onClick={audio.toggle}>{audio.enabled ? <Volume2 size={14} /> : <VolumeX size={14} />}{audio.enabled ? 'Warm noise on' : 'Warm noise off'}</button>
        <button onClick={() => audio.setCuesEnabled(!audio.cuesEnabled)}>{audio.cuesEnabled ? <Volume2 size={14} /> : <VolumeX size={14} />}{audio.cuesEnabled ? 'Ritual cues on' : 'Ritual cues off'}</button>
        <label>Noise <input type="range" min="0" max="100" value={Math.round(audio.volume * 100)} onChange={(event) => audio.setVolume(Number(event.target.value) / 100)} aria-label="Warm noise volume" /></label>
      </div>

      <div className="surface-section-heading"><strong>Room signals</strong><small>Peer support stays distinct from the room clock. Sound is a separate local opt-in.</small></div>
      <div className="cue-deck">{SOCIAL_SIGNALS.map((cue) => <button key={cue.id} onClick={() => { sendSignal(cue.id); setLastCue(`${cue.label} sent: ${cue.meaning}`); }}><b>{cue.symbol}</b><span><strong>{cue.label}</strong><small>{cue.meaning}</small></span></button>)}</div>
      <div className="inline-controls"><button onClick={() => audio.setSocialCuesEnabled(!audio.socialCuesEnabled)}>{audio.socialCuesEnabled ? <Volume2 size={14} /> : <VolumeX size={14} />}{audio.socialCuesEnabled ? 'Social sounds on' : 'Social sounds off'}</button></div>
      <div className="cue-status" aria-live="polite">{lastCue}</div>

      <div className="surface-section-heading"><strong>Sensory boundary</strong><small>Quiet is a complete setup.</small></div>
      <div className="inline-controls">{backdrop.reducedSensory && <button onClick={() => backdrop.setReducedSensory(false)}>Restore visual field</button>}</div>
      <p className="surface-note">The selected view and its transport belong to the room. Visibility, mute, sound, and sensory choices stay on this device.</p>
    </div>
  );
}
