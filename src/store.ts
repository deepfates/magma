import {createMergeableStore} from 'tinybase';
import {createIndexedDbPersister} from 'tinybase/persisters/persister-indexed-db';
import {createPartyKitPersister} from 'tinybase/persisters/persister-partykit-client';
import PartySocket from 'partysocket';

export const store = createMergeableStore().setTablesSchema({
  tasks: {
    text: {type: 'string'},
    done: {type: 'boolean', default: false},
    createdAt: {type: 'number'},
    createdBy: {type: 'string'},
  },
});

export type WorkspaceConnection = {
  socket: PartySocket;
  destroy: () => Promise<void>;
};

const partyHost = () =>
  import.meta.env.VITE_PARTYKIT_HOST || `${window.location.hostname}:1999`;

export const connectWorkspace = async (room: string): Promise<WorkspaceConnection> => {
  const local = createIndexedDbPersister(store, `magma:${room}`);
  await local.load();
  await local.startAutoSave();

  const socket = new PartySocket({host: partyHost(), room});
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
