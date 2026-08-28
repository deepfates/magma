export function YouTubeBackdrop({enabled, embedUrl, opacity, title}: {enabled: boolean; embedUrl: string; opacity: number; title: string}) {
  if (!enabled) return null;
  return (
    <div className="youtube-backdrop" style={{'--video-opacity': opacity} as React.CSSProperties} aria-hidden="true">
      <iframe
        key={embedUrl}
        src={embedUrl}
        title={title}
        allow="autoplay; encrypted-media; picture-in-picture"
        referrerPolicy="strict-origin-when-cross-origin"
        tabIndex={-1}
      />
      <div className="video-veil" />
    </div>
  );
}
