import type { AuthenticationService } from "../../domain/services/authentication_service";

const TOKEN_KEY = "code-health:token";
const USERNAME_KEY = "code-health:username";
const SONAR_TOKEN_KEY = "code-health:sonar-token";
const SONAR_TYPE_KEY = "code-health:sonar-type";
const SONAR_URL_KEY = "code-health:sonar-url";
const WAKATIME_TOKEN_KEY = "code-health:wakatime-token";
const PLATFORM_KEY = "code-health:platform";

export class LocalStorageAuthenticationService implements AuthenticationService {
  private readonly storage: Storage;

  constructor(storage: Storage = localStorage) {
    this.storage = storage;
  }

  getToken(): string | null {
    return this.storage.getItem(TOKEN_KEY);
  }

  setToken(token: string): void {
    this.storage.setItem(TOKEN_KEY, token);
  }

  clearToken(): void {
    this.storage.removeItem(TOKEN_KEY);
    this.storage.removeItem(USERNAME_KEY);
    this.storage.removeItem(SONAR_TOKEN_KEY);
    this.storage.removeItem(SONAR_TYPE_KEY);
    this.storage.removeItem(SONAR_URL_KEY);
    this.storage.removeItem(WAKATIME_TOKEN_KEY);
    this.storage.removeItem(PLATFORM_KEY);
  }

  getUsername(): string | null {
    return this.storage.getItem(USERNAME_KEY);
  }

  setUsername(username: string): void {
    this.storage.setItem(USERNAME_KEY, username);
  }

  getSonarToken(): string | null {
    return this.storage.getItem(SONAR_TOKEN_KEY);
  }

  setSonarToken(token: string): void {
    this.storage.setItem(SONAR_TOKEN_KEY, token);
  }

  clearSonar(): void {
    this.storage.removeItem(SONAR_TOKEN_KEY);
    this.storage.removeItem(SONAR_TYPE_KEY);
    this.storage.removeItem(SONAR_URL_KEY);
  }

  getSonarType(): string | null {
    return this.storage.getItem(SONAR_TYPE_KEY);
  }

  setSonarType(type: string): void {
    this.storage.setItem(SONAR_TYPE_KEY, type);
  }

  getSonarUrl(): string | null {
    return this.storage.getItem(SONAR_URL_KEY);
  }

  setSonarUrl(url: string): void {
    this.storage.setItem(SONAR_URL_KEY, url);
  }

  getWakaTimeToken(): string | null {
    return this.storage.getItem(WAKATIME_TOKEN_KEY);
  }

  setWakaTimeToken(token: string): void {
    this.storage.setItem(WAKATIME_TOKEN_KEY, token);
  }

  clearWakaTimeToken(): void {
    this.storage.removeItem(WAKATIME_TOKEN_KEY);
  }

  getPlatform(): string | null {
    return this.storage.getItem(PLATFORM_KEY);
  }

  setPlatform(platform: string): void {
    this.storage.setItem(PLATFORM_KEY, platform);
  }
}
