import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  SonarRepositoryImpl,
  NoOpSonarRepository,
  type SonarConfig,
} from "../../../src/infrastructure/repositories/sonar_repository_impl";
import { createStubSonarClient } from "../../doubles/stub_http_clients";

describe("SonarRepositoryImpl", () => {
  const cloudConfig: SonarConfig = {
    type: "cloud",
    token: "sonar-token-123",
    baseUrl: "https://sonarcloud.io/",
    organization: "my-org",
  };

  const qubeConfig: SonarConfig = {
    type: "qube",
    token: "sonar-token-456",
    baseUrl: "https://sonar.example.com",
  };

  let stub: ReturnType<typeof createStubSonarClient>;

  const createRepository = (config: SonarConfig = cloudConfig) =>
    new SonarRepositoryImpl(stub.client, config);

  beforeEach(() => {
    vi.restoreAllMocks();
    stub = createStubSonarClient();
  });

  describe("listProjectKeys", () => {
    it("should return project keys on success", async () => {
      // given
      const repo = createRepository();
      stub.get.mockResolvedValueOnce({
        components: [{ key: "proj-a" }, { key: "proj-b" }],
        paging: { total: 2 },
      });

      // when
      const result = await repo.listProjectKeys();

      // then
      expect(result).toEqual(["proj-a", "proj-b"]);
    });

    it("should return empty array on failure", async () => {
      // given
      const repo = createRepository();
      stub.get.mockRejectedValueOnce(new Error("Sonar API error: 401"));

      // when
      const result = await repo.listProjectKeys();

      // then
      expect(result).toEqual([]);
    });

    it("should include organization param for cloud type", async () => {
      // given
      const repo = createRepository();
      stub.get.mockResolvedValueOnce({ components: [], paging: { total: 0 } });

      // when
      await repo.listProjectKeys();

      // then
      const [, , path] = stub.get.mock.calls[0];
      expect(path).toContain("organization=my-org");
    });

    it("should omit organization param for qube type", async () => {
      // given
      const repo = createRepository(qubeConfig);
      stub.get.mockResolvedValueOnce({ components: [], paging: { total: 0 } });

      // when
      await repo.listProjectKeys();

      // then
      const [, , path] = stub.get.mock.calls[0];
      expect(path).not.toContain("organization=");
    });

    it("should pass the configured token and base URL to the client", async () => {
      // given
      const repo = createRepository(qubeConfig);
      stub.get.mockResolvedValueOnce({ components: [], paging: { total: 0 } });

      // when
      await repo.listProjectKeys();

      // then
      const [token, baseUrl] = stub.get.mock.calls[0];
      expect(token).toBe("sonar-token-456");
      expect(baseUrl).toBe("https://sonar.example.com");
    });
  });

  describe("getProjectMetrics", () => {
    it("should return parsed metrics with quality gate OK", async () => {
      // given
      const repo = createRepository();
      stub.get
        .mockResolvedValueOnce({
          component: {
            measures: [
              { metric: "bugs", value: "5" },
              { metric: "code_smells", value: "10" },
              { metric: "security_hotspots", value: "2" },
              { metric: "vulnerabilities", value: "1" },
              { metric: "coverage", value: "82.5" },
              { metric: "duplicated_lines_density", value: "3.2" },
              { metric: "sqale_index", value: "530" },
            ],
          },
        })
        .mockResolvedValueOnce({ projectStatus: { status: "OK" } });

      // when
      const result = await repo.getProjectMetrics("my-project");

      // then
      expect(result).not.toBeNull();
      expect(result!.bugs).toBe(5);
      expect(result!.codeSmells).toBe(10);
      expect(result!.securityHotspots).toBe(2);
      expect(result!.vulnerabilities).toBe(1);
      expect(result!.coverage).toBe(82.5);
      expect(result!.duplications).toBe(3.2);
      expect(result!.qualityGateStatus).toBe("OK");
      expect(result!.technicalDebt).toBe("1d 50min");
    });

    it("should return parsed metrics with quality gate ERROR", async () => {
      // given
      const repo = createRepository();
      stub.get
        .mockResolvedValueOnce({
          component: {
            measures: [
              { metric: "bugs", value: "0" },
              { metric: "sqale_index", value: "0" },
            ],
          },
        })
        .mockResolvedValueOnce({ projectStatus: { status: "ERROR" } });

      // when
      const result = await repo.getProjectMetrics("my-project");

      // then
      expect(result).not.toBeNull();
      expect(result!.qualityGateStatus).toBe("ERROR");
      expect(result!.technicalDebt).toBe("0min");
    });

    it("should return null on failure", async () => {
      // given
      const repo = createRepository();
      stub.get.mockRejectedValue(new Error("Sonar API error: 404"));

      // when
      const result = await repo.getProjectMetrics("bad-project");

      // then
      expect(result).toBeNull();
    });

    it("should handle quality gate fetch failure gracefully", async () => {
      // given
      const repo = createRepository();
      stub.get
        .mockResolvedValueOnce({ component: { measures: [{ metric: "bugs", value: "1" }] } })
        .mockRejectedValueOnce(new Error("Sonar API error: 500"));

      // when
      const result = await repo.getProjectMetrics("my-project");

      // then
      expect(result).not.toBeNull();
      expect(result!.qualityGateStatus).toBe("NONE");
    });

    it("should format technical debt with days hours and minutes", async () => {
      // given
      const repo = createRepository();
      stub.get
        .mockResolvedValueOnce({ component: { measures: [{ metric: "sqale_index", value: "1530" }] } })
        .mockResolvedValueOnce({ projectStatus: { status: "OK" } });

      // when
      const result = await repo.getProjectMetrics("my-project");

      // then
      // 1530 min = 3d (3*480=1440) + 1h (60) + 30min
      expect(result!.technicalDebt).toBe("3d 1h 30min");
    });
  });

  describe("getIssuesByAuthor", () => {
    it("should aggregate issues by author and type", async () => {
      // given
      const repo = createRepository();
      stub.get.mockResolvedValueOnce({
        issues: [
          { author: "alice", type: "BUG" },
          { author: "alice", type: "BUG" },
          { author: "bob", type: "CODE_SMELL" },
          { author: "alice", type: "VULNERABILITY" },
          { author: "bob", type: "SECURITY_HOTSPOT" },
        ],
        paging: { total: 5, pageIndex: 1, pageSize: 500 },
      });

      // when
      const result = await repo.getIssuesByAuthor("my-project");

      // then
      expect(result.get("alice")).toEqual({
        bugs: 2,
        codeSmells: 0,
        vulnerabilities: 1,
        securityHotspots: 0,
      });
      expect(result.get("bob")).toEqual({
        bugs: 0,
        codeSmells: 1,
        vulnerabilities: 0,
        securityHotspots: 1,
      });
    });

    it("should paginate when results exceed page size", async () => {
      // given
      const repo = createRepository();
      stub.get
        .mockResolvedValueOnce({
          issues: [{ author: "alice", type: "BUG" }],
          paging: { total: 501, pageIndex: 1, pageSize: 500 },
        })
        .mockResolvedValueOnce({
          issues: [{ author: "bob", type: "CODE_SMELL" }],
          paging: { total: 501, pageIndex: 2, pageSize: 500 },
        });

      // when
      const result = await repo.getIssuesByAuthor("my-project");

      // then
      expect(stub.get).toHaveBeenCalledTimes(2);
      expect(result.size).toBe(2);
    });

    it("should handle unknown author as 'unknown'", async () => {
      // given
      const repo = createRepository();
      stub.get.mockResolvedValueOnce({
        issues: [{ author: "", type: "BUG" }],
        paging: { total: 1, pageIndex: 1, pageSize: 500 },
      });

      // when
      const result = await repo.getIssuesByAuthor("my-project");

      // then
      expect(result.has("unknown")).toBe(true);
      expect(result.get("unknown")!.bugs).toBe(1);
    });

    it("should return partial results on mid-pagination failure", async () => {
      // given
      const repo = createRepository();
      stub.get
        .mockResolvedValueOnce({
          issues: [{ author: "alice", type: "BUG" }],
          paging: { total: 1000, pageIndex: 1, pageSize: 500 },
        })
        .mockRejectedValueOnce(new Error("Sonar API error: 500"));

      // when
      const result = await repo.getIssuesByAuthor("my-project");

      // then
      expect(result.size).toBe(1);
      expect(result.get("alice")!.bugs).toBe(1);
    });
  });
});

describe("NoOpSonarRepository", () => {
  it("should return empty values for all methods", async () => {
    // given
    const repo = new NoOpSonarRepository();

    // when
    const keys = await repo.listProjectKeys();
    const metrics = await repo.getProjectMetrics("any");
    const issues = await repo.getIssuesByAuthor("any");

    // then
    expect(keys).toEqual([]);
    expect(metrics).toBeNull();
    expect(issues).toEqual(new Map());
  });
});
