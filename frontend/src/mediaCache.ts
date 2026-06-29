const MEDIA_CACHE_DB_NAME = 'pulseMediaCache';
const MEDIA_CACHE_DB_VERSION = 1;
const MEDIA_CACHE_STORE = 'entries';
const MEDIA_CACHE_USER_INDEX = 'by_user';

type MediaCacheRecord = {
  key: string;
  userId: string;
  messageId: string;
  sourceUrl: string;
  blob: Blob;
  metadata?: any;
  cachedAt: number;
};

const isIndexedDbSupported = (): boolean =>
  typeof window !== 'undefined' && typeof window.indexedDB !== 'undefined';

const buildMediaCacheKey = (userId: string, messageId: string, sourceUrl: string): string =>
  `${userId}::${messageId}::${sourceUrl}`;

const openMediaCacheDb = (): Promise<IDBDatabase | null> => {
  if (!isIndexedDbSupported()) return Promise.resolve(null);

  return new Promise((resolve) => {
    try {
      const request = window.indexedDB.open(MEDIA_CACHE_DB_NAME, MEDIA_CACHE_DB_VERSION);

      request.onupgradeneeded = () => {
        const db = request.result;
        let store: IDBObjectStore;

        if (!db.objectStoreNames.contains(MEDIA_CACHE_STORE)) {
          store = db.createObjectStore(MEDIA_CACHE_STORE, { keyPath: 'key' });
        } else {
          store = request.transaction!.objectStore(MEDIA_CACHE_STORE);
        }

        if (!store.indexNames.contains(MEDIA_CACHE_USER_INDEX)) {
          store.createIndex(MEDIA_CACHE_USER_INDEX, 'userId', { unique: false });
        }
      };

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
      request.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
};

export const getCachedMediaBlob = async (
  userId: string,
  messageId: string,
  sourceUrl: string,
): Promise<Blob | null> => {
  if (!userId || !messageId || !sourceUrl) return null;

  const db = await openMediaCacheDb();
  if (!db) return null;

  const key = buildMediaCacheKey(userId, messageId, sourceUrl);

  return new Promise((resolve) => {
    const tx = db.transaction(MEDIA_CACHE_STORE, 'readonly');
    const store = tx.objectStore(MEDIA_CACHE_STORE);
    const request = store.get(key);

    request.onsuccess = () => {
      const result = request.result as MediaCacheRecord | undefined;
      resolve(result?.blob || null);
    };
    request.onerror = () => resolve(null);

    tx.oncomplete = () => db.close();
    tx.onerror = () => db.close();
    tx.onabort = () => db.close();
  });
};

export const setCachedMediaBlob = async (
  userId: string,
  messageId: string,
  sourceUrl: string,
  blob: Blob,
  metadata?: any,
): Promise<void> => {
  if (!userId || !messageId || !sourceUrl || !blob || blob.size <= 0) return;

  const db = await openMediaCacheDb();
  if (!db) return;

  const record: MediaCacheRecord = {
    key: buildMediaCacheKey(userId, messageId, sourceUrl),
    userId,
    messageId,
    sourceUrl,
    blob,
    cachedAt: Date.now(),
  };
  
  if (metadata !== undefined) {
    record.metadata = metadata;
  } else {
    // try to keep existing metadata
    const existing = await new Promise<MediaCacheRecord | null>((resolve) => {
      const tx = db.transaction(MEDIA_CACHE_STORE, 'readonly');
      const store = tx.objectStore(MEDIA_CACHE_STORE);
      const req = store.get(record.key);
      req.onsuccess = () => resolve(req.result as MediaCacheRecord | null);
      req.onerror = () => resolve(null);
    });
    
    if (existing && existing.metadata) {
      record.metadata = existing.metadata;
    }
  }

  await new Promise<void>((resolve) => {
    const tx = db.transaction(MEDIA_CACHE_STORE, 'readwrite');
    tx.objectStore(MEDIA_CACHE_STORE).put(record);
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
    tx.onabort = () => resolve();
  });

  db.close();
};

export const removeCachedMediaBlob = async (
  userId: string,
  messageId: string,
  sourceUrl: string,
): Promise<void> => {
  if (!userId || !messageId || !sourceUrl) return;

  const db = await openMediaCacheDb();
  if (!db) return;

  const key = buildMediaCacheKey(userId, messageId, sourceUrl);

  await new Promise<void>((resolve) => {
    const tx = db.transaction(MEDIA_CACHE_STORE, 'readwrite');
    const store = tx.objectStore(MEDIA_CACHE_STORE);
    const request = store.delete(key);

    request.onsuccess = () => resolve();
    request.onerror = () => resolve();

    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
    tx.onabort = () => resolve();
  });

  db.close();
};

export const getCachedMediaForUser = async (userId: string): Promise<MediaCacheRecord[]> => {
  if (!userId) return [];

  const db = await openMediaCacheDb();
  if (!db) return [];

  return new Promise((resolve) => {
    const tx = db.transaction(MEDIA_CACHE_STORE, 'readonly');
    const store = tx.objectStore(MEDIA_CACHE_STORE);
    const index = store.index(MEDIA_CACHE_USER_INDEX);
    const range = IDBKeyRange.only(userId);
    const request = index.getAll(range);

    request.onsuccess = () => {
      resolve(request.result || []);
    };
    request.onerror = () => resolve([]);

    tx.oncomplete = () => db.close();
    tx.onerror = () => db.close();
    tx.onabort = () => db.close();
  });
};

export const clearCachedMediaForUser = async (userId: string): Promise<void> => {
  if (!userId) return;

  const db = await openMediaCacheDb();
  if (!db) return;

  await new Promise<void>((resolve) => {
    const tx = db.transaction(MEDIA_CACHE_STORE, 'readwrite');
    const store = tx.objectStore(MEDIA_CACHE_STORE);
    const index = store.index(MEDIA_CACHE_USER_INDEX);
    const range = IDBKeyRange.only(userId);
    const cursorRequest = index.openCursor(range);

    cursorRequest.onsuccess = () => {
      const cursor = cursorRequest.result;
      if (!cursor) return;
      store.delete(cursor.primaryKey);
      cursor.continue();
    };

    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
    tx.onabort = () => resolve();
  });

  db.close();
};

export const clearOtherSessions = async (currentUserId: string): Promise<void> => {
  if (!currentUserId) return;

  const db = await openMediaCacheDb();
  if (!db) return;

  await new Promise<void>((resolve) => {
    const tx = db.transaction(MEDIA_CACHE_STORE, 'readwrite');
    const store = tx.objectStore(MEDIA_CACHE_STORE);
    const cursorRequest = store.openCursor();

    cursorRequest.onsuccess = () => {
      const cursor = cursorRequest.result;
      if (!cursor) return;
      
      const record = cursor.value as MediaCacheRecord;
      if (record.sourceUrl === 'upload' && record.userId !== currentUserId) {
        store.delete(cursor.primaryKey);
      }
      
      cursor.continue();
    };

    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
    tx.onabort = () => resolve();
  });

  db.close();
};
