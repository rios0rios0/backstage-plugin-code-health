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

describe("LocalStorageAuthenticationService", () => {
  let storage: InMemoryStorage;
  let service: LocalStorageAuthenticationService;

  beforeEach(() => {
    storage = new InMemoryStorage();
    service = new LocalStorageAuthenticationService(storage);
  });

  it("should return token when token was previously set", () => {
    // given
    service.setToken("ghp_test123");

    // when
    const result = service.getToken();

    // then
    expect(result).toBe("ghp_test123");
  });

  it("should return null when no token exists", () => {
    // when
    const result = service.getToken();

    // then
    expect(result).toBeNull();
  });

  it("should return username when username was previously set", () => {
    // given
    service.setUsername("testuser");

    // when
    const result = service.getUsername();

    // then
    expect(result).toBe("testuser");
  });

  it("should clear all credentials when clearToken is called", () => {
    // given
    service.setToken("ghp_test123");
    service.setUsername("testuser");
    service.setSonarToken("squ_sonar123");
    service.setPlatform("github");

    // when
    service.clearToken();

    // then
    expect(service.getToken()).toBeNull();
    expect(service.getUsername()).toBeNull();
    expect(service.getSonarToken()).toBeNull();
    expect(service.getPlatform()).toBeNull();
  });

  it("should return sonar token when sonar token was previously set", () => {
    // given
    service.setSonarToken("squ_sonar123");

    // when
    const result = service.getSonarToken();

    // then
    expect(result).toBe("squ_sonar123");
  });

  it("should return null when no sonar token exists", () => {
    // when
    const result = service.getSonarToken();

    // then
    expect(result).toBeNull();
  });

  it("should return platform when platform was previously set", () => {
    // given
    service.setPlatform("azure-devops");

    // when
    const result = service.getPlatform();

    // then
    expect(result).toBe("azure-devops");
  });

  it("should return null when no platform exists", () => {
    // when
    const result = service.getPlatform();

    // then
    expect(result).toBeNull();
  });
});
