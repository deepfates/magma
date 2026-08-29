import {useEffect, useState} from 'react';

const readBoolean = (key: string, fallback: boolean) => {
  try { const value = localStorage.getItem(key); return value === null ? fallback : value === 'true'; } catch { return fallback; }
};
const readVolume = (key: string) => {
  try { const value = Number(localStorage.getItem(key)); return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0.35; } catch { return 0.35; }
};

export const useScenePreferences = () => {
  const [radioMuted, setRadioMuted] = useState(() => readBoolean('porch:radio-muted', true));
  const [radioVolume, setRadioVolume] = useState(() => readVolume('porch:radio-volume'));
  const [overlaysVisible, setOverlaysVisible] = useState(() => readBoolean('porch:overlays-visible', true));
  useEffect(() => { localStorage.setItem('porch:radio-muted', String(radioMuted)); }, [radioMuted]);
  useEffect(() => { localStorage.setItem('porch:radio-volume', String(radioVolume)); }, [radioVolume]);
  useEffect(() => { localStorage.setItem('porch:overlays-visible', String(overlaysVisible)); }, [overlaysVisible]);
  return {radioMuted, setRadioMuted, radioVolume, setRadioVolume, overlaysVisible, setOverlaysVisible};
};
