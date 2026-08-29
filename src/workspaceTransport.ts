import {createMergeableStore} from 'tinybase';
import type {MergeableChanges, MergeableContent, MergeableStore} from 'tinybase/mergeable-store';

export const WORKSPACE_CHANGES_PREFIX = 'tinybase:s';
export const WORKSPACE_SNAPSHOT_TYPE = 'workspace.snapshot';
export const MAX_WORKSPACE_MESSAGE_BYTES = 256 * 1024;

// TinyBase uses undefined as a CRDT tombstone. JSON's normal array encoding
// turns it into null, so the wire representation must preserve it explicitly.
const UNDEFINED_SENTINEL = '\ufffc';

const restoreUndefined = (value: unknown): unknown => {
  if (value === UNDEFINED_SENTINEL) return undefined;
  if (Array.isArray(value)) return value.map(restoreUndefined);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, restoreUndefined(child)]));
  }
  return value;
};

export const stringifyWorkspaceValue = (value: unknown) => JSON.stringify(
  value,
  (_key, child) => child === undefined ? UNDEFINED_SENTINEL : child instanceof Map ? Object.fromEntries(child) : child,
);

export const parseWorkspaceValue = (value: string): unknown => restoreUndefined(JSON.parse(value));

export const encodeWorkspaceChanges = (changes: MergeableChanges) =>
  `${WORKSPACE_CHANGES_PREFIX}${stringifyWorkspaceValue(changes)}`;

export const decodeWorkspaceChanges = (message: unknown): MergeableChanges | null => {
  if (typeof message !== 'string' || message.length > MAX_WORKSPACE_MESSAGE_BYTES || !message.startsWith(WORKSPACE_CHANGES_PREFIX)) return null;
  try {
    const changes = parseWorkspaceValue(message.slice(WORKSPACE_CHANGES_PREFIX.length));
    return Array.isArray(changes) && changes.length === 3 && changes[2] === 1
      ? changes as MergeableChanges
      : null;
  } catch {
    return null;
  }
};

export type WorkspaceSnapshotMessage = {
  type: typeof WORKSPACE_SNAPSHOT_TYPE;
  content: MergeableContent;
};

export const encodeWorkspaceSnapshot = (content: MergeableContent) => stringifyWorkspaceValue({
  type: WORKSPACE_SNAPSHOT_TYPE,
  content,
});

export const decodeWorkspaceSnapshot = (message: unknown): MergeableContent | null => {
  if (typeof message !== 'string' || message.length > MAX_WORKSPACE_MESSAGE_BYTES) return null;
  try {
    const parsed = parseWorkspaceValue(message) as Partial<WorkspaceSnapshotMessage> | null;
    return parsed?.type === WORKSPACE_SNAPSHOT_TYPE && Array.isArray(parsed.content) && parsed.content.length === 2
      ? parsed.content as MergeableContent
      : null;
  } catch {
    return null;
  }
};

export const contentAsChanges = (content: MergeableContent): MergeableChanges => {
  const staging = createMergeableStore();
  let changes: MergeableChanges = [[{}], [{}], 1];
  const listenerId = staging.addDidFinishTransactionListener(() => {
    changes = staging.getTransactionMergeableChanges();
  });
  staging.applyMergeableChanges(content);
  staging.delListener(listenerId);
  return changes;
};

export const mergeWorkspaceSnapshot = (
  store: MergeableStore,
  content: MergeableContent,
): MergeableChanges => {
  store.applyMergeableChanges(content);
  return contentAsChanges(store.getMergeableContent());
};

export const hasWorkspaceChanges = (changes: MergeableChanges) =>
  Object.keys(changes[0][0] ?? {}).length > 0 || Object.keys(changes[1][0] ?? {}).length > 0;

type WorkspaceSocket = Pick<WebSocket, 'readyState' | 'send' | 'addEventListener' | 'removeEventListener'>;

export type WorkspaceTransport = {
  ready: Promise<void>;
  destroy: () => void;
};

export const attachWorkspaceTransport = (
  store: MergeableStore,
  socket: WorkspaceSocket,
  writable: boolean,
): WorkspaceTransport => {
  let applyingRemote = false;
  let destroyed = false;
  let resolveReady = () => {};
  const ready = new Promise<void>((resolve) => {
    resolveReady = resolve;
  });

  const listenerId = store.addDidFinishTransactionListener(() => {
    if (destroyed || applyingRemote || !writable || socket.readyState !== WebSocket.OPEN) return;
    const changes = store.getTransactionMergeableChanges();
    if (hasWorkspaceChanges(changes)) socket.send(encodeWorkspaceChanges(changes));
  });

  const onMessage = (event: MessageEvent) => {
    const snapshot = decodeWorkspaceSnapshot(event.data);
    if (snapshot) {
      applyingRemote = true;
      const merged = mergeWorkspaceSnapshot(store, snapshot);
      applyingRemote = false;
      if (writable && hasWorkspaceChanges(merged) && socket.readyState === WebSocket.OPEN) {
        socket.send(encodeWorkspaceChanges(merged));
      }
      resolveReady();
      return;
    }
    const changes = decodeWorkspaceChanges(event.data);
    if (!changes) return;
    applyingRemote = true;
    store.applyMergeableChanges(changes);
    applyingRemote = false;
  };

  socket.addEventListener('message', onMessage as EventListener);
  return {
    ready,
    destroy: () => {
      destroyed = true;
      store.delListener(listenerId);
      socket.removeEventListener('message', onMessage as EventListener);
      resolveReady();
    },
  };
};
