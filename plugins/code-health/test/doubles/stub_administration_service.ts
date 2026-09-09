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
  private resetError: Error | null = null;

  readonly resets: ResetIngestionRequest[] = [];
  accessCalls = 0;

  withAdministrator(retentionDays = 365): this {
    this.access = { canResetIngestion: true, retentionDays };
    return this;
  }

  withAccessError(error: Error): this {
    this.accessError = error;
    return this;
  }

  withResetError(error: Error): this {
    this.resetError = error;
    return this;
  }

  async getAccess(): Promise<GetAccessResponse> {
    this.accessCalls += 1;
    if (this.accessError) throw this.accessError;
    return this.access;
  }

  async resetIngestion(request: ResetIngestionRequest): Promise<ResetIngestionResponse> {
    this.resets.push(request);
    if (this.resetError) throw this.resetError;
    return { repositories: 3, days: request.days, triggered: ["code-health.ingest"] };
  }
}
