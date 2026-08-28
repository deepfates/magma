import {useCallback, useEffect, useRef, useState} from 'react';
import type PartySocket from 'partysocket';
import {connectWorkspace} from './store';
import {createTimer, remainingAt, type TimerCommand, type TimerState} from './domain/timer';

export type Participant = {
  id: string;
  name: string;
  color: string;
  emoji: string;
  intention: string;
};

export type Reaction = {id: string; emoji: string; from: string};

const COLORS = ['#ff7a90', '#9d8cff', '#65d9c4', '#ffd071', '#7ab8ff'];
const EMOJIS = ['🫧', '🪩', '🧃', '🌋', '🪼'];

const participantIdentity = () => {
  const saved = localStorage.getItem('magma:identity');
  if (saved) return JSON.parse(saved) as Omit<Participant, 'id'>;
  const suffix = Math.floor(100 + Math.random() * 900);
  const identity = {
    name: `Glow ${suffix}`,
    color: COLORS[Math.floor(Math.random() * COLORS.length)],
    emoji: EMOJIS[Math.floor(Math.random() * EMOJIS.length)],
    intention: '',
  };
  localStorage.setItem('magma:identity', JSON.stringify(identity));
  return identity;
};

export const useRoom = (room: string) => {
  const identity = useRef(participantIdentity());
  const socketRef = useRef<PartySocket | null>(null);
  const [connected, setConnected] = useState(false);
  const [timer, setTimer] = useState<TimerState>(createTimer());
  const [serverOffset, setServerOffset] = useState(0);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [reactions, setReactions] = useState<Reaction[]>([]);

  useEffect(() => {
    let disposed = false;
    let cleanup: (() => Promise<void>) | undefined;

    connectWorkspace(room).then((connection) => {
      if (disposed) return connection.destroy();
      cleanup = connection.destroy;
      socketRef.current = connection.socket;

      const hello = () => {
        setConnected(true);
        connection.socket.send(JSON.stringify({type: 'hello', participant: identity.current}));
      };
      const close = () => setConnected(false);
      const message = (event: MessageEvent) => {
        if (typeof event.data !== 'string' || event.data.startsWith('tinybase:')) return;
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'snapshot') {
            setTimer(data.timer);
            setParticipants(data.participants);
            setServerOffset(data.serverNow - Date.now());
          }
          if (data.type === 'reaction') {
            setReactions((current) => [...current.slice(-7), data]);
            window.setTimeout(
              () => setReactions((current) => current.filter((item) => item.id !== data.id)),
              2800,
            );
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
      cleanup?.();
    };
  }, [room]);

  const command = useCallback((value: TimerCommand) => {
    socketRef.current?.send(JSON.stringify({type: 'timer.command', command: value}));
  }, []);

  const react = useCallback((emoji: string) => {
    socketRef.current?.send(JSON.stringify({type: 'reaction', emoji}));
  }, []);

  const remaining = useCallback(
    () => remainingAt(timer, Date.now() + serverOffset),
    [serverOffset, timer],
  );

  return {
    connected,
    timer,
    participants,
    reactions,
    identity: identity.current,
    remaining,
    command,
    react,
  };
};
