import {useCallback, useEffect, useRef, useState} from 'react';
import type {SessionArtifact} from './domain/protocol';

type WakeLockSentinelLike = {release: () => Promise<void>; released?: boolean};

export const useFocusAssist = (
  running: boolean,
  completion: SessionArtifact | null,
  playChime: () => Promise<void>,
) => {
  const wakeLock = useRef<WakeLockSentinelLike | null>(null);
  const lastCompletion = useRef<string | null>(null);
  const [notifications, setNotifications] = useState(() => localStorage.getItem('magma:notifications') === 'on');

  const requestNotifications = useCallback(async () => {
    if (!('Notification' in window)) return false;
    const permission = Notification.permission === 'default' ? await Notification.requestPermission() : Notification.permission;
    const allowed = permission === 'granted';
    setNotifications(allowed);
    localStorage.setItem('magma:notifications', allowed ? 'on' : 'off');
    return allowed;
  }, []);

  useEffect(() => {
    let cancelled = false;
    const updateWakeLock = async () => {
      const wakeLockApi = (navigator as Navigator & {wakeLock?: {request: (type: 'screen') => Promise<WakeLockSentinelLike>}}).wakeLock;
      if (!wakeLockApi || document.visibilityState !== 'visible') return;
      if (running && !wakeLock.current) {
        try {
          const sentinel = await wakeLockApi.request('screen');
          if (!cancelled) wakeLock.current = sentinel;
          else await sentinel.release();
        } catch {
          // Unsupported policy and low-battery failures stay local and graceful.
        }
      }
      if (!running && wakeLock.current) {
        await wakeLock.current.release().catch(() => undefined);
        wakeLock.current = null;
      }
    };
    updateWakeLock();
    document.addEventListener('visibilitychange', updateWakeLock);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', updateWakeLock);
    };
  }, [running]);

  useEffect(() => {
    if (!completion || lastCompletion.current === completion.id) return;
    lastCompletion.current = completion.id;
    playChime();
    if (notifications && document.visibilityState === 'hidden' && Notification.permission === 'granted') {
      new Notification(completion.mode === 'focus' ? 'Focus held together' : 'Break complete', {
        body: completion.mode === 'focus' ? 'Your room is moving into a break.' : 'The room is ready when you are.',
      });
    }
  }, [completion, notifications, playChime]);

  useEffect(() => () => {
    wakeLock.current?.release().catch(() => undefined);
  }, []);

  return {notifications, requestNotifications};
};
