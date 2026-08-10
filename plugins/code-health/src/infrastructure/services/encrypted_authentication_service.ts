import type { AuthenticationService } from "../../domain/services/authentication_service";
import { getOrCreateKey } from "../crypto/crypto_key_store";
import { decrypt, encrypt } from "../crypto/crypto_utils";

export class EncryptedAuthenticationService implements AuthenticationService {
  private readonly delegate: AuthenticationService;
  private readonly key: CryptoKey;
  private readonly cache = new Map<string, string | null>();
  private readonly versions = new Map<string, number>();

  private constructor(delegate: AuthenticationService, key: CryptoKey) {
    this.delegate = delegate;
    this.key = key;
  }

  static async create(delegate: AuthenticationService): Promise<EncryptedAuthenticationService> {
    const key = await getOrCreateKey();
    const service = new EncryptedAuthenticationService(delegate, key);
    await service.initializeCache();
    return service;
  }

  private async initializeCache(): Promise<void> {
    const entries: [string, string | null][] = [
      ["token", this.delegate.getToken()],
      ["sonarToken", this.delegate.getSonarToken()],
      ["wakaTimeToken", this.delegate.getWakaTimeToken()],
    ];

    for (const [cacheKey, raw] of entries) {
      if (raw === null) {
        this.cache.set(cacheKey, null);
      } else {
        this.cache.set(cacheKey, await decrypt(this.key, raw));
      }
    }
  }

  private bumpVersion(cacheKey: string): number {
    const next = (this.versions.get(cacheKey) ?? 0) + 1;
    this.versions.set(cacheKey, next);
    return next;
  }

  private setEncrypted(cacheKey: string, plaintext: string, setter: (value: string) => void): void {
    const version = this.bumpVersion(cacheKey);
    this.cache.set(cacheKey, plaintext);
    encrypt(this.key, plaintext)
      .then((encrypted) => {
        if (this.versions.get(cacheKey) === version) {
          setter(encrypted);
        }
      })
      .catch(() => {});
  }

  getToken(): string | null {
    return this.cache.get("token") ?? null;
  }

  setToken(token: string): void {
    this.setEncrypted("token", token, (v) => this.delegate.setToken(v));
  }

  clearToken(): void {
    this.bumpVersion("token");
    this.bumpVersion("sonarToken");
    this.bumpVersion("wakaTimeToken");
    this.cache.set("token", null);
    this.cache.set("sonarToken", null);
    this.cache.set("wakaTimeToken", null);
    this.delegate.clearToken();
  }

  getUsername(): string | null {
    return this.delegate.getUsername();
  }

  setUsername(username: string): void {
    this.delegate.setUsername(username);
  }

  getSonarToken(): string | null {
    return this.cache.get("sonarToken") ?? null;
  }

  setSonarToken(token: string): void {
    this.setEncrypted("sonarToken", token, (v) => this.delegate.setSonarToken(v));
  }

  clearSonar(): void {
    this.bumpVersion("sonarToken");
    this.cache.set("sonarToken", null);
    this.delegate.clearSonar();
  }

  getSonarType(): string | null {
    return this.delegate.getSonarType();
  }

  setSonarType(type: string): void {
    this.delegate.setSonarType(type);
  }

  getSonarUrl(): string | null {
    return this.delegate.getSonarUrl();
  }

  setSonarUrl(url: string): void {
    this.delegate.setSonarUrl(url);
  }

  getWakaTimeToken(): string | null {
    return this.cache.get("wakaTimeToken") ?? null;
  }

  setWakaTimeToken(token: string): void {
    this.setEncrypted("wakaTimeToken", token, (v) => this.delegate.setWakaTimeToken(v));
  }

  clearWakaTimeToken(): void {
    this.bumpVersion("wakaTimeToken");
    this.cache.set("wakaTimeToken", null);
    this.delegate.clearWakaTimeToken();
  }

  getPlatform(): string | null {
    return this.delegate.getPlatform();
  }

  setPlatform(platform: string): void {
    this.delegate.setPlatform(platform);
  }
}
