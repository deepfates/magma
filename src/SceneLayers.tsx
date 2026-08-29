import {useEffect, useRef} from 'react';
import type {RadioSource, WorldOverlay} from './domain/scene';

export function RadioLayer({source, muted, volume}: {source: RadioSource | null; muted: boolean; volume: number}) {
  const audio = useRef<HTMLAudioElement>(null);
  useEffect(() => {
    if (!audio.current) return;
    audio.current.volume = volume;
    if (muted || !source) audio.current.pause();
    else void audio.current.play().catch(() => undefined);
  }, [muted, source?.streamUrl, volume]);
  useEffect(() => {
    const playFromGesture = () => { if (audio.current && source) void audio.current.play().catch(() => undefined); };
    window.addEventListener('porch:radio-play', playFromGesture);
    return () => window.removeEventListener('porch:radio-play', playFromGesture);
  }, [source?.streamUrl]);
  return <audio ref={audio} data-radio-source={source?.id ?? 'off'} src={source?.streamUrl} preload="none" />;
}

export function WorldOverlays({overlays, visible}: {overlays: WorldOverlay[]; visible: boolean}) {
  return visible && overlays.some((overlay) => overlay.id === 'daylight')
    ? <div className="porch-daylight" data-world-overlay="daylight" aria-hidden="true" />
    : null;
}
