import {
  createBadgeRepository,
  createComplianceRepository,
  createRepositoryRepository,
  createContributorRepository,
  createSonarRepository,
  createWakaTimeRepository,
} from "../../../src/main/factories/repository_factory";
import { AdoBadgeRepository } from "../../../src/infrastructure/repositories/ado_badge_repository";
import { AdoComplianceRepository } from "../../../src/infrastructure/repositories/ado_compliance_repository";
import { AdoRestRepositoryRepository } from "../../../src/infrastructure/repositories/ado_rest_repository_repository";
import { AdoRestContributorRepository } from "../../../src/infrastructure/repositories/ado_rest_contributor_repository";
import { GitHubBadgeRepository } from "../../../src/infrastructure/repositories/github_badge_repository";
import { GitHubComplianceRepository } from "../../../src/infrastructure/repositories/github_compliance_repository";
import { GitHubGraphQLRepositoryRepository } from "../../../src/infrastructure/repositories/github_graphql_repository_repository";
import { GitHubGraphQLContributorRepository } from "../../../src/infrastructure/repositories/github_graphql_contributor_repository";
import { SonarRepositoryImpl, NoOpSonarRepository } from "../../../src/infrastructure/repositories/sonar_repository_impl";
import { WakaTimeRepositoryImpl, NoOpWakaTimeRepository } from "../../../src/infrastructure/repositories/wakatime_repository_impl";
import { createStubClients } from "../../doubles/stub_http_clients";

describe("repository_factory", () => {
  const clients = createStubClients();

  describe("createRepositoryRepository", () => {
    it("should return GitHubGraphQLRepositoryRepository for github", () => {
      // given / when
      const repo = createRepositoryRepository("github", clients);

      // then
      expect(repo).toBeInstanceOf(GitHubGraphQLRepositoryRepository);
    });

    it("should return AdoRestRepositoryRepository for azure-devops", () => {
      // given / when
      const repo = createRepositoryRepository("azure-devops", clients);

      // then
      expect(repo).toBeInstanceOf(AdoRestRepositoryRepository);
    });
  });

  describe("createContributorRepository", () => {
    it("should return GitHubGraphQLContributorRepository for github", () => {
      // given / when
      const repo = createContributorRepository("github", clients);

      // then
      expect(repo).toBeInstanceOf(GitHubGraphQLContributorRepository);
    });

    it("should return AdoRestContributorRepository for azure-devops", () => {
      // given / when
      const repo = createContributorRepository("azure-devops", clients);

      // then
      expect(repo).toBeInstanceOf(AdoRestContributorRepository);
    });
  });

  describe("createSonarRepository", () => {
    it("should return SonarRepositoryImpl when config is provided", () => {
      // given
      const config = { type: "cloud" as const, token: "tok", baseUrl: "https://sonar.io" };

      // when
      const repo = createSonarRepository(clients, config);

      // then
      expect(repo).toBeInstanceOf(SonarRepositoryImpl);
    });

    it("should return NoOpSonarRepository when no config", () => {
      // given / when
      const repo = createSonarRepository(clients);

      // then
      expect(repo).toBeInstanceOf(NoOpSonarRepository);
    });
  });

  describe("createWakaTimeRepository", () => {
    it("should return WakaTimeRepositoryImpl when token is provided", () => {
      // given / when
      const repo = createWakaTimeRepository(clients, "waka-token");

      // then
      expect(repo).toBeInstanceOf(WakaTimeRepositoryImpl);
    });

    it("should return NoOpWakaTimeRepository when no token", () => {
      // given / when
      const repo = createWakaTimeRepository(clients);

      // then
      expect(repo).toBeInstanceOf(NoOpWakaTimeRepository);
    });
  });

  describe("createComplianceRepository", () => {
    it("should return GitHubComplianceRepository for github", () => {
      // given / when
      const repo = createComplianceRepository("github", clients);

      // then
      expect(repo).toBeInstanceOf(GitHubComplianceRepository);
    });

    it("should return AdoComplianceRepository for azure-devops", () => {
      // given / when
      const repo = createComplianceRepository("azure-devops", clients);

      // then
      expect(repo).toBeInstanceOf(AdoComplianceRepository);
    });
  });

  describe("createBadgeRepository", () => {
    it("should return GitHubBadgeRepository for github", () => {
      // given / when
      const repo = createBadgeRepository("github", clients);

      // then
      expect(repo).toBeInstanceOf(GitHubBadgeRepository);
    });

    it("should return AdoBadgeRepository for azure-devops", () => {
      // given / when
      const repo = createBadgeRepository("azure-devops", clients);

      // then
      expect(repo).toBeInstanceOf(AdoBadgeRepository);
    });
  });
});
