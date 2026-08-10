import type { AuthenticationService } from "../../src/domain/services/authentication_service";

export class StubAuthenticationService implements AuthenticationService {
  private store = new Map<string, string>();

  getToken(): string | null {
    return this.store.get("token") ?? null;
  }

  setToken(token: string): void {
    this.store.set("token", token);
  }

  clearToken(): void {
    this.store.delete("token");
    this.store.delete("username");
    this.store.delete("platform");
  }

  getUsername(): string | null {
    return this.store.get("username") ?? null;
  }

  setUsername(username: string): void {
    this.store.set("username", username);
  }

  getSonarToken(): string | null {
    return this.store.get("sonarToken") ?? null;
  }

  setSonarToken(token: string): void {
    this.store.set("sonarToken", token);
  }

  clearSonar(): void {
    this.store.delete("sonarToken");
    this.store.delete("sonarType");
    this.store.delete("sonarUrl");
  }

  getSonarType(): string | null {
    return this.store.get("sonarType") ?? null;
  }

  setSonarType(type: string): void {
    this.store.set("sonarType", type);
  }

  getSonarUrl(): string | null {
    return this.store.get("sonarUrl") ?? null;
  }

  setSonarUrl(url: string): void {
    this.store.set("sonarUrl", url);
  }

  getWakaTimeToken(): string | null {
    return this.store.get("wakaTimeToken") ?? null;
  }

  setWakaTimeToken(token: string): void {
    this.store.set("wakaTimeToken", token);
  }

  clearWakaTimeToken(): void {
    this.store.delete("wakaTimeToken");
  }

  getPlatform(): string | null {
    return this.store.get("platform") ?? null;
  }

  setPlatform(platform: string): void {
    this.store.set("platform", platform);
  }
}
