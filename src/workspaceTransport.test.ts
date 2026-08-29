import {describe, expect, it} from 'vitest';
import {createMergeableStore} from 'tinybase';
import {
  contentAsChanges,
  attachWorkspaceTransport,
  decodeWorkspaceChanges,
  decodeWorkspaceSnapshot,
  encodeWorkspaceChanges,
  encodeWorkspaceSnapshot,
  hasWorkspaceChanges,
  mergeWorkspaceSnapshot,
} from './workspaceTransport';

class FakeSocket extends EventTarget {
  readyState = WebSocket.OPEN;
  readonly sent: string[] = [];
  send(message: string) {
    this.sent.push(message);
  }
  receive(message: string) {
    this.dispatchEvent(new MessageEvent('message', {data: message}));
  }
}

describe('authenticated workspace transport', () => {
  it('preserves TinyBase deletion tombstones across the wire', () => {
    const source = createMergeableStore();
    source.setCell('tasks', 'one', 'text', 'Leave no echo');
    let deletion = contentAsChanges(source.getMergeableContent());
    const listener = source.addDidFinishTransactionListener(() => {
      deletion = source.getTransactionMergeableChanges();
    });
    source.delCell('tasks', 'one', 'text');
    source.delListener(listener);

    const decoded = decodeWorkspaceChanges(encodeWorkspaceChanges(deletion));
    expect(decoded).not.toBeNull();
    const replica = createMergeableStore();
    replica.applyMergeableChanges(contentAsChanges(source.getMergeableContent()));
    replica.applyMergeableChanges(decoded!);
    expect(replica.hasCell('tasks', 'one', 'text')).toBe(false);
  });

  it('merges offline local work with the authenticated room snapshot', () => {
    const local = createMergeableStore();
    local.setCell('tasks', 'local', 'text', 'Offline finish line');
    const remote = createMergeableStore();
    remote.setCell('sparks', 'remote', 'text', 'Room handoff');

    const snapshot = decodeWorkspaceSnapshot(encodeWorkspaceSnapshot(remote.getMergeableContent()));
    expect(snapshot).not.toBeNull();
    const upload = mergeWorkspaceSnapshot(local, snapshot!);
    remote.applyMergeableChanges(upload);

    expect(local.getCell('tasks', 'local', 'text')).toBe('Offline finish line');
    expect(local.getCell('sparks', 'remote', 'text')).toBe('Room handoff');
    expect(remote.getCell('tasks', 'local', 'text')).toBe('Offline finish line');
    expect(remote.getMergeableContentHashes()).toEqual(local.getMergeableContentHashes());
  });

  it('rejects malformed envelopes and recognizes empty changes', () => {
    expect(decodeWorkspaceChanges('tinybase:s[{},{}]')).toBeNull();
    expect(decodeWorkspaceSnapshot('{"type":"workspace.snapshot","content":{}}')).toBeNull();
    expect(hasWorkspaceChanges([[{}], [{}], 1])).toBe(false);
  });

  it('uploads an offline merge once, applies broadcasts without echo, and detaches cleanly', async () => {
    const local = createMergeableStore();
    local.setCell('tasks', 'offline', 'text', 'Kept while away');
    const remote = createMergeableStore();
    remote.setCell('sparks', 'handoff', 'text', 'Welcome back');
    const socket = new FakeSocket();
    const transport = attachWorkspaceTransport(local, socket, true);

    socket.receive(encodeWorkspaceSnapshot(remote.getMergeableContent()));
    await transport.ready;
    expect(local.getCell('sparks', 'handoff', 'text')).toBe('Welcome back');
    expect(socket.sent).toHaveLength(1);

    const peer = createMergeableStore();
    let peerChanges = contentAsChanges(peer.getMergeableContent());
    const peerListener = peer.addDidFinishTransactionListener(() => {
      peerChanges = peer.getTransactionMergeableChanges();
    });
    peer.setCell('tasks', 'peer', 'text', 'No command echo');
    peer.delListener(peerListener);
    socket.receive(encodeWorkspaceChanges(peerChanges));
    expect(local.getCell('tasks', 'peer', 'text')).toBe('No command echo');
    expect(socket.sent).toHaveLength(1);

    local.setCell('tasks', 'live', 'text', 'One outbound change');
    expect(socket.sent).toHaveLength(2);
    transport.destroy();
    local.setCell('tasks', 'after', 'text', 'Local only');
    expect(socket.sent).toHaveLength(2);
  });

  it('keeps guest workspace transport read-only', async () => {
    const local = createMergeableStore();
    const remote = createMergeableStore();
    remote.setCell('sparks', 'room', 'text', 'Readable');
    const socket = new FakeSocket();
    const transport = attachWorkspaceTransport(local, socket, false);
    socket.receive(encodeWorkspaceSnapshot(remote.getMergeableContent()));
    await transport.ready;
    expect(local.getCell('sparks', 'room', 'text')).toBe('Readable');
    local.setCell('sparks', 'guest', 'text', 'Not published');
    expect(socket.sent).toEqual([]);
    transport.destroy();
  });
});
