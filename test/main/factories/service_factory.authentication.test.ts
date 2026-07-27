import { waitFor } from "@testing-library/react";
import { createAuthenticationService } from "../../../src/main/factories/service_factory";

/** jsdom in this Node version exposes no usable `localStorage`, so provide one. */
const createMemoryStorage = (): Storage => {
  const store = new Map<string, string>();
  return {
    getItem: (key) => store.get(key) ?? null,
    setItem: (key, value) => void store.set(key, value),
    removeItem: (key) => void store.delete(key),
    clear: () => store.clear(),
    key: (index) => [...store.keys()][index] ?? null,
    get length() {
      return store.size;
    },
  } as Storage;
};

const setLocalStorage = (value: Storage | undefined) => {
  Object.defineProperty(globalThis, "localStorage", {
    value,
    configurable: true,
    writable: true,
  });
};

describe("createAuthenticationService", () => {
  let originalLocalStorage: PropertyDescriptor | undefined;

  beforeEach(() => {
    originalLocalStorage = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
    setLocalStorage(createMemoryStorage());
  });

  afterEach(() => {
    if (originalLocalStorage) {
      Object.defineProperty(globalThis, "localStorage", originalLocalStorage);
    } else {
      delete (globalThis as { localStorage?: Storage }).localStorage;
    }
  });

  it("should return a service that becomes ready once the credential store is unwrapped", async () => {
    // given / when
    const service = createAuthenticationService();
    await service.whenReady();

    // then
    expect(service.isReady()).toBe(true);
  });

  it("should round-trip a token through the encrypted store", async () => {
    // given
    const service = createAuthenticationService();
    await service.whenReady();

    // when
    service.setToken("ghp_secret");

    // then
    expect(service.getToken()).toBe("ghp_secret");
  });

  it("should never keep the plaintext token in browser storage", async () => {
    // given
    const service = createAuthenticationService();
    await service.whenReady();

    // when
    service.setToken("ghp_secret");
    await waitFor(() => expect(localStorage.getItem("code-health:token")).not.toBeNull());

    // then
    expect(localStorage.getItem("code-health:token")).toMatch(/^enc:/);
  });

  it("should stay unready when browser storage is unavailable", async () => {
    // given
    setLocalStorage(undefined);

    // when
    const service = createAuthenticationService();
    await service.whenReady();

    // then
    expect(service.isReady()).toBe(false);
    expect(service.getToken()).toBeNull();
  });
});
