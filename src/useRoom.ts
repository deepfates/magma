import {useCallback, useEffect, useRef, useState} from 'react';
import type PartySocket from 'partysocket';
import {clearWorkspaceCache, connectWorkspace} from './store';
import {createTimer, remainingAt, type TimerCommand, type TimerDurations, type TimerState} from './domain/timer';
import {createMediaState, type MediaCommand, type RoomMediaState} from './domain/media';
import {createMediaQueue, type DeckPolicy, type MediaQueueState} from './domain/mediaQueue';
import type {YouTubeSource} from './domain/youtube';
import type {Participant, Profile, RoomSnapshot, SessionArtifact, TimerProposal} from './domain/protocol';
import type {PorchMessage, PresenceChoice, RoomCueId, RoomSignal, SocialRelease} from './domain/porch';
import type {RoomAdmission} from './accessClient';

export type Reaction = {id: string; emoji: string; from: string};

const COLORS = ['#ff7a90', '#9d8cff', '#65d9c4', '#ffd071', '#7ab8ff'];
const EMOJIS = ['🫧', '🪩', '🧃', '🌋', '🪼'];
const PROFILE_KEY = 'magma:profile';

const newProfile = (): Profile => ({
  memberId: crypto.randomUUID(),
  name: `Glow ${Math.floor(100 + Math.random() * 900)}`,
  color: COLORS[Math.floor(Math.random() * COLORS.length)],
  emoji: EMOJIS[Math.floor(Math.random() * EMOJIS.length)],
  intention: '',
});

const loadProfile = (): Profile => {
  try {
    const saved = localStorage.getItem(PROFILE_KEY);
    if (!saved) return newProfile();
    const parsed = JSON.parse(saved) as Partial<Profile>;
    if (!parsed.memberId || !parsed.name) return newProfile();
    return {...newProfile(), ...parsed};
  } catch {
    return newProfile();
  }
};

export const useRoom = (
  room: string,
  admission?: RoomAdmission | null,
  refreshAdmission?: () => Promise<RoomAdmission>,
) => {
  const [profile, setProfile] = useState<Profile>(loadProfile);
  const profileRef = useRef(profile);
  const socketRef = useRef<PartySocket | null>(null);
  const bestRtt = useRef(Number.POSITIVE_INFINITY);
  const [connected, setConnected] = useState(false);
  const [timer, setTimer] = useState<TimerState>(createTimer());
  const [media, setMedia] = useState<RoomMediaState>(createMediaState());
  const [mediaQueue, setMediaQueue] = useState<MediaQueueState>(() => createMediaQueue(createMediaState().source));
  const [mediaReady, setMediaReady] = useState(false);
  const [serverOffset, setServerOffset] = useState(0);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [hostId, setHostId] = useState<string | null>(null);
  const [proposal, setProposal] = useState<TimerProposal | null>(null);
  const [artifacts, setArtifacts] = useState<SessionArtifact[]>([]);
  const [completion, setCompletion] = useState<SessionArtifact | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [reactions, setReactions] = useState<Reaction[]>([]);
  const [porchMessages, setPorchMessages] = useState<PorchMessage[]>([]);
  const [signals, setSignals] = useState<RoomSignal[]>([]);
  const [socialRelease, setSocialRelease] = useState<SocialRelease | null>(null);
  const [socialBloom, setSocialBloom] = useState<SocialRelease | null>(null);
  const pendingPorchMessages = useRef(new Map<string, {text: string; resolve: (accepted: boolean) => void; timeoutId: number}>());
  const pendingInvitations = useRef(new Map<string, {resolve: (capability: string | null) => void; timeoutId: number}>());
  const seenReleases = useRef(new Set<string>());
  const sessionMemberId = admission?.membershipId ?? profile.memberId;
  const accessKey = admission === null ? 'pending' : admission?.membershipId ?? 'legacy';
  const wireProfile = useCallback((): Profile => ({...profileRef.current, memberId: admission?.membershipId ?? profileRef.current.memberId}), [admission?.membershipId]);

  useEffect(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(`magma:social-releases:${room}`) ?? '[]');
      seenReleases.current = new Set(Array.isArray(stored) ? stored.filter((id): id is string => typeof id === 'string').slice(-32) : []);
    } catch {
      seenReleases.current = new Set();
    }
  }, [room]);

  useEffect(() => {
    profileRef.current = profile;
    localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
  }, [profile]);

  useEffect(() => {
    if (admission === null) {
      socketRef.current = null;
      setConnected(false);
      setTimer(createTimer());
      setMedia(createMediaState());
      setMediaQueue(createMediaQueue(createMediaState().source));
      setMediaReady(false);
      setParticipants([]);
      setHostId(null);
      setProposal(null);
      setArtifacts([]);
      setCompletion(null);
      setNotice(null);
      setReactions([]);
      setPorchMessages([]);
      setSignals([]);
      setSocialRelease(null);
      setSocialBloom(null);
      clearWorkspaceCache(room);
      return;
    }
    let disposed = false;
    let cleanup: (() => Promise<void>) | undefined;
    let pingInterval = 0;

    connectWorkspace(room, wireProfile(), admission ?? undefined, refreshAdmission).then((connection) => {
      if (disposed) return connection.destroy();
      cleanup = connection.destroy;
      socketRef.current = connection.socket;

      const ping = () => connection.socket.send(JSON.stringify({type: 'clock.ping', clientSentAt: Date.now()}));
      const hello = () => {
        setConnected(true);
        connection.socket.send(JSON.stringify({type: 'hello', profile: wireProfile()}));
        for (const [nonce, pending] of pendingPorchMessages.current) {
          connection.socket.send(JSON.stringify({type: 'porch.message', nonce, text: pending.text}));
        }
        ping();
        pingInterval = window.setInterval(ping, 30_000);
      };
      const close = () => {
        setConnected(false);
        window.clearInterval(pingInterval);
      };
      const message = (event: MessageEvent) => {
        if (typeof event.data !== 'string' || event.data.startsWith('tinybase:')) return;
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'snapshot') {
            const snapshot = data as RoomSnapshot;
            setTimer(snapshot.timer);
            setParticipants(snapshot.participants);
            setHostId(snapshot.hostId);
            setProposal(snapshot.proposal);
            setArtifacts(snapshot.artifacts);
            setPorchMessages(snapshot.porchMessages ?? []);
            setSocialRelease(snapshot.socialRelease ?? null);
            if (snapshot.media) {
              setMedia(snapshot.media);
              setMediaReady(true);
            }
            if (snapshot.mediaQueue) setMediaQueue(snapshot.mediaQueue);
            if (!Number.isFinite(bestRtt.current)) setServerOffset(snapshot.serverNow - Date.now());
          }
          if (data.type === 'clock.pong') {
            const receivedAt = Date.now();
            const rtt = Math.max(0, receivedAt - data.clientSentAt);
            if (rtt <= bestRtt.current) {
              bestRtt.current = rtt;
              setServerOffset(data.serverNow - (data.clientSentAt + receivedAt) / 2);
            }
          }
          if (data.type === 'session.complete') setCompletion(data.artifact);
          if (data.type === 'notice') {
            setNotice(data.message);
            window.setTimeout(() => setNotice(null), 3200);
          }
          if (data.type === 'access.revoked') window.dispatchEvent(new CustomEvent('magma:access-revoked', {detail: {room}}));
          if (data.type === 'reaction') {
            setReactions((current) => [...current.slice(-7), data]);
            window.setTimeout(() => setReactions((current) => current.filter((item) => item.id !== data.id)), 2800);
          }
          if (data.type === 'porch.message') {
            const incoming = data.message as PorchMessage;
            setPorchMessages((current) => current.some((item) => item.id === incoming.id) ? current : [...current, incoming].slice(-80));
          }
          if (data.type === 'porch.accepted' && typeof data.nonce === 'string') {
            const pending = pendingPorchMessages.current.get(data.nonce);
            if (pending) {
              pendingPorchMessages.current.delete(data.nonce);
              window.clearTimeout(pending.timeoutId);
              pending.resolve(true);
            }
          }
          if ((data.type === 'access.invite.created' || data.type === 'access.invite.rejected') && typeof data.nonce === 'string') {
            const pending = pendingInvitations.current.get(data.nonce);
            if (pending) {
              pendingInvitations.current.delete(data.nonce);
              window.clearTimeout(pending.timeoutId);
              pending.resolve(data.type === 'access.invite.created' && typeof data.capability === 'string' ? data.capability : null);
            }
          }
          if (data.type === 'social.signal') {
            const incoming = data.signal as RoomSignal;
            setSignals((current) => [...current.slice(-7), incoming]);
            window.setTimeout(() => setSignals((current) => current.filter((item) => item.id !== incoming.id)), 3200);
          }
          if (data.type === 'social.bloom' && data.release && typeof data.release.releaseId === 'string' && !seenReleases.current.has(data.release.releaseId)) {
            const release = data.release as SocialRelease;
            seenReleases.current.add(release.releaseId);
            if (seenReleases.current.size > 32) seenReleases.current.delete(seenReleases.current.values().next().value!);
            localStorage.setItem(`magma:social-releases:${room}`, JSON.stringify([...seenReleases.current]));
            setSocialRelease(release);
            setSocialBloom(release);
            window.setTimeout(() => setSocialBloom((current) => current?.releaseId === release.releaseId ? null : current), 3600);
          }
        } catch {
          // TinyBase and future room messages may share this socket.
        }
      };

      connection.socket.addEventListener('open', hello);
      connection.socket.addEventListener('close', close);
      connection.socket.addEventListener('message', message);
      if (connection.socket.readyState === WebSocket.OPEN) hello();
    });

    return () => {
      disposed = true;
      socketRef.current = null;
      window.clearInterval(pingInterval);
      cleanup?.();
      for (const pending of pendingPorchMessages.current.values()) {
        window.clearTimeout(pending.timeoutId);
        pending.resolve(false);
      }
      pendingPorchMessages.current.clear();
      for (const pending of pendingInvitations.current.values()) {
        window.clearTimeout(pending.timeoutId);
        pending.resolve(null);
      }
      pendingInvitations.current.clear();
    };
  }, [room, accessKey, wireProfile]);

  const send = useCallback((message: object) => socketRef.current?.send(JSON.stringify(message)), []);
  const command = useCallback((value: TimerCommand) => send({type: 'timer.command', command: value, expectedRevision: timer.revision}), [send, timer.revision]);
  const react = useCallback((emoji: string) => send({type: 'reaction', emoji}), [send]);
  const setPresence = useCallback((choice: PresenceChoice) => send({type: 'presence.set', choice}), [send]);
  const sendPorchMessage = useCallback((text: string) => new Promise<boolean>((resolve) => {
    const nonce = crypto.randomUUID();
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      resolve(false);
      return;
    }
    const timeoutId = window.setTimeout(() => {
      const pending = pendingPorchMessages.current.get(nonce);
      if (!pending) return;
      pendingPorchMessages.current.delete(nonce);
      pending.resolve(false);
    }, 12_000);
    pendingPorchMessages.current.set(nonce, {text, resolve, timeoutId});
    socket.send(JSON.stringify({type: 'porch.message', nonce, text}));
  }), []);
  const signal = useCallback((cueId: RoomCueId) => send({type: 'social.signal', nonce: crypto.randomUUID(), cueId}), [send]);
  const createInvitation = useCallback((role: 'steward' | 'member' | 'guest' = 'member', rotate = false) => new Promise<string | null>((resolve) => {
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN || !admission) {
      resolve(null);
      return;
    }
    const nonce = crypto.randomUUID();
    const timeoutId = window.setTimeout(() => {
      const pending = pendingInvitations.current.get(nonce);
      if (!pending) return;
      pendingInvitations.current.delete(nonce);
      pending.resolve(null);
    }, 12_000);
    pendingInvitations.current.set(nonce, {resolve, timeoutId});
    socket.send(JSON.stringify({type: 'access.invite.create', nonce, role, rotate}));
  }), [admission]);
  const updateProfile = useCallback((patch: Partial<Omit<Profile, 'memberId'>>) => {
    setProfile((current) => {
      const next = {...current, ...patch};
      profileRef.current = next;
      localStorage.setItem(PROFILE_KEY, JSON.stringify(next));
      send({type: 'hello', profile: {...next, memberId: admission?.membershipId ?? next.memberId}});
      return next;
    });
  }, [admission?.membershipId, send]);
  const updateSettings = useCallback((durations: TimerDurations, autoAdvance: boolean) => send({
    type: 'timer.settings', durations, autoAdvance, expectedRevision: timer.revision, expectedSessionId: timer.sessionId,
  }), [send, timer.revision, timer.sessionId]);
  const mediaCommand = useCallback((command: MediaCommand) => send({
    type: 'media.command', command, expectedRevision: media.revision, expectedItemId: mediaQueue.activeItemId,
  }), [media.revision, mediaQueue.activeItemId, send]);
  const enqueueMedia = useCallback((source: YouTubeSource, activate = false) => send({
    type: 'media.queue.enqueue', opId: crypto.randomUUID(), source, activate,
  }), [send]);
  const moveMedia = useCallback((itemId: string, beforeItemId: string | null) => send({
    type: 'media.queue.move', opId: crypto.randomUUID(), itemId, beforeItemId, expectedRevision: mediaQueue.revision,
  }), [mediaQueue.revision, send]);
  const removeMedia = useCallback((itemId: string) => send({
    type: 'media.queue.remove', opId: crypto.randomUUID(), itemId, expectedRevision: mediaQueue.revision,
  }), [mediaQueue.revision, send]);
  const selectMedia = useCallback((itemId: string) => send({
    type: 'media.queue.select', opId: crypto.randomUUID(), itemId, expectedRevision: mediaQueue.revision,
  }), [mediaQueue.revision, send]);
  const setDeckPolicy = useCallback((policy: DeckPolicy) => send({
    type: 'media.queue.policy', opId: crypto.randomUUID(), policy, expectedRevision: mediaQueue.revision,
  }), [mediaQueue.revision, send]);
  const approve = useCallback((proposalId: string) => send({type: 'timer.approve', proposalId}), [send]);
  const dismiss = useCallback((proposalId: string) => send({type: 'timer.dismiss', proposalId}), [send]);
  const transferHost = useCallback((memberId: string) => send({type: 'host.transfer', memberId}), [send]);
  const revokeMember = useCallback((memberId: string) => send({type: 'access.member.revoke', memberId}), [send]);
  const remaining = useCallback(() => remainingAt(timer, Date.now() + serverOffset), [serverOffset, timer]);
  const roomNow = useCallback(() => Date.now() + serverOffset, [serverOffset]);

  return {
    connected,
    timer,
    media,
    mediaQueue,
    mediaReady,
    participants,
    hostId,
    isHost: hostId === sessionMemberId,
    proposal,
    artifacts,
    completion,
    dismissCompletion: () => setCompletion(null),
    notice,
    reactions,
    porchMessages,
    signals,
    socialRelease,
    socialBloom,
    profile: {...profile, memberId: sessionMemberId},
    role: admission?.role ?? 'member',
    workspaceWritable: admission?.role !== 'guest',
    remaining,
    roomNow,
    command,
    react,
    setPresence,
    sendPorchMessage,
    signal,
    createInvitation,
    updateProfile,
    updateSettings,
    mediaCommand,
    enqueueMedia,
    moveMedia,
    removeMedia,
    selectMedia,
    setDeckPolicy,
    approve,
    dismiss,
    transferHost,
    revokeMember,
  };
};
