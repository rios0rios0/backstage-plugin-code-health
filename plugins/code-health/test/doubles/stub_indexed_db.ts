interface StubRequest<T> {
  onsuccess: (() => void) | null;
  onerror: (() => void) | null;
  onupgradeneeded: (() => void) | null;
  result: T;
  error: DOMException | null;
}

/** Step at which the double should fail, so the caller's recovery path can be exercised. */
export type IndexedDBFailure = "open" | "get" | "put";

const emptyRequest = <T,>(): StubRequest<T> => ({
  onsuccess: null,
  onerror: null,
  onupgradeneeded: null,
  result: undefined as unknown as T,
  error: null,
});

/** Runs `action` on the microtask queue, mirroring IndexedDB's asynchronous callbacks. */
const respond = <T,>(action: () => T): StubRequest<T> => {
  const request = emptyRequest<T>();

  queueMicrotask(() => {
    try {
      request.result = action();
      request.onsuccess?.();
    } catch (error) {
      request.error = error as unknown as DOMException;
      request.onerror?.();
    }
  });

  return request;
};

class StubDatabase {
  private readonly stores: Map<string, Map<string, unknown>>;
  private readonly failOn: IndexedDBFailure | null;

  constructor(stores: Map<string, Map<string, unknown>>, failOn: IndexedDBFailure | null) {
    this.stores = stores;
    this.failOn = failOn;
  }

  createObjectStore(storeName: string): void {
    this.stores.set(storeName, new Map());
  }

  transaction(storeName: string, _mode: IDBTransactionMode) {
    const store = this.stores.get(storeName) ?? new Map<string, unknown>();
    const failOn = this.failOn;

    return {
      objectStore: () => ({
        get: (id: string) =>
          respond(() => {
            if (failOn === "get") throw new Error("get failed");
            return store.get(id);
          }),
        put: (value: unknown, id: string) =>
          respond<void>(() => {
            if (failOn === "put") throw new Error("put failed");
            store.set(id, value);
          }),
      }),
    };
  }
}

/**
 * Hand-rolled in-memory IndexedDB, covering only what the key store touches:
 * `open`, `createObjectStore`, and `get`/`put` inside a transaction.
 *
 * jsdom ships no IndexedDB at all, and a driver-level mock would assert how the
 * store talks to the browser rather than what it stores. This double keeps the
 * real key object and hands it back on the next open, so a test can prove the
 * key survives a reload.
 */
export class StubIndexedDB {
  private readonly databases = new Map<string, Map<string, Map<string, unknown>>>();
  private readonly failOn: IndexedDBFailure | null;

  constructor(failOn: IndexedDBFailure | null = null) {
    this.failOn = failOn;
  }

  open(name: string, _version?: number): StubRequest<StubDatabase> {
    const request = emptyRequest<StubDatabase>();
    const isNew = !this.databases.has(name);
    const stores = this.databases.get(name) ?? new Map<string, Map<string, unknown>>();
    this.databases.set(name, stores);

    queueMicrotask(() => {
      if (this.failOn === "open") {
        request.error = new Error("open failed") as unknown as DOMException;
        request.onerror?.();
        return;
      }

      request.result = new StubDatabase(stores, this.failOn);
      if (isNew) request.onupgradeneeded?.();
      request.onsuccess?.();
    });

    return request;
  }
}

/** Installs the double as `globalThis.indexedDB` and returns a restore function. */
export const installStubIndexedDB = (stub: StubIndexedDB): (() => void) => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "indexedDB");

  Object.defineProperty(globalThis, "indexedDB", {
    value: stub,
    configurable: true,
    writable: true,
  });

  return () => {
    if (descriptor) {
      Object.defineProperty(globalThis, "indexedDB", descriptor);
      return;
    }
    Reflect.deleteProperty(globalThis, "indexedDB");
  };
};
