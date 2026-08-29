import {useId, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent} from 'react';
import type {PorchMessage, SocialRelease} from './domain/porch';

type PorchProps = {
  messages: PorchMessage[];
  focusActive: boolean;
  connected: boolean;
  release: SocialRelease | null;
  onSend: (text: string) => void | boolean | Promise<boolean>;
  onPromote?: (message: PorchMessage) => void;
};

const formatTime = (createdAt: number) =>
  new Intl.DateTimeFormat(undefined, {hour: 'numeric', minute: '2-digit'}).format(createdAt);

export function Porch({messages, focusActive, connected, release, onSend, onPromote}: PorchProps) {
  const composerId = useId();
  const composerHintId = useId();
  const logRef = useRef<HTMLDivElement>(null);
  const [draft, setDraft] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [sendError, setSendError] = useState(false);
  const ordered = useMemo(
    () => [...messages].sort((first, second) => first.createdAt - second.createdAt),
    [messages],
  );

  useLayoutEffect(() => {
    const log = logRef.current;
    if (!log) return;
    const nearEnd = log.scrollHeight - log.scrollTop - log.clientHeight < 140;
    if (nearEnd) log.scrollTop = log.scrollHeight;
  }, [ordered.length]);

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
    <section className={`porch ${focusActive ? 'porch-focus' : 'porch-open'}`} aria-label="Room conversation">
      <header className="porch-header">
        <div>
          <p className="porch-kicker">{focusActive ? 'Focus' : 'Break'}</p>
          <h3>{focusActive ? 'Conversation stays open.' : 'Conversation is open.'}</h3>
        </div>
        <span className={`porch-connection ${connected ? 'connected' : 'reconnecting'}`} role="status">
          {connected ? 'Connected' : 'Reconnecting'}
        </span>
      </header>

      <div ref={logRef} className="porch-messages" role="log" aria-label="Room messages" aria-live="polite" aria-relevant="additions">
          {!focusActive && release && (release.totalReactions > 0 || release.totalSignals > 0) && (
            <p className="porch-release-note">
              This break opened with {[
                release.totalReactions ? `${release.totalReactions} ${release.totalReactions === 1 ? 'reaction' : 'reactions'}` : '',
                release.totalSignals ? `${release.totalSignals} ${release.totalSignals === 1 ? 'signal' : 'signals'}` : '',
              ].filter(Boolean).join(' and ')} held during focus.
            </p>
          )}
          {ordered.length === 0 && <p className="porch-empty">No messages yet.</p>}
          {ordered.map((message) => (
            <article className="porch-message" key={message.id}>
              <div className="porch-message-avatar" aria-hidden="true">{message.authorEmoji}</div>
              <div className="porch-message-content">
                <header className="porch-message-meta">
                  <strong>{message.authorName}</strong>
                  <time dateTime={new Date(message.createdAt).toISOString()}>{formatTime(message.createdAt)}</time>
                </header>
                <p className="porch-message-body">{message.text}</p>
                {onPromote && <button className="porch-promote" type="button" onClick={() => onPromote(message)}>
                  Save to Board
                </button>}
              </div>
            </article>
          ))}
      </div>

      <form className="porch-composer" aria-busy={submitting} onSubmit={(event) => { event.preventDefault(); void send(); }}>
        <label className="porch-composer-label" htmlFor={composerId}>
          Write to the room
        </label>
        <textarea
          id={composerId}
          className="porch-composer-input"
          value={draft}
          maxLength={500}
          rows={3}
          aria-describedby={composerHintId}
          placeholder="What do you want to share?"
          onChange={(event) => { setDraft(event.target.value); setSendError(false); }}
          onKeyDown={handleKeyDown}
        />
        <div className="porch-composer-actions">
          <small id={composerHintId} role={submitting || sendError ? 'status' : undefined}>{submitting ? 'Waiting for the room to accept this message…' : sendError ? 'The room did not accept it. Your draft is still here.' : connected ? 'Enter to send · Shift+Enter for a new line' : 'Your draft stays here while the room reconnects.'}</small>
          <button className="porch-send" type="submit" disabled={!connected || !draft.trim() || submitting}>
            {submitting ? 'Sending…' : 'Send'}
          </button>
        </div>
      </form>
    </section>
  );
}
