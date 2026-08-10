import type { Platform } from "../../domain/entities/platform";
import type { BadgeRepository } from "../../domain/repositories/badge_repository";
import type { ComplianceRepository } from "../../domain/repositories/compliance_repository";
import type { ContributorRepository } from "../../domain/repositories/contributor_repository";
import type { RepositoryRepository } from "../../domain/repositories/repository_repository";
import type { SonarRepository } from "../../domain/repositories/sonar_repository";
import type { WakaTimeRepository } from "../../domain/repositories/wakatime_repository";
import type { AdoRestClient } from "../../infrastructure/http/ado_rest_client";
import type { GraphQLClient } from "../../infrastructure/http/graphql_client";
import type { SonarClient } from "../../infrastructure/http/sonar_client";
import type { WakaTimeClient } from "../../infrastructure/http/wakatime_client";
import { AdoBadgeRepository } from "../../infrastructure/repositories/ado_badge_repository";
import { AdoComplianceRepository } from "../../infrastructure/repositories/ado_compliance_repository";
import { AdoRestContributorRepository } from "../../infrastructure/repositories/ado_rest_contributor_repository";
import { AdoRestRepositoryRepository } from "../../infrastructure/repositories/ado_rest_repository_repository";
import { GitHubBadgeRepository } from "../../infrastructure/repositories/github_badge_repository";
import { GitHubComplianceRepository } from "../../infrastructure/repositories/github_compliance_repository";
import { GitHubGraphQLContributorRepository } from "../../infrastructure/repositories/github_graphql_contributor_repository";
import { GitHubGraphQLRepositoryRepository } from "../../infrastructure/repositories/github_graphql_repository_repository";
import { NoOpSonarRepository, type SonarConfig, SonarRepositoryImpl } from "../../infrastructure/repositories/sonar_repository_impl";
import { NoOpWakaTimeRepository, WakaTimeRepositoryImpl } from "../../infrastructure/repositories/wakatime_repository_impl";

/** HTTP clients shared by every repository implementation. */
export interface CodeHealthClients {
  readonly graphQLClient: GraphQLClient;
  readonly adoRestClient: AdoRestClient;
  readonly sonarClient: SonarClient;
  readonly wakaTimeClient: WakaTimeClient;
}

const repositoryHandlers: Record<Platform, (clients: CodeHealthClients) => RepositoryRepository> = {
  github: (clients) => new GitHubGraphQLRepositoryRepository(clients.graphQLClient),
  "azure-devops": (clients) => new AdoRestRepositoryRepository(clients.adoRestClient),
};

const contributorHandlers: Record<Platform, (clients: CodeHealthClients) => ContributorRepository> = {
  github: (clients) => new GitHubGraphQLContributorRepository(clients.graphQLClient),
  "azure-devops": (clients) => new AdoRestContributorRepository(clients.adoRestClient),
};

const complianceHandlers: Record<Platform, (clients: CodeHealthClients) => ComplianceRepository> = {
  github: (clients) => new GitHubComplianceRepository(clients.graphQLClient),
  "azure-devops": (clients) => new AdoComplianceRepository(clients.adoRestClient),
};

const badgeHandlers: Record<Platform, (clients: CodeHealthClients) => BadgeRepository> = {
  github: (clients) => new GitHubBadgeRepository(clients.graphQLClient),
  "azure-devops": () => new AdoBadgeRepository(),
};

export const createRepositoryRepository = (
  platform: Platform,
  clients: CodeHealthClients,
): RepositoryRepository => repositoryHandlers[platform](clients);

export const createContributorRepository = (
  platform: Platform,
  clients: CodeHealthClients,
): ContributorRepository => contributorHandlers[platform](clients);

export const createComplianceRepository = (
  platform: Platform,
  clients: CodeHealthClients,
): ComplianceRepository => complianceHandlers[platform](clients);

export const createBadgeRepository = (
  platform: Platform,
  clients: CodeHealthClients,
): BadgeRepository => badgeHandlers[platform](clients);

export const createSonarRepository = (
  clients: CodeHealthClients,
  config?: SonarConfig | null,
): SonarRepository =>
  config ? new SonarRepositoryImpl(clients.sonarClient, config) : new NoOpSonarRepository();

export const createWakaTimeRepository = (
  clients: CodeHealthClients,
  token?: string | null,
): WakaTimeRepository =>
  token === null || token === undefined
    ? new NoOpWakaTimeRepository()
    : new WakaTimeRepositoryImpl(clients.wakaTimeClient, token);
