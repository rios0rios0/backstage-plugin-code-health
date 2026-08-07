import type { SonarMetrics } from "../../src/domain/entities/sonar_metrics";
import { GitHubContributorService } from "../../src/service/github_contributor_service";
import { ContributorBuilder } from "../builders/contributor_builder";
import { StubContributorRepository } from "../doubles/stub_contributor_repository";
import { StubSonarRepository } from "../doubles/stub_sonar_repository";
import { StubWakaTimeRepository } from "../doubles/stub_wakatime_repository";

const metrics = (overrides: Partial<SonarMetrics>): SonarMetrics => ({
  bugs: 0,
  codeSmells: 0,
  securityHotspots: 0,
  vulnerabilities: 0,
  coverage: 0,
  duplications: 0,
  technicalDebt: "0min",
  qualityGateStatus: "NONE",
  ...overrides,
});

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

  it("should sum a contributor's issues across every Sonar project", async () => {
    // given
    const contributors = [
      ContributorBuilder.create().withUsername("alice").withLinesOfCode(1000).build(),
    ];
    const contributorRepo = new StubContributorRepository().withContributors(contributors);
    const sonarRepo = new StubSonarRepository()
      .withProjectKeys(["proj-1", "proj-2"])
      .withProjectMetrics("proj-1", metrics({ technicalDebt: "45min" }))
      .withProjectMetrics("proj-2", metrics({ technicalDebt: "45min" }))
      .withAuthorIssues(
        "proj-1",
        new Map([["alice", { bugs: 2, codeSmells: 4, vulnerabilities: 1, securityHotspots: 3 }]]),
      )
      .withAuthorIssues(
        "proj-2",
        new Map([["alice", { bugs: 5, codeSmells: 6, vulnerabilities: 7, securityHotspots: 8 }]]),
      );
    const service = createService(contributorRepo, sonarRepo);

    // when
    const result = await service.listContributors("token", "user", null, null);

    // then
    expect(result[0].sonarMetrics).toMatchObject({
      bugs: 7,
      codeSmells: 10,
      vulnerabilities: 8,
      securityHotspots: 11,
    });
  });

  it("should report the summed debt in hours and minutes when it is under a day", async () => {
    // given
    const contributors = [
      ContributorBuilder.create().withUsername("alice").withLinesOfCode(1000).build(),
    ];
    const contributorRepo = new StubContributorRepository().withContributors(contributors);
    const sonarRepo = new StubSonarRepository()
      .withProjectKeys(["proj-1"])
      .withProjectMetrics("proj-1", metrics({ technicalDebt: "2h30min" }))
      .withAuthorIssues(
        "proj-1",
        new Map([["alice", { bugs: 1, codeSmells: 1, vulnerabilities: 1, securityHotspots: 1 }]]),
      );
    const service = createService(contributorRepo, sonarRepo);

    // when
    const result = await service.listContributors("token", "user", null, null);

    // then
    expect(result[0].sonarMetrics?.technicalDebt).toBe("2h 30min");
  });

  it("should zero out the Sonar counts of a contributor when no author key matches", async () => {
    // given
    const contributors = [
      ContributorBuilder.create().withUsername("zoe").withLinesOfCode(400).build(),
    ];
    const contributorRepo = new StubContributorRepository().withContributors(contributors);
    const sonarRepo = new StubSonarRepository()
      .withProjectKeys(["proj-1"])
      .withProjectMetrics("proj-1", metrics({ coverage: 72.34, duplications: 5.67 }))
      .withAuthorIssues(
        "proj-1",
        new Map([["alice", { bugs: 9, codeSmells: 9, vulnerabilities: 9, securityHotspots: 9 }]]),
      );
    const service = createService(contributorRepo, sonarRepo);

    // when
    const result = await service.listContributors("token", "user", null, null);

    // then
    expect(result[0].sonarMetrics).toMatchObject({
      bugs: 0,
      codeSmells: 0,
      vulnerabilities: 0,
      securityHotspots: 0,
      coverage: 72.3,
      duplications: 5.7,
    });
  });

  it("should attach WakaTime metrics alongside Sonar metrics", async () => {
    // given
    const contributors = [
      ContributorBuilder.create().withUsername("alice").withLinesOfCode(1000).build(),
    ];
    const contributorRepo = new StubContributorRepository().withContributors(contributors);
    const sonarRepo = new StubSonarRepository()
      .withProjectKeys(["proj-1"])
      .withProjectMetrics("proj-1", metrics({}))
      .withAuthorIssues(
        "proj-1",
        new Map([["alice", { bugs: 1, codeSmells: 2, vulnerabilities: 3, securityHotspots: 4 }]]),
      );
    const wakaTimeRepo = new StubWakaTimeRepository().withSummary("alice", {
      totalSeconds: 7200,
      dailyAverageSeconds: 3600,
    });
    const service = createService(contributorRepo, sonarRepo, wakaTimeRepo);

    // when
    const result = await service.listContributors("token", "user", null, null);

    // then
    expect(result[0].sonarMetrics?.bugs).toBe(1);
    expect(result[0].wakaTimeMetrics?.totalSeconds).toBe(7200);
  });

  it("should leave WakaTime metrics unset for a contributor with no tracked time", async () => {
    // given
    const contributors = [
      ContributorBuilder.create().withUsername("zoe").withLinesOfCode(400).build(),
    ];
    const contributorRepo = new StubContributorRepository().withContributors(contributors);
    const wakaTimeRepo = new StubWakaTimeRepository().withSummary("alice", {
      totalSeconds: 7200,
      dailyAverageSeconds: 3600,
    });
    const service = createService(contributorRepo, new StubSonarRepository(), wakaTimeRepo);

    // when
    const result = await service.listContributors("token", "user", null, null);

    // then
    expect(result[0].wakaTimeMetrics).toBeNull();
  });

  it("should charge no debt to a contributor when the org has no lines of code", async () => {
    // given
    const contributors = [
      ContributorBuilder.create().withUsername("alice").withLinesOfCode(0).build(),
    ];
    const contributorRepo = new StubContributorRepository().withContributors(contributors);
    const sonarRepo = new StubSonarRepository()
      .withProjectKeys(["proj-1"])
      .withProjectMetrics("proj-1", metrics({ technicalDebt: "1d 2h 30min" }))
      .withAuthorIssues(
        "proj-1",
        new Map([["alice", { bugs: 1, codeSmells: 1, vulnerabilities: 1, securityHotspots: 1 }]]),
      );
    const service = createService(contributorRepo, sonarRepo);

    // when
    const result = await service.listContributors("token", "user", null, null);

    // then
    expect(result[0].sonarMetrics?.technicalDebt).toBe("0min");
  });
});
