import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import PartySocket from 'partysocket';
import {Excalidraw} from '@excalidraw-yjs/excalidraw';
import type {ExcalidrawImperativeAPI} from '@excalidraw-yjs/excalidraw/types';
import '@excalidraw-yjs/excalidraw/index.css';
import {partyHost} from './accessClient';
import type {RoomAdmission} from './accessClient';
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

function SyncedCanvas({room, profile, tool, refreshAdmission}: {
  room: string;
  profile: Profile;
  tool: PorchTool;
  refreshAdmission?: () => Promise<RoomAdmission>;
}) {
  const apiRef = useRef<ExcalidrawImperativeAPI | null>(null);
  const socketRef = useRef<PartySocket | null>(null);
  const unsubscribeRef = useRef<(() => void) | null>(null);
  const [status, setStatus] = useState<'opening' | 'open' | 'error'>('opening');
  const [scene, setScene] = useState('[]');
  const [initialized, setInitialized] = useState(false);
  const roomKey = useMemo(() => room, [room]);

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
        if (api) socket?.send(encodeUpdate(api.encodeSceneAsUpdate('v2')));
      });
      socket.addEventListener('message', (event) => {
        if (typeof event.data !== 'string') return;
        try {
          const update = decodeUpdate(event.data);
          if (update?.byteLength) apiRef.current?.applyRemoteSceneUpdate(update, 'v2');
        } catch { /* malformed messages are ignored at the product boundary */ }
      });
      socket.addEventListener('close', () => { if (!disposed) setStatus('error'); });
      socket.addEventListener('error', () => { if (!disposed) setStatus('error'); });
    };
    connect();
    return () => {
      disposed = true;
      socketRef.current = null;
      socket?.close();
    };
  }, [initialized, refreshAdmission, roomKey]);

  useEffect(() => () => unsubscribeRef.current?.(), []);

  return <div className="porch-canvas-engine" data-connection={status} data-scene={scene}>
    {status !== 'open' && <div className={`porch-canvas-status ${status === 'error' ? 'error' : ''}`}>{status === 'error' ? 'The glass could not connect.' : 'Opening the glass…'}</div>}
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
      onChange={(elements) => setScene(JSON.stringify(elements.map((element) => ({id: element.id, type: element.type, x: Math.round(element.x), y: Math.round(element.y), text: 'text' in element ? element.text : undefined}))))}
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
