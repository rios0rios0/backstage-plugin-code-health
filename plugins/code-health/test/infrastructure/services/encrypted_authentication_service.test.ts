import { waitFor } from "@testing-library/react";
import { EncryptedAuthenticationService } from "../../../src/infrastructure/services/encrypted_authentication_service";
import { LocalStorageAuthenticationService } from "../../../src/infrastructure/services/local_storage_authentication_service";

class InMemoryStorage implements Storage {
  private store = new Map<string, string>();

  get length(): number {
    return this.store.size;
  }

  clear(): void {
    this.store.clear();
  }

  getItem(key: string): string | null {
    return this.store.get(key) ?? null;
  }

  key(index: number): string | null {
    return [...this.store.keys()][index] ?? null;
  }

  removeItem(key: string): void {
    this.store.delete(key);
  }

  setItem(key: string, value: string): void {
    this.store.set(key, value);
  }
}

describe("EncryptedAuthenticationService", () => {
  let storage: InMemoryStorage;
  let delegate: LocalStorageAuthenticationService;

  beforeEach(() => {
    storage = new InMemoryStorage();
    delegate = new LocalStorageAuthenticationService(storage);
  });

  it("should encrypt token on set and decrypt on get", async () => {
    // given
    const service = await EncryptedAuthenticationService.create(delegate);

    // when
    service.setToken("ghp_test123");

    // then
    expect(service.getToken()).toBe("ghp_test123");
    await waitFor(() => {
      const raw = delegate.getToken();
      expect(raw).not.toBe("ghp_test123");
      expect(raw?.startsWith("enc:")).toBe(true);
    });
  });

  it("should return null when no token exists", async () => {
    // given
    const service = await EncryptedAuthenticationService.create(delegate);

    // when
    const result = service.getToken();

    // then
    expect(result).toBeNull();
  });

  it("should pass non-sensitive values through without encryption", async () => {
    // given
    const service = await EncryptedAuthenticationService.create(delegate);

    // when
    service.setUsername("testuser");
    service.setPlatform("github");
    service.setSonarType("cloud");
    service.setSonarUrl("https://sonar.example.com");

    // then
    expect(service.getUsername()).toBe("testuser");
    expect(service.getPlatform()).toBe("github");
    expect(service.getSonarType()).toBe("cloud");
    expect(service.getSonarUrl()).toBe("https://sonar.example.com");
    // non-sensitive values stored as plaintext in delegate
    expect(delegate.getUsername()).toBe("testuser");
    expect(delegate.getPlatform()).toBe("github");
  });

  it("should clear token from cache and delegate", async () => {
    // given
    const service = await EncryptedAuthenticationService.create(delegate);
    service.setToken("ghp_test123");
    service.setSonarToken("squ_sonar123");
    service.setWakaTimeToken("wk_test123");
    service.setUsername("testuser");

    // when
    service.clearToken();

    // then
    expect(service.getToken()).toBeNull();
    expect(service.getSonarToken()).toBeNull();
    expect(service.getWakaTimeToken()).toBeNull();
    expect(service.getUsername()).toBeNull();
  });

  it("should handle legacy plaintext values from pre-encryption storage", async () => {
    // given
    delegate.setToken("ghp_plaintext_token");
    delegate.setSonarToken("squ_plaintext_sonar");

    // when
    const service = await EncryptedAuthenticationService.create(delegate);

    // then
    expect(service.getToken()).toBe("ghp_plaintext_token");
    expect(service.getSonarToken()).toBe("squ_plaintext_sonar");
  });

  it("should encrypt sonar token on set and decrypt on get", async () => {
    // given
    const service = await EncryptedAuthenticationService.create(delegate);

    // when
    service.setSonarToken("squ_sonar123");

    // then
    expect(service.getSonarToken()).toBe("squ_sonar123");
    await waitFor(() => {
      expect(delegate.getSonarToken()?.startsWith("enc:")).toBe(true);
    });
  });

  it("should encrypt wakatime token on set and decrypt on get", async () => {
    // given
    const service = await EncryptedAuthenticationService.create(delegate);

    // when
    service.setWakaTimeToken("wk_test123");

    // then
    expect(service.getWakaTimeToken()).toBe("wk_test123");
    await waitFor(() => {
      expect(delegate.getWakaTimeToken()?.startsWith("enc:")).toBe(true);
    });
  });

  it("should clear only sonar credentials when clearSonar is called", async () => {
    // given
    const service = await EncryptedAuthenticationService.create(delegate);
    service.setToken("ghp_test123");
    service.setSonarToken("squ_sonar123");
    service.setWakaTimeToken("wk_test123");

    // when
    service.clearSonar();

    // then
    expect(service.getSonarToken()).toBeNull();
    expect(service.getToken()).toBe("ghp_test123");
    expect(service.getWakaTimeToken()).toBe("wk_test123");
  });

  it("should clear only wakatime token when clearWakaTimeToken is called", async () => {
    // given
    const service = await EncryptedAuthenticationService.create(delegate);
    service.setToken("ghp_test123");
    service.setWakaTimeToken("wk_test123");

    // when
    service.clearWakaTimeToken();

    // then
    expect(service.getWakaTimeToken()).toBeNull();
    expect(service.getToken()).toBe("ghp_test123");
  });
});
