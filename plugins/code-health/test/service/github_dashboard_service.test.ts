import type { BadgeStatus } from "../../src/domain/entities/badge_status";
import type { ComplianceStatus } from "../../src/domain/entities/compliance_status";
import { GitHubDashboardService } from "../../src/service/github_dashboard_service";
import { RepositoryBuilder } from "../builders/repository_builder";
import { StubBadgeRepository } from "../doubles/stub_badge_repository";
import { StubComplianceRepository } from "../doubles/stub_compliance_repository";
import { StubRepositoryRepository } from "../doubles/stub_repository_repository";
import { StubSonarRepository } from "../doubles/stub_sonar_repository";

describe("GitHubDashboardService", () => {
  it("should return all repositories when listRepositories is called", async () => {
    // given
    const repos = [
      RepositoryBuilder.create().withName("repo-a").build(),
      RepositoryBuilder.create().withName("repo-b").build(),
    ];
    const repository = new StubRepositoryRepository().withRepositories(repos);
    const sonarRepo = new StubSonarRepository();
    const complianceRepo = new StubComplianceRepository();
    const badgeRepo = new StubBadgeRepository();
    const service = new GitHubDashboardService(repository, sonarRepo, complianceRepo, badgeRepo);

    // when
    const result = await service.listRepositories("token", "user");

    // then
    expect(result).toHaveLength(2);
    expect(result[0].name).toBe("repo-a");
    expect(result[1].name).toBe("repo-b");
  });

  it("should propagate error when repository fetch fails", async () => {
    // given
    const repository = new StubRepositoryRepository().withError(new Error("API failure"));
    const sonarRepo = new StubSonarRepository();
    const complianceRepo = new StubComplianceRepository();
    const badgeRepo = new StubBadgeRepository();
    const service = new GitHubDashboardService(repository, sonarRepo, complianceRepo, badgeRepo);

    // when / then
    await expect(service.listRepositories("token", "user")).rejects.toThrow("API failure");
  });

  it("should enrich repositories with sonar metrics when project keys match", async () => {
    // given
    const repos = [
      RepositoryBuilder.create().withName("my-app").build(),
      RepositoryBuilder.create().withName("other").build(),
    ];
    const repository = new StubRepositoryRepository().withRepositories(repos);
    const sonarMetrics = {
      bugs: 1,
      codeSmells: 2,
      securityHotspots: 0,
      vulnerabilities: 0,
      coverage: 80,
      duplications: 3,
      technicalDebt: "1h",
      qualityGateStatus: "OK" as const,
    };
    const sonarRepo = new StubSonarRepository()
      .withProjectKeys(["org_my-app"])
      .withProjectMetrics("org_my-app", sonarMetrics);
    const complianceRepo = new StubComplianceRepository();
    const badgeRepo = new StubBadgeRepository();
    const service = new GitHubDashboardService(repository, sonarRepo, complianceRepo, badgeRepo);

    // when
    const result = await service.listRepositories("token", "user");

    // then
    expect(result[0].sonarMetrics).toEqual(sonarMetrics);
    expect(result[1].sonarMetrics).toBeNull();
  });

  it("should return repos unchanged when no project keys match any repo", async () => {
    // given
    const repos = [RepositoryBuilder.create().withName("my-app").build()];
    const repository = new StubRepositoryRepository().withRepositories(repos);
    const sonarRepo = new StubSonarRepository()
      .withProjectKeys(["completely-unrelated-project"]);
    const complianceRepo = new StubComplianceRepository();
    const badgeRepo = new StubBadgeRepository();
    const service = new GitHubDashboardService(repository, sonarRepo, complianceRepo, badgeRepo);

    // when
    const result = await service.listRepositories("token", "user");

    // then
    expect(result[0].sonarMetrics).toBeNull();
  });

  it("should enrich repositories with compliance status", async () => {
    // given
    const repos = [
      RepositoryBuilder.create().withName("repo-a").build(),
      RepositoryBuilder.create().withName("repo-b").build(),
    ];
    const repository = new StubRepositoryRepository().withRepositories(repos);
    const sonarRepo = new StubSonarRepository();
    const compliance: ComplianceStatus = {
      pipelineExists: true,
      buildPolicyOnPRs: true,
      buildPolicyExpiration: true,
      branchProtection: true,
      color: "green",
    };
    const complianceRepo = new StubComplianceRepository()
      .withComplianceStatus("repo-a", compliance);
    const badgeRepo = new StubBadgeRepository();
    const service = new GitHubDashboardService(repository, sonarRepo, complianceRepo, badgeRepo);

    // when
    const result = await service.listRepositories("token", "user");

    // then
    expect(result[0].complianceStatus).toEqual(compliance);
    expect(result[1].complianceStatus).toBeNull();
  });

  it("should enrich repositories with badge status", async () => {
    // given
    const repos = [
      RepositoryBuilder.create().withName("repo-a").build(),
      RepositoryBuilder.create().withName("repo-b").build(),
    ];
    const repository = new StubRepositoryRepository().withRepositories(repos);
    const sonarRepo = new StubSonarRepository();
    const complianceRepo = new StubComplianceRepository();
    const badgeStatus: BadgeStatus = {
      checks: [
        { label: "Latest Release", present: true },
        { label: "License", present: true },
        { label: "Build Status", present: true },
        { label: "SonarCloud Coverage", present: true },
        { label: "SonarCloud Quality Gate", present: true },
        { label: "OpenSSF Best Practices", present: true },
      ],
      color: "green",
    };
    const badgeRepo = new StubBadgeRepository()
      .withBadgeStatus("repo-a", badgeStatus);
    const service = new GitHubDashboardService(repository, sonarRepo, complianceRepo, badgeRepo);

    // when
    const result = await service.listRepositories("token", "user");

    // then
    expect(result[0].badgeStatus).toEqual(badgeStatus);
    expect(result[1].badgeStatus).toBeNull();
  });
});
