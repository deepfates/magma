import {useMemo, useState} from 'react';
import {parseYouTubeSource, TREASURE_ISLAND, youtubeEmbedUrl, type YouTubeSource} from './domain/youtube';

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

export const useYouTubeBackdrop = (source: YouTubeSource, setSharedSource: (source: YouTubeSource) => void, canControl: boolean) => {
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
    setSettings((current) => ({...current, enabled: true, reducedSensory: false}));
    setSharedSource(source);
    return true;
  };
  const useDefault = () => {
    setError('');
    setSettings((current) => ({...current, enabled: true, reducedSensory: false}));
    setSharedSource(TREASURE_ISLAND);
  };
  const embedUrl = useMemo(
    () => youtubeEmbedUrl(source, true, window.location.origin),
    [source],
  );
  return {
    ...settings,
    source,
    error,
    canControl,
    embedUrl,
    setEnabled: (enabled: boolean) => setSettings((current) => ({...current, enabled})),
    setMuted: (muted: boolean) => setSettings((current) => ({...current, muted})),
    setLavaMix: (lavaMix: number) => setSettings((current) => ({...current, lavaMix})),
    setReducedSensory: (reducedSensory: boolean) => setSettings((current) => ({...current, reducedSensory})),
    useSource: (source: YouTubeSource) => {
      setError('');
      setSettings((current) => ({...current, enabled: true, reducedSensory: false}));
      setSharedSource(source);
    },
    useInput,
    useDefault,
  };
};
