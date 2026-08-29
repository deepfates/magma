import {useEffect, useRef} from 'react';
import {mediaPositionAt, type MediaCommand, type RoomMediaState} from './domain/media';
import {isKnownLiveSource} from './domain/youtube';

type Player = {
  destroy: () => void;
  getCurrentTime: () => number;
  getPlayerState: () => number;
  getPlaylistIndex: () => number;
  mute: () => void;
  pauseVideo: () => void;
  playVideo: () => void;
  playVideoAt: (index: number) => void;
  seekTo: (seconds: number, allowSeekAhead: boolean) => void;
  unMute: () => void;
};

type PlayerEvent = {target: Player; data: number};
type YouTubeApi = {Player: new (element: HTMLIFrameElement, options: {events: {onReady: (event: PlayerEvent) => void; onStateChange: (event: PlayerEvent) => void}}) => Player};

declare global {
  interface Window {
    YT?: YouTubeApi;
    onYouTubeIframeAPIReady?: () => void;
  }
}

let apiPromise: Promise<YouTubeApi> | null = null;
const loadApi = () => {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (apiPromise) return apiPromise;
  apiPromise = new Promise((resolve) => {
    const previous = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      previous?.();
      if (window.YT) resolve(window.YT);
    };
    if (!document.querySelector('script[src="https://www.youtube.com/iframe_api"]')) {
      const script = document.createElement('script');
      script.src = 'https://www.youtube.com/iframe_api';
      document.head.append(script);
    }
  });
  return apiPromise;
};

export function YouTubeBackdrop({enabled, embedUrl, title, media, roomNow, onCommand, canShare, muted}: {
  enabled: boolean;
  embedUrl: string;
  title: string;
  media: RoomMediaState;
  roomNow: () => number;
  onCommand: (command: MediaCommand) => void;
  canShare: boolean;
  muted: boolean;
}) {
  const iframe = useRef<HTMLIFrameElement>(null);
  const player = useRef<Player | null>(null);
  const mediaRef = useRef(media);
  const roomNowRef = useRef(roomNow);
  const commandRef = useRef(onCommand);
  const canShareRef = useRef(canShare);
  const mutedRef = useRef(muted);
  const suppressUntil = useRef(0);
  const generation = useRef(0);
  mediaRef.current = media;
  roomNowRef.current = roomNow;
  commandRef.current = onCommand;
  canShareRef.current = canShare;
  mutedRef.current = muted;

  useEffect(() => {
    if (!enabled || !iframe.current) return;
    let disposed = false;
    const currentGeneration = ++generation.current;
    suppressUntil.current = Date.now() + 1_800;
    void loadApi().then((YT) => {
      if (disposed || !iframe.current) return;
      player.current = new YT.Player(iframe.current, {
        events: {
          onReady: ({target}) => {
            if (disposed || currentGeneration !== generation.current) return;
            player.current = target;
            if (mutedRef.current) target.mute(); else target.unMute();
            suppressUntil.current = Date.now() + 1_800;
          },
          onStateChange: ({target, data}) => {
            const reportable = data === 1 || data === 2;
            const deliberate = document.activeElement === iframe.current;
            if (disposed || currentGeneration !== generation.current || !canShareRef.current || !deliberate || Date.now() < suppressUntil.current || !reportable) return;
            const positionSeconds = Math.max(0, target.getCurrentTime() || 0);
            const playlistIndex = Math.max(0, target.getPlaylistIndex() || 0);
            commandRef.current({type: data === 1 ? 'play' : 'pause', positionSeconds, playlistIndex});
          },
        },
      });
    });
    return () => {
      disposed = true;
      generation.current += 1;
      player.current?.destroy();
      player.current = null;
    };
  }, [embedUrl, enabled]);

  useEffect(() => {
    const target = player.current;
    if (!target) return;
    if (muted) target.mute(); else target.unMute();
  }, [muted]);

  useEffect(() => {
    if (!enabled) return;
    const synchronize = () => {
      const target = player.current;
      if (!target) return;
      const shared = mediaRef.current;
      const isLive = isKnownLiveSource(shared.source);
      const desiredPosition = mediaPositionAt(shared, roomNowRef.current());
      const actualPosition = Math.max(0, target.getCurrentTime() || 0);
      const actualState = target.getPlayerState();
      const actualIndex = Math.max(0, target.getPlaylistIndex() || 0);
      let applying = false;
      if (shared.source.kind === 'playlist' && actualIndex !== shared.playlistIndex) { target.playVideoAt(shared.playlistIndex); applying = true; }
      if (!isLive && Math.abs(actualPosition - desiredPosition) > 2.5) { target.seekTo(desiredPosition, true); applying = true; }
      if (shared.status === 'playing' && actualState !== 1 && actualState !== 3) { target.playVideo(); applying = true; }
      if (shared.status === 'paused' && actualState !== 2) { target.pauseVideo(); applying = true; }
      if (applying) suppressUntil.current = Date.now() + 900;
    };
    synchronize();
    const interval = window.setInterval(synchronize, 1_500);
    return () => window.clearInterval(interval);
  }, [enabled, media.revision]);

  if (!enabled) return null;
  return (
    <section className="living-window" aria-label={`${title} living window`}>
      <iframe
        ref={iframe}
        key={embedUrl}
        src={embedUrl}
        title={title}
        allow="autoplay; encrypted-media; picture-in-picture"
        referrerPolicy="strict-origin-when-cross-origin"
        allowFullScreen
      />
      <div className="living-window-caption"><span>Live view</span><strong>{title}</strong></div>
    </section>
  );
}
