import {useMemo, useState} from 'react';
import {youtubeEmbedUrl, type YouTubeSource} from './domain/youtube';

const STORAGE_KEY = 'magma:youtube-backdrop:v2';
type Settings = {enabled: boolean; muted: boolean; lavaMix: number; reducedSensory: boolean};
const defaults: Settings = {enabled: true, muted: true, lavaMix: 0.72, reducedSensory: false};

const load = (): Settings => {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '') as Partial<Settings>;
    return {
      enabled: value.enabled ?? defaults.enabled,
      muted: value.muted ?? defaults.muted,
      lavaMix: Math.max(0, Math.min(1, value.lavaMix ?? defaults.lavaMix)),
      reducedSensory: value.reducedSensory ?? defaults.reducedSensory,
    };
  } catch {
    return defaults;
  }
};

export const useYouTubeBackdrop = (source: YouTubeSource, canShare: boolean) => {
  const [settings, setSettingsState] = useState<Settings>(load);
  const setSettings = (next: Settings | ((current: Settings) => Settings)) => {
    setSettingsState((current) => {
      const value = typeof next === 'function' ? next(current) : next;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
      return value;
    });
  };
  const embedUrl = useMemo(
    () => youtubeEmbedUrl(source, true, window.location.origin),
    [source],
  );
  return {
    ...settings,
    source,
    canShare,
    embedUrl,
    setEnabled: (enabled: boolean) => setSettings((current) => ({...current, enabled})),
    setMuted: (muted: boolean) => setSettings((current) => ({...current, muted})),
    setLavaMix: (lavaMix: number) => setSettings((current) => ({...current, lavaMix})),
    setReducedSensory: (reducedSensory: boolean) => setSettings((current) => ({...current, reducedSensory})),
  };
};
