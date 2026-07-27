import { decrypt, encrypt } from "../../../src/infrastructure/crypto/crypto_utils";

const generateTestKey = () =>
  crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);

describe("crypto_utils", () => {
  it("should decrypt to the original plaintext after encryption", async () => {
    // given
    const key = await generateTestKey();
    const plaintext = "ghp_secretToken123";

    // when
    const encrypted = await encrypt(key, plaintext);
    const decrypted = await decrypt(key, encrypted);

    // then
    expect(decrypted).toBe(plaintext);
  });

  it("should produce different ciphertext for the same plaintext", async () => {
    // given
    const key = await generateTestKey();
    const plaintext = "ghp_secretToken123";

    // when
    const encrypted1 = await encrypt(key, plaintext);
    const encrypted2 = await encrypt(key, plaintext);

    // then
    expect(encrypted1).not.toBe(encrypted2);
  });

  it("should return null when decrypting corrupted data", async () => {
    // given
    const key = await generateTestKey();

    // when
    const result = await decrypt(key, "enc:invalidbase64data!!!");

    // then
    expect(result).toBeNull();
  });

  it("should return null when decrypting with a different key", async () => {
    // given
    const key1 = await generateTestKey();
    const key2 = await generateTestKey();
    const encrypted = await encrypt(key1, "secret");

    // when
    const result = await decrypt(key2, encrypted);

    // then
    expect(result).toBeNull();
  });

  it("should return plaintext as-is when value has no enc: prefix", async () => {
    // given
    const key = await generateTestKey();

    // when
    const result = await decrypt(key, "plain-legacy-token");

    // then
    expect(result).toBe("plain-legacy-token");
  });

  it("should prefix encrypted values with enc:", async () => {
    // given
    const key = await generateTestKey();

    // when
    const encrypted = await encrypt(key, "some-token");

    // then
    expect(encrypted.startsWith("enc:")).toBe(true);
  });
});
