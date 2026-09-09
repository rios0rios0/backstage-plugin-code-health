import type {
  GetAccessResponse,
  ResetIngestionRequest,
  ResetIngestionResponse,
} from "@rios0rios0/backstage-plugin-code-health-common";
import type { AdministrationService } from "../../src/domain/services/dashboard_service";

/**
 * Canned answers for who may reset the history, and a record of the resets
 * asked for.
 *
 * Nobody is an administrator by default, which mirrors the backend: a fresh
 * install names no administrators, so the button must not appear until one is.
 */
export class StubAdministrationService implements AdministrationService {
  private access: GetAccessResponse = { canResetIngestion: false, retentionDays: 365 };
  private accessError: Error | null = null;
  private resetError: unknown = null;
  private repositories = 3;
  private held: Promise<void> | null = null;
  private release: () => void = () => undefined;

  readonly resets: ResetIngestionRequest[] = [];
  accessCalls = 0;

  withAdministrator(retentionDays = 365): this {
    this.access = { canResetIngestion: true, retentionDays };
    return this;
  }

  /** How many repositories a reset reports having sent back to the start. */
  withRepositoryCount(repositories: number): this {
    this.repositories = repositories;
    return this;
  }

  withAccessError(error: Error): this {
    this.accessError = error;
    return this;
  }

  /**
   * What the next reset rejects with. Typed as `unknown` because a rejected
   * `fetch` chain settles with whatever it was handed, and the dialog has to
   * print that rather than an empty red line.
   */
  withResetError(error: unknown): this {
    this.resetError = error;
    return this;
  }

  /**
   * Holds every reset open until the returned function is called, so a test can
   * look at the dialog while the request is still in flight.
   */
  holdResets(): () => void {
    this.held = new Promise<void>((resolve) => {
      this.release = resolve;
    });
    return () => this.release();
  }

  async getAccess(): Promise<GetAccessResponse> {
    this.accessCalls += 1;
    if (this.accessError) throw this.accessError;
    return this.access;
  }

  async resetIngestion(request: ResetIngestionRequest): Promise<ResetIngestionResponse> {
    this.resets.push(request);
    if (this.held) await this.held;
    if (this.resetError !== null) return Promise.reject(this.resetError);
    return {
      repositories: this.repositories,
      days: request.days,
      triggered: ["code-health.ingest"],
    };
  }
}
