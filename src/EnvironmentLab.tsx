import {useState} from 'react';
import {ChevronDown, ChevronUp, Eye, EyeOff, Radio, Trash2, Volume2, VolumeX} from 'lucide-react';
import {parseYouTubeSource, SCENE_PRESETS, type YouTubeSource} from './domain/youtube';
import type {useAmbientAudio} from './useAmbientAudio';
import type {useYouTubeBackdrop} from './useYouTubeBackdrop';
import type {MediaQueueState} from './domain/mediaQueue';

export function EnvironmentLab({
  backdrop, audio, queue, floor, addSource, moveItem, removeItem, selectItem,
}: {
  backdrop: ReturnType<typeof useYouTubeBackdrop>;
  audio: ReturnType<typeof useAmbientAudio>;
  queue: MediaQueueState;
  floor: boolean;
  addSource: (source: YouTubeSource, activate?: boolean) => void;
  moveItem: (itemId: string, beforeItemId: string | null) => void;
  removeItem: (itemId: string) => void;
  selectItem: (itemId: string) => void;
}) {
  const [draft, setDraft] = useState('');
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
  const canArrange = backdrop.canShare;
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
      <div className="surface-section-heading"><strong>Your background</strong><small>The room picks the source. You pick how it lives on this screen.</small></div>
      <div className="background-modes" role="group" aria-label="Background mode">
        <button aria-pressed={backdrop.enabled && !backdrop.reducedSensory} onClick={() => setWindowOpen(true)}><Eye size={14} />Live</button>
        <button aria-pressed={!backdrop.enabled && !backdrop.reducedSensory} onClick={() => { backdrop.setEnabled(false); backdrop.setReducedSensory(false); }}><Radio size={14} />Magma</button>
        <button aria-pressed={backdrop.reducedSensory} onClick={quietEverything}><EyeOff size={14} />Quiet</button>
      </div>
      <div className="inline-controls"><button aria-pressed={!backdrop.muted} onClick={() => backdrop.setMuted(!backdrop.muted)}>{backdrop.muted ? <VolumeX size={14} /> : <Volume2 size={14} />}{backdrop.muted ? 'Audio off' : 'Audio on'}</button></div>

      <section className="listening-deck" aria-labelledby="listening-deck-title">
        <div className="surface-section-heading"><strong id="listening-deck-title">Background queue</strong><small>Everyone can add, choose, and reorder.</small></div>
        {active && <article className="deck-now" aria-label="Now in the room"><span><Radio size={12} /> NOW IN THE ROOM</span><strong>{active.source.label}</strong><small>added by {active.addedByEmoji} {active.addedByName}</small></article>}
        {queue.stagedItemId && <p className="deck-staged">Saved for the break · {queue.items.find((item) => item.id === queue.stagedItemId)?.source.label}</p>}
        <ol className="deck-list" aria-label="Background queue order">
          {queue.items.filter((item) => item.id !== queue.activeItemId).map((item) => {
            const index = queue.items.findIndex((candidate) => candidate.id === item.id);
            const removable = backdrop.canShare && item.origin !== 'migration';
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
        </details> : <p className="surface-note">Reconnect to change the queue.</p>}
        <div className="cue-status" aria-live="polite">{deckStatus}</div>
      </section>

      <div className="surface-section-heading"><strong>Personal sound</strong><small>Local, reversible, and off until chosen.</small></div>
      <div className="inline-controls">
        <button onClick={audio.toggle}>{audio.enabled ? <Volume2 size={14} /> : <VolumeX size={14} />}{audio.enabled ? 'Warm noise on' : 'Warm noise off'}</button>
        <button onClick={() => audio.setCuesEnabled(!audio.cuesEnabled)}>{audio.cuesEnabled ? <Volume2 size={14} /> : <VolumeX size={14} />}{audio.cuesEnabled ? 'Ritual cues on' : 'Ritual cues off'}</button>
        <label>Noise <input type="range" min="0" max="100" value={Math.round(audio.volume * 100)} onChange={(event) => audio.setVolume(Number(event.target.value) / 100)} aria-label="Warm noise volume" /></label>
      </div>

      <p className="surface-note">The live source and playback are shared. Live, Magma, Quiet, and audio are yours.</p>
    </div>
  );
}
