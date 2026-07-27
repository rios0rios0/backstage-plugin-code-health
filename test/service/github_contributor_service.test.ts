import { GitHubContributorService } from "../../src/service/github_contributor_service";
import { ContributorBuilder } from "../builders/contributor_builder";
import { StubContributorRepository } from "../doubles/stub_contributor_repository";
import { StubSonarRepository } from "../doubles/stub_sonar_repository";
import { StubWakaTimeRepository } from "../doubles/stub_wakatime_repository";

const createService = (
  contributorRepo: StubContributorRepository,
  sonarRepo = new StubSonarRepository(),
  wakaTimeRepo = new StubWakaTimeRepository(),
) => new GitHubContributorService(contributorRepo, sonarRepo, wakaTimeRepo);

describe("GitHubContributorService", () => {
  it("should return contributors without Sonar metrics when no projects exist", async () => {
    // given
    const contributors = [
      ContributorBuilder.create().withUsername("alice").withLinesOfCode(500).build(),
    ];
    const contributorRepo = new StubContributorRepository().withContributors(contributors);
    const service = createService(contributorRepo);

    // when
    const result = await service.listContributors("token", "user", null, null);

    // then
    expect(result).toHaveLength(1);
    expect(result[0].username).toBe("alice");
    expect(result[0].sonarMetrics).toBeNull();
  });

  it("should assign per-author issues from Sonar issues API", async () => {
    // given
    const contributors = [
      ContributorBuilder.create().withUsername("alice").withLinesOfCode(750).build(),
      ContributorBuilder.create().withUsername("bob").withLinesOfCode(250).build(),
    ];
    const contributorRepo = new StubContributorRepository().withContributors(contributors);
    const authorIssues = new Map([
      ["alice", { bugs: 5, codeSmells: 10, vulnerabilities: 2, securityHotspots: 1 }],
      ["bob", { bugs: 3, codeSmells: 7, vulnerabilities: 0, securityHotspots: 0 }],
    ]);
    const sonarRepo = new StubSonarRepository()
      .withProjectKeys(["proj-1"])
      .withProjectMetrics("proj-1", {
        bugs: 8,
        codeSmells: 17,
        securityHotspots: 1,
        vulnerabilities: 2,
        coverage: 80,
        duplications: 10,
        technicalDebt: "1d 0h 0min",
        qualityGateStatus: "OK",
      })
      .withAuthorIssues("proj-1", authorIssues);
    const service = createService(contributorRepo, sonarRepo);

    // when
    const result = await service.listContributors("token", "user", null, null);

    // then
    expect(result).toHaveLength(2);
    expect(result[0].sonarMetrics?.bugs).toBe(5);
    expect(result[0].sonarMetrics?.codeSmells).toBe(10);
    expect(result[1].sonarMetrics?.bugs).toBe(3);
    expect(result[1].sonarMetrics?.codeSmells).toBe(7);
  });

  it("should return contributors without metrics when all project fetches return null", async () => {
    // given
    const contributors = [
      ContributorBuilder.create().withUsername("alice").withLinesOfCode(500).build(),
    ];
    const contributorRepo = new StubContributorRepository().withContributors(contributors);
    const sonarRepo = new StubSonarRepository()
      .withProjectKeys(["proj-1"])
      .withProjectMetrics("proj-1", null);
    const service = createService(contributorRepo, sonarRepo);

    // when
    const result = await service.listContributors("token", "user", null, null);

    // then
    expect(result).toHaveLength(1);
    expect(result[0].sonarMetrics).toBeNull();
  });

  it("should merge WakaTime summaries into contributors", async () => {
    // given
    const contributors = [
      ContributorBuilder.create().withUsername("alice").withLinesOfCode(500).build(),
    ];
    const contributorRepo = new StubContributorRepository().withContributors(contributors);
    const wakaTimeRepo = new StubWakaTimeRepository()
      .withSummary("alice", { totalSeconds: 36000, dailyAverageSeconds: 7200 });
    const service = createService(contributorRepo, new StubSonarRepository(), wakaTimeRepo);

    // when
    const result = await service.listContributors("token", "user", null, null);

    // then
    expect(result[0].wakaTimeMetrics?.totalSeconds).toBe(36000);
    expect(result[0].wakaTimeMetrics?.dailyAverageSeconds).toBe(7200);
  });

  it("should propagate error when contributor repository fetch fails", async () => {
    // given
    const contributorRepo = new StubContributorRepository().withError(new Error("API failure"));
    const service = createService(contributorRepo);

    // when / then
    await expect(service.listContributors("token", "user", null, null)).rejects.toThrow(
      "API failure",
    );
  });
});
