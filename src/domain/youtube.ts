export type YouTubeSource = {
  kind: 'live' | 'video' | 'playlist';
  id: string;
  label: string;
};

export const TREASURE_ISLAND: YouTubeSource = {
  kind: 'video',
  id: 'BSWhGNXxT9A',
  label: 'Treasure Island panorama · live',
};

export const SCENE_PRESETS: Array<YouTubeSource & {description: string; accent: string}> = [
  {...TREASURE_ISLAND, description: 'Skyline, bridges, fog and ferries from Mersea', accent: '#ff9c91'},
  {kind: 'video', id: '_VqvVJfmyfs', label: 'ABC7 Treasure Island · live', description: 'A steady Bay Bridge and city weather window', accent: '#8da9ff'},
  {kind: 'video', id: 'E_kvIXtF_yo', label: 'TrazCam Bay Life · live', description: 'A small, calm one-camera Bay project', accent: '#66d8c5'},
  {kind: 'video', id: 'sWasdbDVNvc', label: 'Earth from the ISS · live', description: 'Official NASA views, with occasional signal loss', accent: '#b997ff'},
];

export const isKnownLiveSource = (source: YouTubeSource) =>
  source.kind === 'live' || SCENE_PRESETS.some((candidate) => candidate.id === source.id);

const safeId = (value: string, min = 10, max = 90) =>
  value.length >= min && value.length <= max && /^[a-zA-Z0-9_-]+$/.test(value);

export const parseYouTubeSource = (input: string): YouTubeSource | null => {
  const value = input.trim();
  if (!value) return null;
  if (/^[a-zA-Z0-9_-]{11}$/.test(value)) return {kind: 'video', id: value, label: 'YouTube video'};

  let url: URL;
  try {
    url = new URL(value.startsWith('http') ? value : `https://${value}`);
  } catch {
    return null;
  }
  const host = url.hostname.replace(/^www\./, '');
  if (!['youtube.com', 'm.youtube.com', 'music.youtube.com', 'youtu.be', 'youtube-nocookie.com'].includes(host)) return null;

  const playlistId = url.searchParams.get('list');
  if (playlistId && safeId(playlistId)) return {kind: 'playlist', id: playlistId, label: 'YouTube playlist'};

  const segments = url.pathname.split('/').filter(Boolean);
  const videoId = host === 'youtu.be'
    ? segments[0]
    : url.searchParams.get('v') || (['embed', 'shorts', 'live'].includes(segments[0]) ? segments[1] : null);
  return videoId && safeId(videoId, 11, 11) ? {kind: 'video', id: videoId, label: 'YouTube video'} : null;
};

export const youtubeEmbedUrl = (source: YouTubeSource, muted: boolean, origin: string) => {
  const params = new URLSearchParams({
    autoplay: '1',
    mute: muted ? '1' : '0',
    controls: '1',
    playsinline: '1',
    rel: '0',
    enablejsapi: '1',
    origin,
  });
  if (source.kind === 'live') {
    params.set('channel', source.id);
    return `https://www.youtube-nocookie.com/embed/live_stream?${params}`;
  }
  if (source.kind === 'playlist') {
    params.set('list', source.id);
    return `https://www.youtube-nocookie.com/embed/videoseries?${params}`;
  }
  return `https://www.youtube-nocookie.com/embed/${source.id}?${params}`;
};
