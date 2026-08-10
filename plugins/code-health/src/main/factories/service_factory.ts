import type { BadgeRepository } from "../../domain/repositories/badge_repository";
import type { ComplianceRepository } from "../../domain/repositories/compliance_repository";
import type { ContributorRepository } from "../../domain/repositories/contributor_repository";
import type { RepositoryRepository } from "../../domain/repositories/repository_repository";
import type { SonarRepository } from "../../domain/repositories/sonar_repository";
import type { WakaTimeRepository } from "../../domain/repositories/wakatime_repository";
import type { AsyncAuthenticationService } from "../../domain/services/authentication_service";
import type { PlatformContributorService } from "../../domain/services/contributor_service";
import type { PlatformDashboardService } from "../../domain/services/dashboard_service";
import { DeferredAuthenticationService } from "../../infrastructure/services/deferred_authentication_service";
import { EncryptedAuthenticationService } from "../../infrastructure/services/encrypted_authentication_service";
import { LocalStorageAuthenticationService } from "../../infrastructure/services/local_storage_authentication_service";
import { GitHubDashboardService } from "../../service/github_dashboard_service";
import { GitHubContributorService } from "../../service/github_contributor_service";

export const createAuthenticationService = (): AsyncAuthenticationService =>
  new DeferredAuthenticationService(() =>
    EncryptedAuthenticationService.create(new LocalStorageAuthenticationService()),
  );

export const createDashboardService = (
  repositoryRepository: RepositoryRepository,
  sonarRepository: SonarRepository,
  complianceRepository: ComplianceRepository,
  badgeRepository: BadgeRepository,
): PlatformDashboardService =>
  new GitHubDashboardService(
    repositoryRepository,
    sonarRepository,
    complianceRepository,
    badgeRepository,
  );

export const createContributorService = (
  contributorRepository: ContributorRepository,
  sonarRepository: SonarRepository,
  wakaTimeRepository: WakaTimeRepository,
): PlatformContributorService =>
  new GitHubContributorService(contributorRepository, sonarRepository, wakaTimeRepository);
