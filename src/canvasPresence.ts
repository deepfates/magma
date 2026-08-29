import type {Profile} from './domain/protocol';

export const CANVAS_POSTURES = ['idle', 'pointing', 'selecting', 'drawing', 'typing'] as const;
export type CanvasPosture = typeof CANVAS_POSTURES[number];

export type CanvasViewport = {
  scrollX: number;
  scrollY: number;
  zoom: number;
};

export type CanvasPresenceUpdate = {
  pointer: {x: number; y: number} | null;
  button: 'up' | 'down';
  selectedElementIds: string[];
  viewport: CanvasViewport;
  posture: CanvasPosture;
};

export type CanvasPresence = CanvasPresenceUpdate & {
  memberId: string;
  name: string;
  color: string;
  updatedAt: number;
};

export type CanvasPresenceClientMessage =
  | {type: 'presence.hello'; profile: Pick<Profile, 'memberId' | 'name' | 'color'>}
  | ({type: 'presence.update'} & CanvasPresenceUpdate);

export type CanvasPresenceServerMessage =
  | {type: 'presence.snapshot'; presences: CanvasPresence[]}
  | {type: 'presence.state'; presence: CanvasPresence}
  | {type: 'presence.leave'; memberId: string};

const MEMBER_ID = /^[A-Za-z0-9_-]{8,64}$/;
const COLOR = /^#[0-9a-fA-F]{6}$/;
const finiteBetween = (value: unknown, minimum: number, maximum: number): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= minimum && value <= maximum;

export const sanitizeCanvasProfile = (
  profile: Pick<Profile, 'memberId' | 'name' | 'color'>,
  trustedMemberId?: string | null,
): Pick<Profile, 'memberId' | 'name' | 'color'> | null => {
  const memberId = trustedMemberId ?? (typeof profile.memberId === 'string' ? profile.memberId : '');
  const name = typeof profile.name === 'string' ? profile.name.trim().slice(0, 32) : '';
  const color = typeof profile.color === 'string' && COLOR.test(profile.color) ? profile.color : '#9d8cff';
  return MEMBER_ID.test(memberId) && name ? {memberId, name, color} : null;
};

export const parseCanvasPresenceClientMessage = (value: unknown): CanvasPresenceClientMessage | null => {
  if (!value || typeof value !== 'object') return null;
  const message = value as Record<string, unknown>;
  if (message.type === 'presence.hello') {
    if (!message.profile || typeof message.profile !== 'object') return null;
    const profile = message.profile as Record<string, unknown>;
    if (typeof profile.memberId !== 'string' || typeof profile.name !== 'string' || typeof profile.color !== 'string') return null;
    return {type: 'presence.hello', profile: {memberId: profile.memberId, name: profile.name, color: profile.color}};
  }
  if (message.type !== 'presence.update') return null;
  const pointer = message.pointer === null ? null : message.pointer && typeof message.pointer === 'object'
    && finiteBetween((message.pointer as Record<string, unknown>).x, -10_000_000, 10_000_000)
    && finiteBetween((message.pointer as Record<string, unknown>).y, -10_000_000, 10_000_000)
    ? {x: Number((message.pointer as Record<string, unknown>).x), y: Number((message.pointer as Record<string, unknown>).y)}
    : undefined;
  if (pointer === undefined || !['up', 'down'].includes(String(message.button))
    || !CANVAS_POSTURES.includes(message.posture as CanvasPosture)
    || !Array.isArray(message.selectedElementIds) || message.selectedElementIds.length > 64
    || message.selectedElementIds.some((id) => typeof id !== 'string' || id.length < 1 || id.length > 128)
    || !message.viewport || typeof message.viewport !== 'object') return null;
  const viewport = message.viewport as Record<string, unknown>;
  if (!finiteBetween(viewport.scrollX, -10_000_000, 10_000_000)
    || !finiteBetween(viewport.scrollY, -10_000_000, 10_000_000)
    || !finiteBetween(viewport.zoom, 0.05, 30)) return null;
  return {
    type: 'presence.update', pointer, button: message.button as 'up' | 'down',
    selectedElementIds: [...new Set(message.selectedElementIds as string[])],
    viewport: {scrollX: viewport.scrollX, scrollY: viewport.scrollY, zoom: viewport.zoom},
    posture: message.posture as CanvasPosture,
  };
};

const parseCanvasPresence = (value: unknown): CanvasPresence | null => {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Record<string, unknown>;
  const profile = sanitizeCanvasProfile({
    memberId: String(candidate.memberId ?? ''), name: String(candidate.name ?? ''), color: String(candidate.color ?? ''),
  });
  const update = parseCanvasPresenceClientMessage({
    type: 'presence.update', pointer: candidate.pointer, button: candidate.button,
    selectedElementIds: candidate.selectedElementIds, viewport: candidate.viewport, posture: candidate.posture,
  });
  if (!profile || update?.type !== 'presence.update' || !finiteBetween(candidate.updatedAt, 0, 10_000_000_000_000)) return null;
  const {type: _type, ...presenceUpdate} = update;
  return {...presenceUpdate, ...profile, updatedAt: candidate.updatedAt};
};

export const parseCanvasPresenceServerMessage = (value: unknown): CanvasPresenceServerMessage | null => {
  if (!value || typeof value !== 'object') return null;
  const message = value as Record<string, unknown>;
  if (message.type === 'presence.snapshot' && Array.isArray(message.presences) && message.presences.length <= 64) {
    const presences = message.presences.map(parseCanvasPresence);
    return presences.every((presence): presence is CanvasPresence => presence !== null)
      ? {type: 'presence.snapshot', presences}
      : null;
  }
  if (message.type === 'presence.state') {
    const presence = parseCanvasPresence(message.presence);
    return presence ? {type: 'presence.state', presence} : null;
  }
  return message.type === 'presence.leave' && typeof message.memberId === 'string' && MEMBER_ID.test(message.memberId)
    ? {type: 'presence.leave', memberId: message.memberId}
    : null;
};

type BoundProfile = Pick<Profile, 'memberId' | 'name' | 'color'>;

/** In-memory member projection. Scene persistence never receives this state. */
export class CanvasPresenceIndex {
  private readonly connections = new Map<string, BoundProfile>();
  private readonly memberConnections = new Map<string, Set<string>>();
  private readonly active = new Map<string, {connectionId: string; presence: CanvasPresence}>();

  identify(connectionId: string, profile: BoundProfile, trustedMemberId?: string | null): CanvasPresence | null {
    const accepted = sanitizeCanvasProfile(profile, trustedMemberId);
    if (!accepted) return null;
    const previous = this.connections.get(connectionId);
    if (previous && previous.memberId !== accepted.memberId) this.detachConnection(connectionId, previous.memberId);
    this.connections.set(connectionId, accepted);
    const memberConnections = this.memberConnections.get(accepted.memberId) ?? new Set<string>();
    memberConnections.add(connectionId);
    this.memberConnections.set(accepted.memberId, memberConnections);
    for (const candidateId of memberConnections) this.connections.set(candidateId, accepted);
    const active = this.active.get(accepted.memberId);
    if (!active) return null;
    active.presence = {...active.presence, ...accepted};
    return active.presence;
  }

  update(connectionId: string, update: CanvasPresenceUpdate, now: number): CanvasPresence | null {
    const profile = this.connections.get(connectionId);
    if (!profile) return null;
    const presence: CanvasPresence = {...update, ...profile, updatedAt: now};
    this.active.set(profile.memberId, {connectionId, presence});
    return presence;
  }

  leave(connectionId: string): string | null {
    const profile = this.connections.get(connectionId);
    if (!profile) return null;
    this.detachConnection(connectionId, profile.memberId);
    const active = this.active.get(profile.memberId);
    if (active?.connectionId !== connectionId) return null;
    this.active.delete(profile.memberId);
    return profile.memberId;
  }

  snapshot(): CanvasPresence[] {
    return [...this.active.values()].map(({presence}) => presence);
  }

  private detachConnection(connectionId: string, memberId: string) {
    this.connections.delete(connectionId);
    const memberConnections = this.memberConnections.get(memberId);
    memberConnections?.delete(connectionId);
    if (!memberConnections?.size) this.memberConnections.delete(memberId);
  }
}
