export function YouTubeBackdrop({enabled, embedUrl, title}: {enabled: boolean; embedUrl: string; title: string}) {
  if (!enabled) return null;
  return (
    <section className="living-window" aria-label={`${title} living window`}>
      <iframe
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
