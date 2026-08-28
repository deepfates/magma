import {useMemo, useState} from 'react';
import {ABC7_BAY_AREA, parseYouTubeSource, youtubeEmbedUrl, type YouTubeSource} from './domain/youtube';

const STORAGE_KEY = 'magma:youtube-backdrop';
type Settings = {enabled: boolean; muted: boolean; opacity: number; source: YouTubeSource};
const defaults: Settings = {enabled: true, muted: true, opacity: 0.5, source: ABC7_BAY_AREA};

const load = (): Settings => {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '') as Partial<Settings>;
    if (!value.source?.id || !['live', 'video', 'playlist'].includes(value.source.kind)) return defaults;
    return {
      enabled: value.enabled ?? defaults.enabled,
      muted: value.muted ?? defaults.muted,
      opacity: Math.max(0.15, Math.min(0.85, value.opacity ?? defaults.opacity)),
      source: value.source,
    };
  } catch {
    return defaults;
  }
};

export const useYouTubeBackdrop = () => {
  const [settings, setSettingsState] = useState<Settings>(load);
  const [error, setError] = useState('');
  const setSettings = (next: Settings | ((current: Settings) => Settings)) => {
    setSettingsState((current) => {
      const value = typeof next === 'function' ? next(current) : next;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
      return value;
    });
  };
  const useInput = (input: string) => {
    const source = parseYouTubeSource(input);
    if (!source) {
      setError('Paste a YouTube video or playlist link.');
      return false;
    }
    setError('');
    setSettings((current) => ({...current, enabled: true, source}));
    return true;
  };
  const useDefault = () => {
    setError('');
    setSettings((current) => ({...current, enabled: true, source: ABC7_BAY_AREA}));
  };
  const embedUrl = useMemo(
    () => youtubeEmbedUrl(settings.source, settings.muted, window.location.origin),
    [settings.muted, settings.source],
  );
  return {
    ...settings,
    error,
    embedUrl,
    setEnabled: (enabled: boolean) => setSettings((current) => ({...current, enabled})),
    setMuted: (muted: boolean) => setSettings((current) => ({...current, muted})),
    setOpacity: (opacity: number) => setSettings((current) => ({...current, opacity})),
    useInput,
    useDefault,
  };
};
