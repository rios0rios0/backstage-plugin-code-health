import type {
  AsyncAuthenticationService,
  AuthenticationService,
} from "../../domain/services/authentication_service";

/**
 * Adapts an asynchronously constructed {@link AuthenticationService} to the
 * synchronous shape a Backstage utility API must expose.
 *
 * Reads return `null` until the delegate is available; writes are queued on the
 * initialization promise so their relative order is preserved.
 */
export class DeferredAuthenticationService implements AsyncAuthenticationService {
  private delegate: AuthenticationService | null = null;
  private readonly initialization: Promise<void>;

  constructor(create: () => Promise<AuthenticationService>) {
    this.initialization = create()
      .then((delegate) => {
        this.delegate = delegate;
      })
      .catch(() => {
        // A broken key store must not block the UI; the plugin falls back to
        // "not configured" and the user can re-enter their credentials.
      });
  }

  whenReady(): Promise<void> {
    return this.initialization;
  }

  isReady(): boolean {
    return this.delegate !== null;
  }

  private enqueue(action: (delegate: AuthenticationService) => void): void {
    if (this.delegate) {
      action(this.delegate);
      return;
    }
    void this.initialization.then(() => {
      if (this.delegate) action(this.delegate);
    });
  }

  getToken(): string | null {
    return this.delegate?.getToken() ?? null;
  }

  setToken(token: string): void {
    this.enqueue((delegate) => delegate.setToken(token));
  }

  clearToken(): void {
    this.enqueue((delegate) => delegate.clearToken());
  }

  getUsername(): string | null {
    return this.delegate?.getUsername() ?? null;
  }

  setUsername(username: string): void {
    this.enqueue((delegate) => delegate.setUsername(username));
  }

  getSonarToken(): string | null {
    return this.delegate?.getSonarToken() ?? null;
  }

  setSonarToken(token: string): void {
    this.enqueue((delegate) => delegate.setSonarToken(token));
  }

  clearSonar(): void {
    this.enqueue((delegate) => delegate.clearSonar());
  }

  getSonarType(): string | null {
    return this.delegate?.getSonarType() ?? null;
  }

  setSonarType(type: string): void {
    this.enqueue((delegate) => delegate.setSonarType(type));
  }

  getSonarUrl(): string | null {
    return this.delegate?.getSonarUrl() ?? null;
  }

  setSonarUrl(url: string): void {
    this.enqueue((delegate) => delegate.setSonarUrl(url));
  }

  getWakaTimeToken(): string | null {
    return this.delegate?.getWakaTimeToken() ?? null;
  }

  setWakaTimeToken(token: string): void {
    this.enqueue((delegate) => delegate.setWakaTimeToken(token));
  }

  clearWakaTimeToken(): void {
    this.enqueue((delegate) => delegate.clearWakaTimeToken());
  }

  getPlatform(): string | null {
    return this.delegate?.getPlatform() ?? null;
  }

  setPlatform(platform: string): void {
    this.enqueue((delegate) => delegate.setPlatform(platform));
  }
}
