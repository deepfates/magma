import {createMergeableStore} from 'tinybase';
import {createIndexedDbPersister} from 'tinybase/persisters/persister-indexed-db';
import {createPartyKitPersister} from 'tinybase/persisters/persister-partykit-client';
import PartySocket from 'partysocket';
import type {Profile} from './domain/protocol';

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

const partyHost = () =>
  import.meta.env.VITE_PARTYKIT_HOST || `${window.location.hostname}:1999`;

export const connectWorkspace = async (room: string, profile: Profile): Promise<WorkspaceConnection> => {
  const local = createIndexedDbPersister(store, `magma:${room}`);
  await local.load();
  await local.startAutoSave();

  const socket = new PartySocket({
    host: partyHost(),
    room,
    query: {
      memberId: profile.memberId,
      name: profile.name,
      color: profile.color,
      emoji: profile.emoji,
      intention: profile.intention,
    },
  });
  const remote = createPartyKitPersister(store, socket, {
    messagePrefix: 'tinybase:',
    storeProtocol: window.location.protocol === 'https:' ? 'https' : 'http',
  });

  await remote.load().catch(() => undefined);
  await remote.startAutoLoad();
  await remote.startAutoSave();

  return {
    socket,
    destroy: async () => {
      await Promise.all([local.destroy(), remote.destroy()]);
      socket.close();
    },
  };
};
