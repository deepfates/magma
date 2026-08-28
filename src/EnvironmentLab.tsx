import {useEffect, useRef, useState, type MouseEvent} from 'react';
import {Eye, EyeOff, FlaskConical, Radio, SlidersHorizontal, Sparkles, Volume2, VolumeX, X} from 'lucide-react';
import {SCENE_PRESETS} from './domain/youtube';
import type {useAmbientAudio, AudioCue} from './useAmbientAudio';
import type {useYouTubeBackdrop} from './useYouTubeBackdrop';

const CUES: Array<{id: AudioCue; label: string; symbol: string; meaning: string}> = [
  {id: 'begin', label: 'Cross threshold', symbol: '◒', meaning: 'Begin deliberately'},
  {id: 'return', label: 'Return', symbol: '↩', meaning: 'Come back without judgment'},
  {id: 'smallWin', label: 'Small win', symbol: '✦', meaning: 'Acknowledge movement'},
  {id: 'breathe', label: 'Breathe', symbol: '〰', meaning: 'Make a little room'},
  {id: 'reset', label: 'Reset', symbol: '↻', meaning: 'Release and begin again'},
  {id: 'complete', label: 'Block sealed', symbol: '◆', meaning: 'The interval is complete'},
];

function AdvancedAuthoring({backdrop}: {backdrop: ReturnType<typeof useYouTubeBackdrop>}) {
  const container = useRef<HTMLDivElement>(null);
  const current = useRef(backdrop);
  current.current = backdrop;
  useEffect(() => {
    let disposed = false;
    let destroy: (() => void) | undefined;
    void import('tweakpane').then(({Pane}) => {
      if (disposed || !container.current) return;
      const parameters = {lava: current.current.lavaMix, windowOpen: current.current.enabled, reducedSensory: current.current.reducedSensory};
      const pane = new Pane({container: container.current, title: 'Scene authoring'});
      // Tweakpane 4's published declaration omits FolderApi's inherited bindings.
      const bindings = pane as unknown as {addBinding: (target: object, key: string, options: object) => {on: (event: 'change', handler: (detail: {value: unknown}) => void) => void}};
      bindings.addBinding(parameters, 'lava', {min: 0, max: 1, step: 0.01, label: 'Lava mix'}).on('change', ({value}) => current.current.setLavaMix(Number(value)));
      bindings.addBinding(parameters, 'windowOpen', {label: 'Live window'}).on('change', ({value}) => {
        const enabled = Boolean(value);
        if (enabled) current.current.setReducedSensory(false);
        current.current.setEnabled(enabled);
      });
      bindings.addBinding(parameters, 'reducedSensory', {label: 'Low sensory'}).on('change', ({value}) => current.current.setReducedSensory(Boolean(value)));
      destroy = () => pane.dispose();
    });
    return () => { disposed = true; destroy?.(); };
  }, []);
  return <div className="tweakpane-host" ref={container} />;
}

export function EnvironmentLab({backdrop, audio, running}: {
  backdrop: ReturnType<typeof useYouTubeBackdrop>;
  audio: ReturnType<typeof useAmbientAudio>;
  running: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [advanced, setAdvanced] = useState(false);
  const [draft, setDraft] = useState('');
  const [lastCue, setLastCue] = useState('');
  const dialog = useRef<HTMLDialogElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const opener = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (open && !element.open) {
      element.showModal();
      window.requestAnimationFrame(() => closeButton.current?.focus());
    } else if (!open && element.open) {
      element.close();
    }
  }, [open]);
  const openLab = (event: MouseEvent<HTMLButtonElement>) => {
    opener.current = event.currentTarget;
    setOpen(true);
  };
  const closeLab = () => dialog.current?.close();
  const afterClose = () => {
    setOpen(false);
    opener.current?.focus();
  };
  const apply = () => {
    if (backdrop.useInput(draft)) setDraft('');
  };
  const quietEverything = () => {
    backdrop.setEnabled(false);
    backdrop.setReducedSensory(true);
    audio.silence();
  };
  const restoreSensory = () => backdrop.setReducedSensory(false);
  const setWindowOpen = (enabled: boolean) => {
    if (enabled) backdrop.setReducedSensory(false);
    backdrop.setEnabled(enabled);
  };
  return (
    <>
      <section className="glass environment-card">
        <div className="card-title"><span><FlaskConical size={17} /> Environment Lab</span><button className="icon-button" onClick={openLab} aria-label="Open Environment Lab"><SlidersHorizontal size={15} /></button></div>
        <button className="environment-summary" onClick={openLab}><span className="scene-orb" /><div><strong>{backdrop.reducedSensory ? 'Quiet field' : backdrop.enabled ? backdrop.source.label : 'Lava field'}</strong><small>{running ? 'Lab tucked away while you work' : 'Shape your conditions'}</small></div><span>Open</span></button>
        <button className="quiet-button" onClick={quietEverything}><VolumeX size={13} /> Quiet everything</button>
      </section>

      <dialog ref={dialog} className="lab-dialog" aria-labelledby="lab-title" onClose={afterClose} onMouseDown={(event) => event.target === event.currentTarget && closeLab()}>
          <section className="environment-lab glass">
            <header className="lab-header"><div><p className="eyebrow"><Sparkles size={13} /> personal, local, reversible</p><h2 id="lab-title">Shape the room. Then leave it alone.</h2><p>Magma helps you author conditions; it does not optimize you.</p></div><button ref={closeButton} className="icon-button" onClick={closeLab} aria-label="Close Environment Lab"><X size={18} /></button></header>

            <div className="lab-section-heading"><div><span>01</span><strong>Living windows</strong></div><small>Opening a window loads YouTube. Controls remain visible and unobscured.</small></div>
            <div className="scene-grid">
              {SCENE_PRESETS.map((scene) => <button className={backdrop.source.id === scene.id ? 'scene-option selected' : 'scene-option'} key={scene.id} onClick={() => backdrop.useSource(scene)} style={{'--scene-accent': scene.accent} as React.CSSProperties}><span><Radio size={12} /> LIVE</span><strong>{scene.label.replace(' · live', '')}</strong><small>{scene.description}</small></button>)}
            </div>
            <div className="custom-scene"><input value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && apply()} placeholder="YouTube video or playlist URL" aria-label="YouTube video or playlist URL" /><button onClick={apply}>Load</button></div>
            {backdrop.error && <small className="backdrop-error" role="alert">{backdrop.error}</small>}
            <div className="lab-inline-controls"><button onClick={() => setWindowOpen(!(backdrop.enabled && !backdrop.reducedSensory))}>{backdrop.enabled && !backdrop.reducedSensory ? <Eye size={14} /> : <EyeOff size={14} />}{backdrop.enabled && !backdrop.reducedSensory ? 'Close live window' : 'Open selected window'}</button><button onClick={() => backdrop.setMuted(!backdrop.muted)}>{backdrop.muted ? <VolumeX size={14} /> : <Volume2 size={14} />}{backdrop.muted ? 'Camera muted' : 'Camera sound on'}</button></div>

            <div className="lab-section-heading"><div><span>02</span><strong>Cue deck</strong></div><small>Previewable signals you choose—not variable rewards.</small></div>
            <div className="cue-deck">{CUES.map((cue) => <button key={cue.id} onClick={() => { void audio.playCue(cue.id, true); setLastCue(`${cue.label}: ${cue.meaning}`); }}><b>{cue.symbol}</b><strong>{cue.label}</strong><small>{cue.meaning}</small></button>)}</div>
            <div className="lab-inline-controls"><button onClick={() => audio.setCuesEnabled(!audio.cuesEnabled)}>{audio.cuesEnabled ? <Volume2 size={14} /> : <VolumeX size={14} />}{audio.cuesEnabled ? 'Ritual cues on' : 'Ritual cues off'}</button><button onClick={audio.toggle}>{audio.enabled ? <Volume2 size={14} /> : <VolumeX size={14} />}{audio.enabled ? 'Warm noise on' : 'Warm noise off'}</button><label>Noise <input type="range" min="0" max="100" value={Math.round(audio.volume * 100)} onChange={(event) => audio.setVolume(Number(event.target.value) / 100)} aria-label="Warm noise volume" /></label></div>
            <div className="cue-status" aria-live="polite">{lastCue}</div>

            <div className="lab-section-heading"><div><span>03</span><strong>Sensory boundary</strong></div><small>Quiet is a complete setup.</small></div>
            <div className="sensory-actions"><button className={backdrop.reducedSensory ? 'selected' : ''} onClick={quietEverything}>Reduce sensory activity</button>{backdrop.reducedSensory && <button onClick={restoreSensory}>Restore visual field</button>}</div>

            <button className="advanced-toggle" onClick={() => setAdvanced((value) => !value)} aria-expanded={advanced}><SlidersHorizontal size={14} /> {advanced ? 'Close authoring surface' : 'Open advanced authoring surface'}</button>
            {advanced && <AdvancedAuthoring backdrop={backdrop} />}
            <footer className="lab-footer">Choices saved locally · audio always restarts by gesture · never shared with the room</footer>
          </section>
      </dialog>
    </>
  );
}
