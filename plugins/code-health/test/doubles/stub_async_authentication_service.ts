import type { AsyncAuthenticationService } from "../../src/domain/services/authentication_service";
import { StubAuthenticationService } from "./stub_authentication_service";

/**
 * In-memory {@link AsyncAuthenticationService}. Ready straight away by default;
 * pass a deferred promise to exercise the "still unwrapping the key" state.
 */
export class StubAsyncAuthenticationService
  extends StubAuthenticationService
  implements AsyncAuthenticationService
{
  private ready: boolean;
  private readonly readiness: Promise<void>;

  constructor(readiness?: Promise<void>) {
    super();
    if (!readiness) {
      this.ready = true;
      this.readiness = Promise.resolve();
      return;
    }
    this.ready = false;
    this.readiness = readiness.then(() => {
      this.ready = true;
    });
  }

  whenReady(): Promise<void> {
    return this.readiness;
  }

  isReady(): boolean {
    return this.ready;
  }
}
