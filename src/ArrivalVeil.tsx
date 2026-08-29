import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
  type RefObject,
} from 'react';
import {Check, Copy, Flame, Link2, LockKeyhole, RotateCw, WifiOff, X} from 'lucide-react';
import './arrival.css';

export type RoomRole = 'owner' | 'steward' | 'member' | 'guest';
export type ArrivalPhase = 'floor' | 'gathering' | 'porch' | 'unknown';

export type ArrivalState =
  | {
      kind: 'creating';
      step: 'form';
      submitting?: boolean;
      initialDisplayName?: string;
      initialEmoji?: string;
      savedSetupAvailable?: boolean;
      error?: string;
    }
  | {
      kind: 'creating';
      step: 'ready';
      roomName: string;
      copying?: boolean;
      copied?: boolean;
      invitationPayload?: string;
    }
  | {
      kind: 'invited' | 'returning';
      roomName: string;
      role: RoomRole;
      phase: ArrivalPhase;
      inviterName?: string;
      displayName?: string;
      emoji?: string;
      savedSetupAvailable?: boolean;
      invitationRequired?: boolean;
      entering?: boolean;
      error?: string;
    }
  | {kind: 'proving'; roomName?: string}
  | {kind: 'admitted'; roomName?: string; role?: RoomRole}
  | {
      kind: 'denied';
      reason: 'expired' | 'paused' | 'full' | 'identity' | 'unknown';
      retryable?: boolean;
    }
  | {kind: 'revoked'; roomName: string}
  | {kind: 'reconnecting'; roomName?: string; attempt?: number};

export type ArrivalProfile = {
  displayName: string;
  emoji: string;
  setup: 'quiet' | 'saved';
  invitationCode?: string;
};

export type CreateRoomInput = ArrivalProfile;

export type ArrivalVeilProps = {
  state: ArrivalState;
  /**
   * The element containing the room instrument. It must be a sibling of this
   * component, not an ancestor, so modal arrival states can make it inert.
   * Without this ref, the component looks for `[data-arrival-background]`.
   */
  backgroundRef?: RefObject<HTMLElement | null>;
  onCreate?: (input: CreateRoomInput) => void;
  onCopyInvitation?: () => void | boolean | Promise<void | boolean>;
  onEnterCreatedRoom?: () => void;
  onEnter?: (profile: ArrivalProfile) => void;
  onNotNow?: () => void;
  onRetry?: () => void;
  onReturnHome?: () => void;
  onConfirmIdentity?: () => void;
  onLeaveRoom?: () => void;
};

const focusableSelector = [
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  'a[href]',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

const visibleFocusables = (root: HTMLElement) =>
  [...root.querySelectorAll<HTMLElement>(focusableSelector)].filter(
    (element) => element.getClientRects().length > 0 && element.getAttribute('aria-hidden') !== 'true',
  );

function useContainedFocus(
  containerRef: RefObject<HTMLElement | null>,
  active: boolean,
  focusKey: string,
  onEscape?: () => void,
) {
  useEffect(() => {
    if (!active) return;
    const container = containerRef.current;
    if (!container) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const initial = container.querySelector<HTMLElement>('[data-initial-focus]') ?? container;
    initial.focus();

    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onEscape?.();
        return;
      }
      if (event.key !== 'Tab') return;
      const focusables = visibleFocusables(container);
      if (focusables.length === 0) {
        event.preventDefault();
        container.focus();
        return;
      }
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    const focusin = (event: FocusEvent) => {
      if (!container.contains(event.target as Node)) initial.focus();
    };
    document.addEventListener('keydown', keydown);
    document.addEventListener('focusin', focusin);
    return () => {
      document.removeEventListener('keydown', keydown);
      document.removeEventListener('focusin', focusin);
      if (previous?.isConnected) previous.focus();
    };
  }, [active, containerRef, focusKey, onEscape]);
}

const phaseCopy: Record<ArrivalPhase, string> = {
  floor: 'A focus is underway. Entering quietly will not change the clock or view. Anything you write will wait for the break.',
  gathering: 'The room is gathering. Enter whenever you’re ready.',
  porch: 'The room is on a break. Enter whenever you’re ready.',
  unknown: 'Entering quietly will not change the room’s clock, view, or anyone else’s setup.',
};

const deniedCopy: Record<Exclude<Extract<ArrivalState, {kind: 'denied'}>['reason'], 'identity'>, string> = {
  expired: 'This invitation no longer opens the room. Ask the person who invited you for a fresh link.',
  paused: 'The room isn’t admitting arrivals right now.',
  full: 'The room is full for this session.',
  unknown: 'This room could not admit you. Check the invitation and try again.',
};

function SetupChoice({savedAvailable, setup, onChange}: {
  savedAvailable?: boolean;
  setup: ArrivalProfile['setup'];
  onChange: (setup: ArrivalProfile['setup']) => void;
}) {
  return (
    <fieldset className="arrival-setup">
      <legend>On this device</legend>
      <label><input type="radio" name="arrival-setup" checked={setup === 'quiet'} onChange={() => onChange('quiet')} /> <span><strong>Start quiet</strong><small>The live view stays visible; audio and notifications stay off</small></span></label>
      {savedAvailable && <label><input type="radio" name="arrival-setup" checked={setup === 'saved'} onChange={() => onChange('saved')} /> <span><strong>Use my saved setup</strong><small>Your local sensory choices</small></span></label>}
    </fieldset>
  );
}

function IdentityFields({displayName, emoji, onDisplayName, onEmoji}: {
  displayName: string;
  emoji: string;
  onDisplayName: (value: string) => void;
  onEmoji: (value: string) => void;
}) {
  return (
    <div className="arrival-fields">
      <div className="arrival-identity-row">
        <label className="arrival-symbol">Symbol<input required aria-label="Your room symbol" maxLength={8} value={emoji} onChange={(event) => onEmoji(event.target.value)} /></label>
        <label>Name<input required autoComplete="name" maxLength={32} value={displayName} onChange={(event) => onDisplayName(event.target.value)} /></label>
      </div>
    </div>
  );
}

export function ArrivalVeil({
  state,
  backgroundRef,
  onCreate,
  onCopyInvitation,
  onEnterCreatedRoom,
  onEnter,
  onNotNow,
  onRetry,
  onReturnHome,
  onConfirmIdentity,
  onLeaveRoom,
}: ArrivalVeilProps) {
  const dialogRef = useRef<HTMLElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  const [displayName, setDisplayName] = useState(
    state.kind === 'creating' && state.step === 'form' ? state.initialDisplayName ?? ''
      : state.kind === 'invited' || state.kind === 'returning' ? state.displayName ?? '' : '',
  );
  const [emoji, setEmoji] = useState(
    state.kind === 'creating' && state.step === 'form' ? state.initialEmoji ?? '🫧'
      : state.kind === 'invited' || state.kind === 'returning' ? state.emoji ?? '🫧' : '🫧',
  );
  const [setup, setSetup] = useState<ArrivalProfile['setup']>('quiet');
  const [invitationCode, setInvitationCode] = useState('');
  const identityKey = state.kind === 'creating' && state.step === 'form' ? 'creating'
    : state.kind === 'invited' || state.kind === 'returning' ? `${state.kind}:${state.roomName}` : state.kind;
  const previousIdentityKey = useRef(identityKey);
  const modal = !['admitted', 'reconnecting'].includes(state.kind);
  const focusKey = `${state.kind}:${state.kind === 'creating' ? state.step : ''}`;

  useContainedFocus(dialogRef, modal, focusKey);

  useEffect(() => {
    if (previousIdentityKey.current === identityKey) return;
    previousIdentityKey.current = identityKey;
    setSetup('quiet');
    setInvitationCode('');
    if (state.kind === 'creating' && state.step === 'form') {
      setDisplayName(state.initialDisplayName ?? '');
      setEmoji(state.initialEmoji ?? '🫧');
    } else if (state.kind === 'invited' || state.kind === 'returning') {
      setDisplayName(state.displayName ?? '');
      setEmoji(state.emoji ?? '🫧');
    }
  }, [identityKey, state]);

  useEffect(() => {
    if (!modal) return;
    const background = backgroundRef?.current ?? document.querySelector<HTMLElement>('[data-arrival-background]');
    if (!background || background.contains(dialogRef.current)) return;
    const previousInert = background.inert;
    const previousHidden = background.getAttribute('aria-hidden');
    background.inert = true;
    background.setAttribute('aria-hidden', 'true');
    return () => {
      background.inert = previousInert;
      if (previousHidden === null) background.removeAttribute('aria-hidden');
      else background.setAttribute('aria-hidden', previousHidden);
    };
  }, [backgroundRef, modal, focusKey]);

  if (state.kind === 'admitted') return null;

  if (state.kind === 'reconnecting') {
    return (
      <aside className="arrival-reconnecting" role="status" aria-live="polite">
        <WifiOff size={15} aria-hidden="true" />
        <span><strong>Reconnecting…</strong> Room changes are paused.</span>
        {onLeaveRoom && <button type="button" onClick={onLeaveRoom}>Leave room</button>}
      </aside>
    );
  }

  const submitCreate = (event: FormEvent) => {
    event.preventDefault();
    const nextName = displayName.trim();
    const nextEmoji = emoji.trim();
    if (nextName && nextEmoji) onCreate?.({displayName: nextName, emoji: nextEmoji, setup});
  };
  const submitEntry = (event: FormEvent) => {
    event.preventDefault();
    const nextName = displayName.trim();
    const nextEmoji = emoji.trim();
    const nextInvitation = invitationCode.trim();
    if (nextName && nextEmoji && (!(state.kind === 'invited' && state.invitationRequired) || nextInvitation)) {
      onEnter?.({displayName: nextName, emoji: nextEmoji, setup, ...(nextInvitation ? {invitationCode: nextInvitation} : {})});
    }
  };

  return (
    <div className="arrival-overlay">
      <section
        ref={dialogRef}
        className="arrival-veil"
        role={state.kind === 'revoked' ? 'alertdialog' : 'dialog'}
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        tabIndex={-1}
      >
        <div className="arrival-mark" aria-hidden="true"><Flame size={19} fill="currentColor" /></div>

        {state.kind === 'creating' && state.step === 'form' && (
          <form aria-busy={state.submitting || undefined} onSubmit={submitCreate}>
            <p className="arrival-kicker">New room</p>
            <h2 id={titleId} tabIndex={-1} data-initial-focus>Make a room</h2>
            <p id={descriptionId}>A quiet place for two to eight people to focus and meet at the break.</p>
            <IdentityFields displayName={displayName} emoji={emoji} onDisplayName={setDisplayName} onEmoji={setEmoji} />
            <SetupChoice savedAvailable={state.savedSetupAvailable} setup={setup} onChange={setSetup} />
            {state.error && <p className="arrival-error" role="alert">{state.error}</p>}
            <button className="arrival-primary" type="submit" disabled={state.submitting || !displayName.trim() || !emoji.trim()}>{state.submitting ? 'Creating room…' : 'Create room'}</button>
            <small>No invitation is sent until you copy it.</small>
          </form>
        )}

        {state.kind === 'creating' && state.step === 'ready' && (
          <div>
            <p className="arrival-kicker">{state.roomName}</p>
            <h2 id={titleId} tabIndex={-1} data-initial-focus>Your room is ready.</h2>
            <p id={descriptionId}>Invite someone, then enter. Inside, choose one outcome and start the shared focus.</p>
            <div className="arrival-actions arrival-actions-stack">
              <button className="arrival-primary" type="button" onClick={() => { void onCopyInvitation?.(); }} disabled={state.copying}>{state.copied ? <Check size={16} /> : <Copy size={16} />}{state.copying ? 'Creating invitation…' : state.copied ? 'Invitation copied' : 'Copy invitation'}</button>
              <button className="arrival-secondary" type="button" onClick={onEnterCreatedRoom}>{state.invitationPayload ? 'Enter the room' : 'Continue solo'}</button>
            </div>
            {state.invitationPayload && <label className="arrival-invitation-ready">Invitation ready<textarea readOnly value={state.invitationPayload} onFocus={(event) => event.currentTarget.select()} /><small>If copying is unavailable, select and copy this invitation.</small></label>}
            <span className="arrival-live" aria-live="polite">{state.copied ? 'Invitation copied.' : ''}</span>
          </div>
        )}

        {(state.kind === 'invited' || state.kind === 'returning') && (
          <form aria-busy={state.entering || undefined} onSubmit={submitEntry}>
            <p className="arrival-kicker">{state.kind === 'returning' ? 'Welcome back' : state.invitationRequired ? 'Private room invitation' : state.inviterName ? `${state.inviterName} invited you as a ${state.role}` : `Invited as a ${state.role}`}</p>
            <h2 id={titleId} tabIndex={-1} data-initial-focus>Enter {state.roomName}</h2>
            <p id={descriptionId}>{phaseCopy[state.phase]}</p>
            <IdentityFields displayName={displayName} emoji={emoji} onDisplayName={setDisplayName} onEmoji={setEmoji} />
            {state.kind === 'invited' && state.invitationRequired && <label className="arrival-invitation-code">Invitation code<input required autoComplete="off" spellCheck="false" maxLength={80} value={invitationCode} onChange={(event) => setInvitationCode(event.target.value)} placeholder="mgi1.…" /></label>}
            <SetupChoice savedAvailable={state.savedSetupAvailable} setup={setup} onChange={setSetup} />
            {state.error && <p className="arrival-error" role="alert">{state.error}</p>}
            <div className="arrival-actions">
              <button className="arrival-primary" type="submit" disabled={state.entering || !displayName.trim() || !emoji.trim() || (state.kind === 'invited' && state.invitationRequired && !invitationCode.trim())}>{state.entering ? 'Entering…' : 'Enter quietly'}</button>
              {onNotNow && <button className="arrival-secondary" type="button" onClick={onNotNow}>Not now</button>}
            </div>
          </form>
        )}

        {state.kind === 'proving' && (
          <div aria-busy="true">
            <p className="arrival-kicker">Magma</p>
            <h2 id={titleId} tabIndex={-1} data-initial-focus>Opening the room…</h2>
            <p id={descriptionId}>Checking the door before anything begins.</p>
          </div>
        )}

        {state.kind === 'denied' && (
          <div>
            <div className="arrival-state-icon" aria-hidden="true"><LockKeyhole size={18} /></div>
            <p className="arrival-kicker">Room access</p>
            <h2 id={titleId} tabIndex={-1} data-initial-focus>{state.reason === 'identity' ? 'Confirm your identity' : 'You can’t enter yet.'}</h2>
            <p id={descriptionId}>{state.reason === 'identity' ? 'Confirm your identity to return to this room.' : deniedCopy[state.reason]}</p>
            <div className="arrival-actions">
              {state.reason === 'identity' && onConfirmIdentity && <button className="arrival-primary" type="button" onClick={onConfirmIdentity}>Confirm identity</button>}
              {state.reason !== 'identity' && state.retryable && onRetry && <button className="arrival-primary" type="button" onClick={onRetry}>Try again</button>}
              {onReturnHome && <button className="arrival-secondary" type="button" onClick={onReturnHome}>Return home</button>}
            </div>
          </div>
        )}

        {state.kind === 'revoked' && (
          <div>
            <div className="arrival-state-icon" aria-hidden="true"><X size={18} /></div>
            <p className="arrival-kicker">{state.roomName}</p>
            <h2 id={titleId} tabIndex={-1} data-initial-focus>Your access has ended.</h2>
            <p id={descriptionId}>Contributions already accepted by the room remain there.</p>
            {onLeaveRoom && <button className="arrival-primary" type="button" onClick={onLeaveRoom}>Leave room</button>}
          </div>
        )}
      </section>
    </div>
  );
}

export type InvitationStatus = 'active' | 'paused';

export type RoomAccessProps = {
  role: RoomRole;
  invitationStatus?: InvitationStatus;
  busy?: 'copying' | 'pausing' | 'rotating' | null;
  copied?: boolean;
  onCopyInvitation?: (role: Exclude<RoomRole, 'owner'>) => void | boolean | Promise<void | boolean>;
  onSetInvitationPaused?: (paused: boolean) => void;
  onRotateInvitation?: (role: Exclude<RoomRole, 'owner'>) => void | boolean | Promise<void | boolean>;
};

export function RoomAccess({
  role,
  invitationStatus = 'active',
  busy = null,
  copied = false,
  onCopyInvitation,
  onSetInvitationPaused,
  onRotateInvitation,
}: RoomAccessProps) {
  const titleId = useId();
  const confirmTitleId = useId();
  const confirmDescriptionId = useId();
  const confirmRef = useRef<HTMLElement>(null);
  const rotateButtonRef = useRef<HTMLButtonElement>(null);
  const [confirmingRotation, setConfirmingRotation] = useState(false);
  const [localNotice, setLocalNotice] = useState('');
  const [inviteRole, setInviteRole] = useState<Exclude<RoomRole, 'owner'>>('member');
  const canManage = role === 'owner' || role === 'steward';
  const closeRotation = useCallback(() => setConfirmingRotation(false), []);

  useContainedFocus(confirmRef, confirmingRotation, 'rotate-invitation', closeRotation);

  useEffect(() => {
    if (!confirmingRotation && rotateButtonRef.current && localNotice === 'Rotation cancelled.') rotateButtonRef.current.focus();
  }, [confirmingRotation, localNotice]);

  const cancelRotation = () => {
    setLocalNotice('Rotation cancelled.');
    setConfirmingRotation(false);
  };
  const rotate = async () => {
    try {
      const accepted = await onRotateInvitation?.(inviteRole);
      if (accepted === false) {
        setLocalNotice('The invitation was not rotated.');
        return;
      }
      setLocalNotice('New invitation ready. Previous links no longer open the room.');
      setConfirmingRotation(false);
    } catch {
      setLocalNotice('The invitation was not rotated.');
    }
  };

  return (
    <section className="room-access" aria-labelledby={titleId}>
      <div className="room-access-heading">
        <div><p>Private room</p><h3 id={titleId}>Access</h3></div>
        <span className="room-role">{role}</span>
      </div>
      {!canManage ? (
        <p className="room-access-role-copy">You’re here as {role === 'member' ? 'a member' : 'a guest'}.</p>
      ) : (
        <>
          <div className="room-invitation-state">
            <span className={`room-access-dot ${invitationStatus}`} aria-hidden="true" />
            <span><strong>New invitation</strong><small>Separate 7-day code · up to 8 arrivals</small></span>
          </div>
          <label className="room-access-role-select">Role<select value={inviteRole} onChange={(event) => setInviteRole(event.target.value as Exclude<RoomRole, 'owner'>)}>{role === 'owner' && <option value="steward">Steward</option>}<option value="member">Member</option><option value="guest">Guest · read only board</option></select></label>
          <div className="room-access-actions">
            {onCopyInvitation && <button type="button" disabled={busy !== null} onClick={() => { setLocalNotice(''); void onCopyInvitation(inviteRole); }}>{copied ? <Check size={15} /> : <Copy size={15} />}{busy === 'copying' ? 'Creating…' : copied ? 'Copied' : 'Create invitation'}</button>}
            {onSetInvitationPaused && <button type="button" disabled={busy !== null} onClick={() => onSetInvitationPaused(invitationStatus === 'active')}>{invitationStatus === 'active' ? <LockKeyhole size={15} /> : <Link2 size={15} />}{busy === 'pausing' ? 'Updating…' : invitationStatus === 'active' ? 'Pause arrivals' : 'Allow arrivals'}</button>}
            {onRotateInvitation && <button ref={rotateButtonRef} type="button" disabled={busy !== null} onClick={() => { setLocalNotice(''); setConfirmingRotation(true); }}><RotateCw size={15} />Rotate invitation</button>}
          </div>
        </>
      )}
      <p className="room-access-notice" role="status" aria-live="polite">{copied ? 'Invitation copied.' : localNotice}</p>

      {confirmingRotation && (
        <div className="room-access-confirm-backdrop">
          <section ref={confirmRef} className="room-access-confirm" role="alertdialog" aria-modal="true" aria-labelledby={confirmTitleId} aria-describedby={confirmDescriptionId} tabIndex={-1}>
            <h4 id={confirmTitleId} tabIndex={-1} data-initial-focus>Rotate the guest invitation?</h4>
            <p id={confirmDescriptionId}>Previous unredeemed links will stop working. People already admitted stay in the room.</p>
            <div className="room-access-confirm-actions">
              <button type="button" onClick={cancelRotation}>Keep current link</button>
              <button className="danger" type="button" disabled={busy === 'rotating'} onClick={() => { void rotate(); }}>{busy === 'rotating' ? 'Rotating…' : 'Rotate invitation'}</button>
            </div>
          </section>
        </div>
      )}
    </section>
  );
}
