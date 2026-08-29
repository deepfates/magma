import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import PartySocket from 'partysocket';
import {Excalidraw} from '@excalidraw-yjs/excalidraw';
import type {AppState, Collaborator, ExcalidrawImperativeAPI, OnUserFollowedPayload, SocketId} from '@excalidraw-yjs/excalidraw/types';
import '@excalidraw-yjs/excalidraw/index.css';
import {partyHost} from './accessClient';
import type {RoomAdmission} from './accessClient';
import {
  parseCanvasPresenceServerMessage,
  type CanvasPosture,
  type CanvasPresence,
  type CanvasPresenceUpdate,
} from './canvasPresence';
import type {Profile} from './domain/protocol';

export type PorchTool = 'select' | 'draw' | 'note';

const toolType = {select: 'selection', draw: 'freedraw', note: 'text'} as const;
const uiOptions = {
  canvasActions: {
    changeViewBackgroundColor: false,
    clearCanvas: false,
    export: false,
    loadScene: false,
    saveAsImage: false,
    saveToActiveFile: false,
    toggleTheme: false,
  },
  tools: {image: false},
} as const;

const encodeUpdate = (update: Uint8Array) => {
  let binary = '';
  for (let offset = 0; offset < update.byteLength; offset += 0x8000) {
    binary += String.fromCharCode(...update.subarray(offset, offset + 0x8000));
  }
  return JSON.stringify({type: 'scene.update', update: btoa(binary)});
};

const decodeUpdate = (message: string) => {
  const value = JSON.parse(message) as {type?: unknown; update?: unknown};
  if (value.type !== 'scene.update' || typeof value.update !== 'string') return null;
  const binary = atob(value.update);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
};

const presenceFromApp = (
  appState: AppState,
  pointer: CanvasPresenceUpdate['pointer'],
  button: CanvasPresenceUpdate['button'],
): CanvasPresenceUpdate => {
  const selectedElementIds = Object.keys(appState.selectedElementIds).slice(0, 64);
  const posture: CanvasPosture = appState.editingTextElement?.type === 'text'
    ? 'typing'
    : appState.activeTool.type === 'freedraw' && button === 'down'
      ? 'drawing'
      : selectedElementIds.length
        ? 'selecting'
        : pointer
          ? 'pointing'
          : 'idle';
  return {
    pointer,
    button,
    selectedElementIds,
    viewport: {scrollX: appState.scrollX, scrollY: appState.scrollY, zoom: appState.zoom.value},
    posture,
  };
};

const useReducedMotion = () => {
  const [reduced, setReduced] = useState(() => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches);
  useEffect(() => {
    if (typeof matchMedia !== 'function') return;
    const query = matchMedia('(prefers-reduced-motion: reduce)');
    const change = () => setReduced(query.matches);
    query.addEventListener('change', change);
    return () => query.removeEventListener('change', change);
  }, []);
  return reduced;
};

function SyncedCanvas({room, profile, tool, refreshAdmission}: {
  room: string;
  profile: Profile;
  tool: PorchTool;
  refreshAdmission?: () => Promise<RoomAdmission>;
}) {
  const apiRef = useRef<ExcalidrawImperativeAPI | null>(null);
  const socketRef = useRef<PartySocket | null>(null);
  const unsubscribeRef = useRef<(() => void) | null>(null);
  const profileRef = useRef(profile);
  const selfIdRef = useRef(profile.memberId);
  const quietMotionRef = useRef(false);
  const presencesRef = useRef(new Map<string, CanvasPresence>());
  const pointerRef = useRef<CanvasPresenceUpdate['pointer']>(null);
  const buttonRef = useRef<CanvasPresenceUpdate['button']>('up');
  const localPresenceRef = useRef<CanvasPresenceUpdate>({
    pointer: null, button: 'up', selectedElementIds: [],
    viewport: {scrollX: 0, scrollY: 0, zoom: 1}, posture: 'idle',
  });
  const pendingPresenceRef = useRef<CanvasPresenceUpdate | null>(null);
  const presenceTimerRef = useRef(0);
  const lastPresenceSentAtRef = useRef(0);
  const lastPresenceWireRef = useRef('');
  const followingRef = useRef<string | null>(null);
  const applyingFollowRef = useRef(false);
  const [status, setStatus] = useState<'opening' | 'open' | 'error'>('opening');
  const [scene, setScene] = useState('[]');
  const [presenceData, setPresenceData] = useState('[]');
  const [presencePeople, setPresencePeople] = useState<CanvasPresence[]>([]);
  const [following, setFollowing] = useState('');
  const [localView, setLocalView] = useState('{"scrollX":0,"scrollY":0,"zoom":1}');
  const [initialized, setInitialized] = useState(false);
  const roomKey = useMemo(() => room, [room]);
  const quietMotion = useReducedMotion();

  const renderPresence = useCallback(() => {
    const presences = [...presencesRef.current.values()].sort((a, b) => a.memberId.localeCompare(b.memberId));
    setPresenceData(JSON.stringify(presences));
    setPresencePeople(presences.filter((presence) => presence.memberId !== selfIdRef.current));
    const collaborators = new Map<SocketId, Collaborator>();
    for (const presence of presences) {
      if (presence.memberId === selfIdRef.current) continue;
      const activePosture = presence.posture !== 'idle' && presence.posture !== 'pointing';
      collaborators.set(presence.memberId as SocketId, {
        id: presence.memberId,
        socketId: presence.memberId as SocketId,
        username: activePosture ? `${presence.name} · ${presence.posture}` : presence.name,
        color: {background: presence.color, stroke: presence.color},
        pointer: presence.pointer ? {
          ...presence.pointer,
          tool: 'pointer',
          renderCursor: !quietMotionRef.current || presence.button === 'down' || activePosture,
        } : undefined,
        button: presence.button,
        selectedElementIds: Object.fromEntries(presence.selectedElementIds.map((id) => [id, true])),
      });
    }
    apiRef.current?.updateScene({collaborators});
  }, []);

  const applyFollowViewport = useCallback((presence: CanvasPresence) => {
    if (followingRef.current !== presence.memberId || !apiRef.current) return;
    applyingFollowRef.current = true;
    apiRef.current.updateScene({appState: {
      scrollX: presence.viewport.scrollX,
      scrollY: presence.viewport.scrollY,
      zoom: {value: presence.viewport.zoom as AppState['zoom']['value']},
    }});
    setLocalView(JSON.stringify(presence.viewport));
    requestAnimationFrame(() => { applyingFollowRef.current = false; });
  }, []);

  const flushPresence = useCallback(() => {
    presenceTimerRef.current = 0;
    const presence = pendingPresenceRef.current;
    const socket = socketRef.current;
    if (!presence || socket?.readyState !== WebSocket.OPEN) return;
    pendingPresenceRef.current = null;
    const message = JSON.stringify({type: 'presence.update', ...presence});
    if (message === lastPresenceWireRef.current) return;
    lastPresenceWireRef.current = message;
    lastPresenceSentAtRef.current = performance.now();
    socket.send(message);
  }, []);

  const publishPresence = useCallback((presence: CanvasPresenceUpdate) => {
    localPresenceRef.current = presence;
    setLocalView(JSON.stringify(presence.viewport));
    pendingPresenceRef.current = presence;
    if (presenceTimerRef.current) return;
    const remaining = Math.max(0, 50 - (performance.now() - lastPresenceSentAtRef.current));
    presenceTimerRef.current = window.setTimeout(flushPresence, remaining);
  }, [flushPresence]);

  const bind = useCallback((api: ExcalidrawImperativeAPI) => {
    unsubscribeRef.current?.();
    unsubscribeRef.current = null;
    apiRef.current = api;
    api.setActiveTool({type: toolType[tool]});
    unsubscribeRef.current = api.onLocalSceneUpdate((update) => {
      const socket = socketRef.current;
      if (socket?.readyState === WebSocket.OPEN) socket.send(encodeUpdate(update));
    }, 'v2');
    setInitialized(true);
  }, [tool]);

  useEffect(() => { apiRef.current?.setActiveTool({type: toolType[tool]}); }, [tool]);

  useEffect(() => {
    if (!initialized) return;
    let disposed = false;
    let socket: PartySocket | null = null;
    const connect = () => {
      socket = new PartySocket({
        host: partyHost(),
        party: 'canvas',
        room: roomKey,
        query: refreshAdmission ? async () => ({admission: (await refreshAdmission()).ticket}) : undefined,
      });
      socketRef.current = socket;
      socket.addEventListener('open', () => {
        if (disposed) return;
        setStatus('open');
        const api = apiRef.current;
        socket?.send(JSON.stringify({type: 'presence.hello', profile: profileRef.current}));
        if (api) {
          socket?.send(encodeUpdate(api.encodeSceneAsUpdate('v2')));
          lastPresenceWireRef.current = '';
          publishPresence(presenceFromApp(api.getAppState(), pointerRef.current, buttonRef.current));
        }
      });
      socket.addEventListener('message', (event) => {
        if (typeof event.data !== 'string') return;
        try {
          const presenceMessage = parseCanvasPresenceServerMessage(JSON.parse(event.data));
          if (presenceMessage?.type === 'presence.snapshot') {
            presencesRef.current = new Map(presenceMessage.presences.map((presence) => [presence.memberId, presence]));
            renderPresence();
            return;
          }
          if (presenceMessage?.type === 'presence.state') {
            presencesRef.current.set(presenceMessage.presence.memberId, presenceMessage.presence);
            renderPresence();
            applyFollowViewport(presenceMessage.presence);
            return;
          }
          if (presenceMessage?.type === 'presence.leave') {
            presencesRef.current.delete(presenceMessage.memberId);
            renderPresence();
            return;
          }
          const update = decodeUpdate(event.data);
          if (update?.byteLength) apiRef.current?.applyRemoteSceneUpdate(update, 'v2');
        } catch { /* malformed messages are ignored at the product boundary */ }
      });
      socket.addEventListener('close', () => {
        if (disposed) return;
        setStatus('error');
        presencesRef.current.clear();
        followingRef.current = null;
        setFollowing('');
        renderPresence();
      });
      socket.addEventListener('error', () => { if (!disposed) setStatus('error'); });
    };
    connect();
    return () => {
      disposed = true;
      socketRef.current = null;
      socket?.close();
    };
  }, [applyFollowViewport, initialized, publishPresence, refreshAdmission, renderPresence, roomKey]);

  useEffect(() => {
    profileRef.current = profile;
    selfIdRef.current = profile.memberId;
    const socket = socketRef.current;
    if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify({type: 'presence.hello', profile}));
    renderPresence();
  }, [profile.memberId, profile.name, profile.color, renderPresence]);

  useEffect(() => {
    quietMotionRef.current = quietMotion;
    renderPresence();
  }, [quietMotion, renderPresence]);

  useEffect(() => () => {
    unsubscribeRef.current?.();
    window.clearTimeout(presenceTimerRef.current);
  }, []);

  const onChange = useCallback((elements: Parameters<NonNullable<React.ComponentProps<typeof Excalidraw>['onChange']>>[0], appState: AppState) => {
    setScene(JSON.stringify(elements.map((element) => ({
      id: element.id, type: element.type, x: Math.round(element.x), y: Math.round(element.y),
      text: 'text' in element ? element.text : undefined,
    }))));
    publishPresence(presenceFromApp(appState, pointerRef.current, buttonRef.current));
  }, [publishPresence]);

  const onPointerUpdate = useCallback((payload: Parameters<NonNullable<React.ComponentProps<typeof Excalidraw>['onPointerUpdate']>>[0]) => {
    pointerRef.current = payload.pointer;
    buttonRef.current = payload.button;
    const api = apiRef.current;
    if (api) publishPresence(presenceFromApp(api.getAppState(), payload.pointer, payload.button));
  }, [publishPresence]);

  const onScrollChange = useCallback((scrollX: number, scrollY: number, zoom: AppState['zoom']) => {
    if (applyingFollowRef.current) return;
    publishPresence({...localPresenceRef.current, viewport: {scrollX, scrollY, zoom: zoom.value}});
  }, [publishPresence]);

  const onUserFollow = useCallback((payload: OnUserFollowedPayload) => {
    const memberId = payload.action === 'FOLLOW' ? String(payload.userToFollow.socketId) : null;
    followingRef.current = memberId;
    setFollowing(memberId ?? '');
    if (memberId) {
      const presence = presencesRef.current.get(memberId);
      if (presence) applyFollowViewport(presence);
    } else if (apiRef.current) {
      publishPresence(presenceFromApp(apiRef.current.getAppState(), pointerRef.current, buttonRef.current));
    }
  }, [applyFollowViewport, publishPresence]);

  const chooseFollow = useCallback((memberId: string | null) => {
    followingRef.current = memberId;
    setFollowing(memberId ?? '');
    apiRef.current?.updateScene({appState: {userToFollow: memberId ? {
      socketId: memberId as SocketId,
      username: presencesRef.current.get(memberId)?.name ?? 'Porch person',
    } : null}});
    if (memberId) {
      const presence = presencesRef.current.get(memberId);
      if (presence) applyFollowViewport(presence);
    }
  }, [applyFollowViewport]);

  return <div
    className="porch-canvas-engine"
    data-connection={status}
    data-scene={scene}
    data-presence={presenceData}
    data-self={profile.memberId}
    data-following={following}
    data-local-view={localView}
    data-presence-motion={quietMotion ? 'quiet' : 'full'}
    onPointerDownCapture={(event) => {
      if (followingRef.current && (event.target as Element).closest('.excalidraw')) chooseFollow(null);
    }}
    onWheelCapture={(event) => {
      if (followingRef.current && (event.target as Element).closest('.excalidraw')) chooseFollow(null);
    }}
    onPointerLeave={() => {
      pointerRef.current = null;
      buttonRef.current = 'up';
      const api = apiRef.current;
      if (api) publishPresence(presenceFromApp(api.getAppState(), null, 'up'));
    }}
  >
    {status !== 'open' && <div className={`porch-canvas-status ${status === 'error' ? 'error' : ''}`}>{status === 'error' ? 'The glass could not connect.' : 'Opening the glass…'}</div>}
    {presencePeople.length > 0 && <div className="porch-glass-people" aria-label="People on the glass">
      {presencePeople.map((presence) => <button
        key={presence.memberId}
        type="button"
        aria-pressed={following === presence.memberId}
        aria-label={`${following === presence.memberId ? 'Stop following' : 'Follow'} ${presence.name}`}
        style={{'--person-color': presence.color} as React.CSSProperties}
        onClick={() => chooseFollow(following === presence.memberId ? null : presence.memberId)}
      >
        <span aria-hidden="true" />
        <strong>{presence.name}</strong>
        <small>{presence.posture === 'idle' ? 'here' : presence.posture}</small>
      </button>)}
    </div>}
    <Excalidraw
      onExcalidrawAPI={(api) => { apiRef.current = api; }}
      onInitialize={bind}
      onUnmount={() => { setInitialized(false); unsubscribeRef.current?.(); unsubscribeRef.current = null; apiRef.current = null; }}
      isCollaborating
      zenModeEnabled
      theme="dark"
      name="The Porch"
      UIOptions={uiOptions}
      aiEnabled={false}
      autoFocus={false}
      handleKeyboardGlobally={false}
      initialData={{appState: {viewBackgroundColor: 'transparent'}}}
      onChange={onChange}
      onPointerUpdate={onPointerUpdate}
      onScrollChange={onScrollChange}
      onUserFollow={onUserFollow}
    />
  </div>;
}

export function PorchCanvas({room, profile, refreshAdmission, glassVisible, tool}: {
  room: string;
  profile: Profile;
  refreshAdmission?: () => Promise<RoomAdmission>;
  glassVisible: boolean;
  tool: PorchTool;
}) {
  return <div className={`porch-canvas-adapter ${glassVisible ? '' : 'glass-hidden'}`} aria-label="Shared porch canvas" data-canvas-status="mounted">
    <SyncedCanvas room={room} profile={profile} tool={tool} refreshAdmission={refreshAdmission} />
  </div>;
}
