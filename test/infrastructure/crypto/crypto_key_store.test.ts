import { getOrCreateKey } from "../../../src/infrastructure/crypto/crypto_key_store";
import { decrypt, encrypt } from "../../../src/infrastructure/crypto/crypto_utils";
import { installStubIndexedDB, StubIndexedDB } from "../../doubles/stub_indexed_db";

describe("getOrCreateKey", () => {
  let restore: () => void;

  afterEach(() => {
    restore?.();
  });

  it("should create a non-extractable AES-GCM key when the store is empty", async () => {
    // given
    restore = installStubIndexedDB(new StubIndexedDB());

    // when
    const key = await getOrCreateKey();

    // then
    expect(key.algorithm).toEqual({ name: "AES-GCM", length: 256 });
    expect(key.extractable).toBe(false);
    expect(key.usages.sort()).toEqual(["decrypt", "encrypt"]);
  });

  it("should return the stored key on a later call so ciphertext stays readable", async () => {
    // given
    restore = installStubIndexedDB(new StubIndexedDB());
    const first = await getOrCreateKey();
    const ciphertext = await encrypt(first, "ghp_persisted");

    // when
    const second = await getOrCreateKey();

    // then
    expect(second).toBe(first);
    await expect(decrypt(second, ciphertext)).resolves.toBe("ghp_persisted");
  });

  it("should fall back to a throwaway key when the database cannot be opened", async () => {
    // given
    restore = installStubIndexedDB(new StubIndexedDB("open"));

    // when
    const key = await getOrCreateKey();

    // then
    expect(key.algorithm).toEqual({ name: "AES-GCM", length: 256 });
  });

  it("should fall back to a throwaway key when reading the stored key fails", async () => {
    // given
    restore = installStubIndexedDB(new StubIndexedDB("get"));

    // when
    const key = await getOrCreateKey();

    // then
    await expect(decrypt(key, await encrypt(key, "usable"))).resolves.toBe("usable");
  });

  it("should fall back to a throwaway key when the new key cannot be persisted", async () => {
    // given
    restore = installStubIndexedDB(new StubIndexedDB("put"));

    // when
    const key = await getOrCreateKey();

    // then
    await expect(decrypt(key, await encrypt(key, "usable"))).resolves.toBe("usable");
  });

  it("should not share keys between two independent databases", async () => {
    // given
    restore = installStubIndexedDB(new StubIndexedDB());
    const first = await getOrCreateKey();
    restore();

    // when
    restore = installStubIndexedDB(new StubIndexedDB());
    const second = await getOrCreateKey();

    // then
    expect(second).not.toBe(first);
  });
});
