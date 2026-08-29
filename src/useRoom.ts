import {useCallback, useEffect, useRef, useState} from 'react';
import type PartySocket from 'partysocket';
import {connectWorkspace} from './store';
import {createTimer, remainingAt, type TimerCommand, type TimerDurations, type TimerState} from './domain/timer';
import {createMediaState, type MediaCommand, type RoomMediaState} from './domain/media';
import type {Participant, Profile, RoomSnapshot, SessionArtifact, TimerProposal} from './domain/protocol';

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

export const useRoom = (room: string) => {
  const [profile, setProfile] = useState<Profile>(loadProfile);
  const profileRef = useRef(profile);
  const socketRef = useRef<PartySocket | null>(null);
  const bestRtt = useRef(Number.POSITIVE_INFINITY);
  const [connected, setConnected] = useState(false);
  const [timer, setTimer] = useState<TimerState>(createTimer());
  const [media, setMedia] = useState<RoomMediaState>(createMediaState());
  const [mediaReady, setMediaReady] = useState(false);
  const [serverOffset, setServerOffset] = useState(0);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [hostId, setHostId] = useState<string | null>(null);
  const [proposal, setProposal] = useState<TimerProposal | null>(null);
  const [artifacts, setArtifacts] = useState<SessionArtifact[]>([]);
  const [completion, setCompletion] = useState<SessionArtifact | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [reactions, setReactions] = useState<Reaction[]>([]);

  useEffect(() => {
    profileRef.current = profile;
    localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
  }, [profile]);

  useEffect(() => {
    let disposed = false;
    let cleanup: (() => Promise<void>) | undefined;
    let pingInterval = 0;

    connectWorkspace(room, profileRef.current).then((connection) => {
      if (disposed) return connection.destroy();
      cleanup = connection.destroy;
      socketRef.current = connection.socket;

      const ping = () => connection.socket.send(JSON.stringify({type: 'clock.ping', clientSentAt: Date.now()}));
      const hello = () => {
        setConnected(true);
        connection.socket.send(JSON.stringify({type: 'hello', profile: profileRef.current}));
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
            if (snapshot.media) {
              setMedia(snapshot.media);
              setMediaReady(true);
            }
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
          if (data.type === 'reaction') {
            setReactions((current) => [...current.slice(-7), data]);
            window.setTimeout(() => setReactions((current) => current.filter((item) => item.id !== data.id)), 2800);
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
    };
  }, [room]);

  const send = useCallback((message: object) => socketRef.current?.send(JSON.stringify(message)), []);
  const command = useCallback((value: TimerCommand) => send({type: 'timer.command', command: value, expectedRevision: timer.revision}), [send, timer.revision]);
  const react = useCallback((emoji: string) => send({type: 'reaction', emoji}), [send]);
  const updateProfile = useCallback((patch: Partial<Omit<Profile, 'memberId'>>) => {
    setProfile((current) => {
      const next = {...current, ...patch};
      profileRef.current = next;
      localStorage.setItem(PROFILE_KEY, JSON.stringify(next));
      send({type: 'hello', profile: next});
      return next;
    });
  }, [send]);
  const updateSettings = useCallback((durations: TimerDurations, autoAdvance: boolean) => send({type: 'timer.settings', durations, autoAdvance}), [send]);
  const mediaCommand = useCallback((command: MediaCommand) => send({type: 'media.command', command, expectedRevision: media.revision}), [media.revision, send]);
  const approve = useCallback((proposalId: string) => send({type: 'timer.approve', proposalId}), [send]);
  const dismiss = useCallback((proposalId: string) => send({type: 'timer.dismiss', proposalId}), [send]);
  const transferHost = useCallback((memberId: string) => send({type: 'host.transfer', memberId}), [send]);
  const remaining = useCallback(() => remainingAt(timer, Date.now() + serverOffset), [serverOffset, timer]);
  const roomNow = useCallback(() => Date.now() + serverOffset, [serverOffset]);

  return {
    connected,
    timer,
    media,
    mediaReady,
    participants,
    hostId,
    isHost: hostId === profile.memberId,
    proposal,
    artifacts,
    completion,
    dismissCompletion: () => setCompletion(null),
    notice,
    reactions,
    profile,
    remaining,
    roomNow,
    command,
    react,
    updateProfile,
    updateSettings,
    mediaCommand,
    approve,
    dismiss,
    transferHost,
  };
};
