import type {
  IntegrationCapabilities,
  IntegrationId,
} from "@rios0rios0/backstage-plugin-code-health-common";
import { NO_INTEGRATIONS } from "@rios0rios0/backstage-plugin-code-health-common";
import type { IntegrationsService } from "../../src/domain/services/dashboard_service";

/** Canned answers for what the backend was configured with. */
export class StubIntegrationsService implements IntegrationsService {
  private capabilities: IntegrationCapabilities = NO_INTEGRATIONS;
  private failure: Error | null = null;

  calls = 0;

  withEnabled(...ids: readonly IntegrationId[]): this {
    this.capabilities = ids.reduce<IntegrationCapabilities>(
      (capabilities, id) => ({ ...capabilities, [id]: true }),
      NO_INTEGRATIONS,
    );
    return this;
  }

  withFailure(failure: Error): this {
    this.failure = failure;
    return this;
  }

  async getCapabilities(): Promise<IntegrationCapabilities> {
    this.calls += 1;
    if (this.failure) throw this.failure;
    return this.capabilities;
  }
}
