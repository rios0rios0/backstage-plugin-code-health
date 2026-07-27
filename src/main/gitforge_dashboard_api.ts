import type { GitforgeConfig } from "../domain/entities/gitforge_config";
import type { Repository } from "../domain/entities/repository";
import type { AuthenticationService } from "../domain/services/authentication_service";
import type { DashboardService } from "../domain/services/dashboard_service";
import { NOT_CONFIGURED_MESSAGE, resolveSettings } from "../service/settings_resolver";
import type { GitforgeClients } from "./factories/repository_factory";
import {
  createBadgeRepository,
  createComplianceRepository,
  createRepositoryRepository,
  createSonarRepository,
} from "./factories/repository_factory";
import { createDashboardService } from "./factories/service_factory";

export interface GitforgeApiDependencies {
  readonly clients: GitforgeClients;
  readonly authService: AuthenticationService;
  readonly config: GitforgeConfig;
}

/**
 * Utility API backing the repositories view. The object graph is rebuilt on every
 * call so that changing the platform or an integration token on the Settings tab
 * takes effect immediately.
 */
export class GitforgeDashboardApi implements DashboardService {
  private readonly dependencies: GitforgeApiDependencies;

  constructor(dependencies: GitforgeApiDependencies) {
    this.dependencies = dependencies;
  }

  async listRepositories(): Promise<Repository[]> {
    const { clients, authService, config } = this.dependencies;
    const settings = resolveSettings(authService, config);

    if (!settings.ready || !settings.platform || !settings.organization) {
      throw new Error(NOT_CONFIGURED_MESSAGE);
    }

    const service = createDashboardService(
      createRepositoryRepository(settings.platform, clients),
      createSonarRepository(clients, settings.sonar),
      createComplianceRepository(settings.platform, clients),
      createBadgeRepository(settings.platform, clients),
    );

    return service.listRepositories(settings.token, settings.organization);
  }
}
