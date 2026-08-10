import type { Contributor } from "../domain/entities/contributor";
import type { ContributorService } from "../domain/services/contributor_service";
import { NOT_CONFIGURED_MESSAGE, resolveSettings } from "../service/settings_resolver";
import {
  createContributorRepository,
  createSonarRepository,
  createWakaTimeRepository,
} from "./factories/repository_factory";
import { createContributorService } from "./factories/service_factory";
import type { CodeHealthApiDependencies } from "./code_health_repositories_api";

/**
 * Utility API backing the contributors view. Sonar and WakaTime enrichment is
 * enabled only when the corresponding integration is configured.
 */
export class CodeHealthContributorsApi implements ContributorService {
  private readonly dependencies: CodeHealthApiDependencies;

  constructor(dependencies: CodeHealthApiDependencies) {
    this.dependencies = dependencies;
  }

  async listContributors(
    dateFrom: string | null,
    dateTo: string | null,
  ): Promise<Contributor[]> {
    const { clients, authService, config } = this.dependencies;
    const settings = resolveSettings(authService, config);

    if (!settings.ready || !settings.platform || !settings.organization) {
      throw new Error(NOT_CONFIGURED_MESSAGE);
    }

    const service = createContributorService(
      createContributorRepository(settings.platform, clients),
      createSonarRepository(clients, settings.sonar),
      createWakaTimeRepository(clients, settings.wakaTimeToken),
    );

    return service.listContributors(settings.token, settings.organization, dateFrom, dateTo);
  }
}
