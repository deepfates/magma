import {createMergeableStore} from 'tinybase';
import {createIndexedDbPersister} from 'tinybase/persisters/persister-indexed-db';
import PartySocket from 'partysocket';
import type {Profile} from './domain/protocol';
import type {RoomAdmission} from './accessClient';
import {attachWorkspaceTransport} from './workspaceTransport';

export const store = createMergeableStore().setTablesSchema({
  tasks: {
    text: {type: 'string'},
    done: {type: 'boolean', default: false},
    createdAt: {type: 'number'},
    createdBy: {type: 'string'},
    ownerId: {type: 'string', default: ''},
    ownerName: {type: 'string', default: ''},
    completedAt: {type: 'number', default: 0},
  },
  sparks: {
    text: {type: 'string'},
    authorId: {type: 'string'},
    authorName: {type: 'string'},
    emoji: {type: 'string'},
    createdAt: {type: 'number'},
    pinned: {type: 'boolean', default: false},
  },
});

export type WorkspaceConnection = {
  socket: PartySocket;
  destroy: () => Promise<void>;
};

export const clearWorkspaceCache = (room: string) => {
  store.delTables();
  if (!('indexedDB' in globalThis)) return;
  indexedDB.deleteDatabase(`magma:${room}`);
};

export const partySocketHost = () =>
  import.meta.env.VITE_PARTYKIT_HOST || `${window.location.hostname}:1999`;

export const connectWorkspace = async (
  room: string,
  profile: Profile,
  admission?: RoomAdmission,
  refreshAdmission?: () => Promise<RoomAdmission>,
): Promise<WorkspaceConnection> => {
  const local = createIndexedDbPersister(store, `magma:${room}`);
  await local.load();
  await local.startAutoSave();

  let initialAdmission = admission;
  const socket = new PartySocket({
    host: partySocketHost(),
    room,
    query: admission ? async () => {
      const next = initialAdmission ?? await refreshAdmission?.();
      initialAdmission = undefined;
      if (!next) throw new Error('A fresh room admission is required');
      return {admission: next.ticket};
    } : {
      memberId: profile.memberId,
      name: profile.name,
      color: profile.color,
      emoji: profile.emoji,
      intention: profile.intention,
    },
  });
  const remote = attachWorkspaceTransport(store, socket, admission?.role !== 'guest');

  return {
    socket,
    destroy: async () => {
      remote.destroy();
      await local.destroy();
      socket.close();
    },
  };
};
