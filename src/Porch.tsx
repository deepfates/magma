import {useId, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent} from 'react';
import type {PorchMessage, SocialRelease} from './domain/porch';

type PorchProps = {
  messages: PorchMessage[];
  floor: boolean;
  connected: boolean;
  release: SocialRelease | null;
  onSend: (text: string) => void | boolean | Promise<boolean>;
  onPromote: (message: PorchMessage) => void;
};

const formatTime = (createdAt: number) =>
  new Intl.DateTimeFormat(undefined, {hour: 'numeric', minute: '2-digit'}).format(createdAt);

export function Porch({messages, floor, connected, release, onSend, onPromote}: PorchProps) {
  const composerId = useId();
  const composerHintId = useId();
  const logRef = useRef<HTMLDivElement>(null);
  const previousFloor = useRef(floor);
  const [draft, setDraft] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [sendError, setSendError] = useState(false);
  const ordered = useMemo(
    () => [...messages].sort((first, second) => first.createdAt - second.createdAt),
    [messages],
  );

  useLayoutEffect(() => {
    const log = logRef.current;
    const opened = previousFloor.current && !floor;
    previousFloor.current = floor;
    if (!log || floor) return;
    const nearEnd = log.scrollHeight - log.scrollTop - log.clientHeight < 140;
    if (opened || nearEnd) log.scrollTop = log.scrollHeight;
  }, [floor, ordered.length]);

  const send = async () => {
    const text = draft.trim();
    if (!connected || !text || submitting) return;
    setSubmitting(true);
    setSendError(false);
    try {
      const accepted = await onSend(text);
      if (accepted === false) setSendError(true);
      else setDraft((current) => current.trim() === text ? '' : current);
    } catch {
      setSendError(true);
    } finally {
      setSubmitting(false);
    }
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) return;
    event.preventDefault();
    void send();
  };

  return (
    <section className={`porch ${floor ? 'porch-floor' : 'porch-open'}`} aria-label="Room conversation">
      <header className="porch-header">
        <div>
          <p className="porch-kicker">{floor ? 'The Floor' : 'The Porch'}</p>
          <h3>{floor ? 'Conversation is resting.' : 'The room can talk.'}</h3>
        </div>
        <span className={`porch-connection ${connected ? 'connected' : 'reconnecting'}`} role="status">
          {connected ? 'Connected' : 'Reconnecting'}
        </span>
      </header>

      {floor ? (
        <div className="porch-sealed">
          <strong>Messages are held for the Porch.</strong>
          <p>Leave a thought now. It will appear when the room reaches its break.</p>
        </div>
      ) : (
        <div ref={logRef} className="porch-messages" role="log" aria-label="Porch messages" aria-live="polite" aria-relevant="additions">
          {release && (release.totalReactions > 0 || release.totalSignals > 0) && (
            <p className="porch-release-note">
              This Porch opened with {[
                release.totalReactions ? `${release.totalReactions} ${release.totalReactions === 1 ? 'reaction' : 'reactions'}` : '',
                release.totalSignals ? `${release.totalSignals} ${release.totalSignals === 1 ? 'signal' : 'signals'}` : '',
              ].filter(Boolean).join(' and ')} held during the Block.
            </p>
          )}
          {ordered.length === 0 && <p className="porch-empty">The Porch is quiet. Leave the first thought.</p>}
          {ordered.map((message) => (
            <article className="porch-message" key={message.id}>
              <div className="porch-message-avatar" aria-hidden="true">{message.authorEmoji}</div>
              <div className="porch-message-content">
                <header className="porch-message-meta">
                  <strong>{message.authorName}</strong>
                  <time dateTime={new Date(message.createdAt).toISOString()}>{formatTime(message.createdAt)}</time>
                </header>
                <p className="porch-message-body">{message.text}</p>
                <button className="porch-promote" type="button" onClick={() => onPromote(message)}>
                  Promote to Spark
                </button>
              </div>
            </article>
          ))}
        </div>
      )}

      <form className="porch-composer" aria-busy={submitting} onSubmit={(event) => { event.preventDefault(); void send(); }}>
        <label className="porch-composer-label" htmlFor={composerId}>
          {floor ? 'Leave a thought for the Porch' : 'Write to the room'}
        </label>
        <textarea
          id={composerId}
          className="porch-composer-input"
          value={draft}
          maxLength={500}
          rows={3}
          aria-describedby={composerHintId}
          placeholder={floor ? 'Held quietly until the break…' : 'What do you want to share?'}
          onChange={(event) => { setDraft(event.target.value); setSendError(false); }}
          onKeyDown={handleKeyDown}
        />
        <div className="porch-composer-actions">
          <small id={composerHintId} role={submitting || sendError ? 'status' : undefined}>{submitting ? 'Waiting for the room to accept this message…' : sendError ? 'The room did not accept it. Your draft is still here.' : connected ? 'Enter to send · Shift+Enter for a new line' : 'Your draft stays here while the room reconnects.'}</small>
          <button className="porch-send" type="submit" disabled={!connected || !draft.trim() || submitting}>
            {submitting ? 'Sending…' : floor ? 'Hold for Porch' : 'Send'}
          </button>
        </div>
      </form>
    </section>
  );
}
