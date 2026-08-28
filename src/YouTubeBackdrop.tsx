export function YouTubeBackdrop({enabled, embedUrl, title}: {enabled: boolean; embedUrl: string; title: string}) {
  if (!enabled) return null;
  return (
    <section className="living-window glass" aria-label={`${title} living window`}>
      <div className="living-window-heading"><span>Live window</span><strong>{title}</strong></div>
      <iframe
        key={embedUrl}
        src={embedUrl}
        title={title}
        allow="autoplay; encrypted-media; picture-in-picture"
        referrerPolicy="strict-origin-when-cross-origin"
        allowFullScreen
      />
    </section>
  );
}
