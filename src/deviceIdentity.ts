import {
  deriveDeviceId, exportPublicJwk, generateSigningKeyPair, normalizePublicJwk, signAuthProof, verifyAuthProof,
  type AuthProofFields,
} from './domain/auth';

export type StoredDeviceIdentity = {
  roomId: string;
  deviceId: string;
  publicJwk: JsonWebKey;
  publicKey: CryptoKey;
  privateKey: CryptoKey;
};

export type DeviceIdentityStore = {
  get(roomId: string): Promise<StoredDeviceIdentity | undefined>;
  add(identity: StoredDeviceIdentity): Promise<boolean>;
  delete(roomId: string): Promise<void>;
};

type CryptoLike = Pick<Crypto, 'subtle' | 'getRandomValues'>;

const DB_NAME = 'magma-identity-v1';
const STORE_NAME = 'room-identities';

const validRoomId = (roomId: string) => /^[a-z0-9-]{1,64}$/.test(roomId);

const requestResult = <T>(request: IDBRequest<T>): Promise<T> => new Promise((resolve, reject) => {
  request.addEventListener('success', () => resolve(request.result), {once: true});
  request.addEventListener('error', () => reject(request.error ?? new Error('IndexedDB request failed')), {once: true});
});

const transactionDone = (transaction: IDBTransaction): Promise<void> => new Promise((resolve, reject) => {
  transaction.addEventListener('complete', () => resolve(), {once: true});
  transaction.addEventListener('abort', () => reject(transaction.error ?? new Error('IndexedDB transaction aborted')), {once: true});
  transaction.addEventListener('error', () => reject(transaction.error ?? new Error('IndexedDB transaction failed')), {once: true});
});

const openIdentityDatabase = (factory: IDBFactory): Promise<IDBDatabase> => new Promise((resolve, reject) => {
  const request = factory.open(DB_NAME, 1);
  request.addEventListener('upgradeneeded', () => {
    if (!request.result.objectStoreNames.contains(STORE_NAME)) request.result.createObjectStore(STORE_NAME, {keyPath: 'roomId'});
  });
  request.addEventListener('success', () => resolve(request.result), {once: true});
  request.addEventListener('error', () => reject(request.error ?? new Error('Could not open identity database')), {once: true});
});

export const createIndexedDbIdentityStore = (factory: IDBFactory = indexedDB): DeviceIdentityStore => ({
  async get(roomId) {
    const database = await openIdentityDatabase(factory);
    try {
      return await requestResult(database.transaction(STORE_NAME).objectStore(STORE_NAME).get(roomId)) as StoredDeviceIdentity | undefined;
    } finally {
      database.close();
    }
  },
  async add(identity) {
    const database = await openIdentityDatabase(factory);
    try {
      const transaction = database.transaction(STORE_NAME, 'readwrite');
      const request = transaction.objectStore(STORE_NAME).add(identity);
      const inserted = await new Promise<boolean>((resolve, reject) => {
        request.addEventListener('success', () => resolve(true), {once: true});
        request.addEventListener('error', (event) => {
          if (request.error?.name === 'ConstraintError') {
            event.preventDefault();
            event.stopPropagation();
            resolve(false);
          } else reject(request.error ?? new Error('Could not persist device identity'));
        }, {once: true});
      });
      await transactionDone(transaction);
      return inserted;
    } finally {
      database.close();
    }
  },
  async delete(roomId) {
    const database = await openIdentityDatabase(factory);
    try {
      const transaction = database.transaction(STORE_NAME, 'readwrite');
      transaction.objectStore(STORE_NAME).delete(roomId);
      await transactionDone(transaction);
    } finally {
      database.close();
    }
  },
});

const isSigningKey = (value: unknown): value is CryptoKey => {
  if (!value || typeof value !== 'object') return false;
  const key = value as CryptoKey;
  return key.type === 'private' && key.extractable === false && key.algorithm?.name === 'ECDSA'
    && (key.algorithm as EcKeyAlgorithm).namedCurve === 'P-256' && key.usages?.length === 1 && key.usages.includes('sign');
};

const isVerificationKey = (value: unknown): value is CryptoKey => {
  if (!value || typeof value !== 'object') return false;
  const key = value as CryptoKey;
  return key.type === 'public' && key.extractable === true && key.algorithm?.name === 'ECDSA'
    && (key.algorithm as EcKeyAlgorithm).namedCurve === 'P-256' && key.usages?.length === 1 && key.usages.includes('verify');
};

const identityKeyPairMatches = async (identity: StoredDeviceIdentity, cryptoLike: CryptoLike): Promise<boolean> => {
  try {
    if (await deriveDeviceId(identity.publicJwk, cryptoLike) !== identity.deviceId) return false;
    if (await deriveDeviceId(await exportPublicJwk(identity.publicKey, cryptoLike), cryptoLike) !== identity.deviceId) return false;
    const fields: AuthProofFields = {
      roomId: identity.roomId,
      connectionId: 'identity-check',
      challengeId: 'identity-check',
      nonce: 'identity-check',
      roomEpoch: 0,
      action: 'prove',
      deviceId: identity.deviceId,
      clientNonce: 'identity-check',
    };
    return verifyAuthProof(identity.publicJwk, fields, await signAuthProof(identity.privateKey, fields, cryptoLike), cryptoLike);
  } catch {
    return false;
  }
};

export const normalizeStoredDeviceIdentity = (value: unknown, roomId: string): StoredDeviceIdentity | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const identity = value as Partial<StoredDeviceIdentity>;
  const publicJwk = normalizePublicJwk(identity.publicJwk);
  if (identity.roomId !== roomId || typeof identity.deviceId !== 'string' || !/^dev_[A-Za-z0-9_-]{43}$/.test(identity.deviceId)
    || !publicJwk || !isSigningKey(identity.privateKey) || !isVerificationKey(identity.publicKey)) return null;
  return {...identity, roomId, deviceId: identity.deviceId, publicJwk, publicKey: identity.publicKey, privateKey: identity.privateKey};
};

export const loadOrCreateRoomIdentity = async (
  roomId: string,
  options: {store?: DeviceIdentityStore; crypto?: CryptoLike} = {},
): Promise<StoredDeviceIdentity> => {
  if (!validRoomId(roomId)) throw new TypeError('Invalid room id');
  const store = options.store ?? createIndexedDbIdentityStore();
  const cryptoLike = options.crypto ?? crypto;
  const existingValue = await store.get(roomId);
  if (existingValue) {
    const existing = normalizeStoredDeviceIdentity(existingValue, roomId);
    if (!existing || !await identityKeyPairMatches(existing, cryptoLike)) throw new Error('Stored room identity is corrupt');
    return existing;
  }

  const pair = await generateSigningKeyPair(cryptoLike);
  const publicJwk = await exportPublicJwk(pair.publicKey, cryptoLike);
  const candidate: StoredDeviceIdentity = {
    roomId,
    deviceId: await deriveDeviceId(publicJwk, cryptoLike),
    publicJwk,
    publicKey: pair.publicKey,
    privateKey: pair.privateKey,
  };
  if (await store.add(candidate)) return candidate;
  const winner = normalizeStoredDeviceIdentity(await store.get(roomId), roomId);
  if (!winner || !await identityKeyPairMatches(winner, cryptoLike)) throw new Error('Concurrent identity creation did not produce a readable identity');
  return winner;
};

export const loadRoomIdentity = async (
  roomId: string,
  store: DeviceIdentityStore = createIndexedDbIdentityStore(),
): Promise<StoredDeviceIdentity | null> => {
  if (!validRoomId(roomId)) throw new TypeError('Invalid room id');
  const value = await store.get(roomId);
  if (!value) return null;
  const identity = normalizeStoredDeviceIdentity(value, roomId);
  if (!identity) throw new Error('Stored room identity is corrupt');
  return identity;
};

export const forgetRoomIdentity = async (roomId: string, store: DeviceIdentityStore = createIndexedDbIdentityStore()) => {
  if (!validRoomId(roomId)) throw new TypeError('Invalid room id');
  await store.delete(roomId);
};
