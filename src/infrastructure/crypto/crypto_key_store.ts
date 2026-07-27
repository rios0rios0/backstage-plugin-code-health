const DB_NAME = "code-health-keystore";
const STORE_NAME = "keys";
const KEY_ID = "master";

const generateKey = (): Promise<CryptoKey> =>
  crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);

const openDatabase = (): Promise<IDBDatabase> =>
  new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE_NAME);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

const getStoredKey = (db: IDBDatabase): Promise<CryptoKey | undefined> =>
  new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const request = tx.objectStore(STORE_NAME).get(KEY_ID);
    request.onsuccess = () => resolve(request.result as CryptoKey | undefined);
    request.onerror = () => reject(request.error);
  });

const storeKey = (db: IDBDatabase, key: CryptoKey): Promise<void> =>
  new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const request = tx.objectStore(STORE_NAME).put(key, KEY_ID);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });

export const getOrCreateKey = async (): Promise<CryptoKey> => {
  try {
    const db = await openDatabase();
    const existing = await getStoredKey(db);
    if (existing) return existing;

    const key = await generateKey();
    await storeKey(db, key);
    return key;
  } catch {
    return generateKey();
  }
};
