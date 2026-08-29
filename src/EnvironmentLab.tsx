import {useState} from 'react';
import {Eye, EyeOff, Radio, Volume2, VolumeX} from 'lucide-react';
import {SCENE_PRESETS} from './domain/youtube';
import type {useAmbientAudio} from './useAmbientAudio';
import type {useYouTubeBackdrop} from './useYouTubeBackdrop';
import type {RoomCueId} from './domain/porch';

const SOCIAL_SIGNALS: Array<{id: RoomCueId; label: string; symbol: string; meaning: string}> = [
  {id: 'smallWin', label: 'Nice', symbol: '✦', meaning: 'Acknowledge movement'},
  {id: 'breathe', label: 'With you', symbol: '〰', meaning: 'Offer quiet support'},
];

export function EnvironmentLab({backdrop, audio, sendSignal}: {
  backdrop: ReturnType<typeof useYouTubeBackdrop>;
  audio: ReturnType<typeof useAmbientAudio>;
  sendSignal: (cueId: RoomCueId) => void;
}) {
  const [draft, setDraft] = useState('');
  const [lastCue, setLastCue] = useState('');
  const apply = () => {
    if (backdrop.useInput(draft)) setDraft('');
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

  return (
    <div className="environment-lab">
      <div className="surface-section-heading"><strong>Room view</strong><small>{backdrop.canShare ? 'Everyone here can steer the shared view.' : 'Reconnect to steer the shared view.'}</small></div>
      <div className="scene-list">
        {SCENE_PRESETS.map((scene) => (
          <button disabled={!backdrop.canShare} className={backdrop.source.id === scene.id ? 'scene-option selected' : 'scene-option'} key={scene.id} onClick={() => backdrop.useSource(scene)}>
            <span><Radio size={12} /> LIVE</span><strong>{scene.label.replace(' · live', '')}</strong><small>{scene.description}</small>
          </button>
        ))}
      </div>
      <div className="custom-scene"><input disabled={!backdrop.canShare} value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && apply()} placeholder="YouTube video or playlist URL" aria-label="YouTube video or playlist URL" /><button disabled={!backdrop.canShare} onClick={apply}>Set for room</button></div>
      {backdrop.error && <small className="backdrop-error" role="alert">{backdrop.error}</small>}
      <div className="inline-controls">
        <button onClick={() => setWindowOpen(!(backdrop.enabled && !backdrop.reducedSensory))}>{backdrop.enabled && !backdrop.reducedSensory ? <Eye size={14} /> : <EyeOff size={14} />}{backdrop.enabled && !backdrop.reducedSensory ? 'Close live view' : 'Open selected view'}</button>
        <button onClick={() => backdrop.setMuted(!backdrop.muted)}>{backdrop.muted ? <VolumeX size={14} /> : <Volume2 size={14} />}{backdrop.muted ? 'Camera muted' : 'Camera sound on'}</button>
      </div>

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
      <div className="inline-controls"><button className={backdrop.reducedSensory ? 'selected' : ''} onClick={quietEverything}>Quiet everything</button>{backdrop.reducedSensory && <button onClick={() => backdrop.setReducedSensory(false)}>Restore visual field</button>}</div>
      <p className="surface-note">The selected view and its transport belong to the room. Visibility, mute, sound, and sensory choices stay on this device.</p>
    </div>
  );
}
