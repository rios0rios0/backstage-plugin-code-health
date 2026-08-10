/**
 * Storage of the credentials a user configures for themselves. Values pinned by
 * an administrator in `app-config.yaml` are layered on top of this by
 * {@link ../../service/settings_resolver!resolveSettings}.
 */
export interface AuthenticationService {
  getToken(): string | null;
  setToken(token: string): void;
  clearToken(): void;
  getUsername(): string | null;
  setUsername(username: string): void;
  getSonarToken(): string | null;
  setSonarToken(token: string): void;
  clearSonar(): void;
  getSonarType(): string | null;
  setSonarType(type: string): void;
  getSonarUrl(): string | null;
  setSonarUrl(url: string): void;
  getWakaTimeToken(): string | null;
  setWakaTimeToken(token: string): void;
  clearWakaTimeToken(): void;
  getPlatform(): string | null;
  setPlatform(platform: string): void;
}

/**
 * An {@link AuthenticationService} whose backing store needs asynchronous setup
 * (unwrapping the encryption key and decrypting the stored values). Reads return
 * `null` until {@link AsyncAuthenticationService.whenReady} resolves; writes made
 * before that are applied once it does.
 */
export interface AsyncAuthenticationService extends AuthenticationService {
  whenReady(): Promise<void>;
  isReady(): boolean;
}
