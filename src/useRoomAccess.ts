import {useCallback, useEffect, useRef, useState} from 'react';
import {admitRoom, getAccessClassification, RoomAccessError, type RoomAdmission} from './accessClient';
import {loadOrCreateRoomIdentity, loadRoomIdentity, type StoredDeviceIdentity} from './deviceIdentity';
import type {AuthProfile} from './domain/auth';

export type RoomAccessSession =
  | {kind: 'checking'}
  | {kind: 'legacy'}
  | {kind: 'create'; busy: boolean; error?: string}
  | {kind: 'invitation'; busy: boolean; error?: string}
  | {
      kind: 'admitted';
      identity: StoredDeviceIdentity;
      admission: RoomAdmission;
      refreshAdmission: () => Promise<RoomAdmission>;
    }
  | {kind: 'denied'; reason: string; retryable: boolean}
  | {kind: 'revoked'};

const accessReason = (error: unknown) => error instanceof RoomAccessError ? error.reason : 'network';
const retryableReason = (reason: string) => ['network', 'http-503', 'invalid-response'].includes(reason);

export const useRoomAccess = (room: string) => {
  const [session, setSession] = useState<RoomAccessSession>({kind: 'checking'});
  const identityRef = useRef<StoredDeviceIdentity | null>(null);

  const prove = useCallback(async (identity: StoredDeviceIdentity) => admitRoom({
    room, action: 'prove', identity,
  }), [room]);

  const refreshAdmission = useCallback(async () => {
    const identity = identityRef.current;
    if (!identity) throw new RoomAccessError('identity');
    try {
      const admission = await prove(identity);
      setSession({kind: 'admitted', identity, admission, refreshAdmission});
      return admission;
    } catch (error) {
      const reason = accessReason(error);
      if (['revoked-member', 'unknown-member'].includes(reason)) setSession({kind: 'revoked'});
      throw error;
    }
  }, [prove]);

  const inspect = useCallback(async () => {
    setSession({kind: 'checking'});
    try {
      const classification = await getAccessClassification(room);
      if (classification === 'legacy-open') {
        setSession({kind: 'legacy'});
        return;
      }
      if (classification === 'unclaimed') {
        setSession({kind: 'create', busy: false});
        return;
      }
      const identity = await loadRoomIdentity(room);
      if (!identity) {
        setSession({kind: 'invitation', busy: false});
        return;
      }
      identityRef.current = identity;
      const admission = await prove(identity);
      setSession({kind: 'admitted', identity, admission, refreshAdmission});
    } catch (error) {
      const reason = accessReason(error);
      if (['revoked-member', 'unknown-member'].includes(reason)) setSession({kind: 'revoked'});
      else setSession({kind: 'denied', reason, retryable: retryableReason(reason)});
    }
  }, [prove, refreshAdmission, room]);

  useEffect(() => {
    let current = true;
    void inspect().catch(() => {
      if (current) setSession({kind: 'denied', reason: 'network', retryable: true});
    });
    return () => { current = false; };
  }, [inspect]);

  useEffect(() => {
    const revoked = (event: Event) => {
      if ((event as CustomEvent<{room?: string}>).detail?.room === room) setSession({kind: 'revoked'});
    };
    window.addEventListener('magma:access-revoked', revoked);
    return () => window.removeEventListener('magma:access-revoked', revoked);
  }, [room]);

  const create = useCallback(async (profile: AuthProfile) => {
    setSession({kind: 'create', busy: true});
    try {
      const identity = await loadOrCreateRoomIdentity(room);
      identityRef.current = identity;
      const admission = await admitRoom({room, action: 'bootstrap', identity});
      setSession({kind: 'admitted', identity, admission, refreshAdmission});
      return true;
    } catch (error) {
      const reason = accessReason(error);
      setSession({kind: 'create', busy: false, error: reason === 'already-claimed' ? 'This room was just claimed. Try entering instead.' : 'The room could not be created. Try again.'});
      return false;
    }
  }, [refreshAdmission, room]);

  const enter = useCallback(async (profile: AuthProfile, capability: string) => {
    setSession({kind: 'invitation', busy: true});
    try {
      const identity = await loadOrCreateRoomIdentity(room);
      identityRef.current = identity;
      const admission = await admitRoom({room, action: 'enroll', identity, capability});
      setSession({kind: 'admitted', identity, admission, refreshAdmission});
      return true;
    } catch (error) {
      const reason = accessReason(error);
      setSession({kind: 'invitation', busy: false, error: reason === 'invalid-invite' ? 'That invitation code is expired, used, or no longer active.' : 'The room could not confirm that invitation.'});
      return false;
    }
  }, [refreshAdmission, room]);

  return {session, create, enter, retry: inspect};
};
