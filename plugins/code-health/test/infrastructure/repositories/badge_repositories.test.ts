import { AdoBadgeRepository } from "../../../src/infrastructure/repositories/ado_badge_repository";
import { GitHubBadgeRepository } from "../../../src/infrastructure/repositories/github_badge_repository";
import { createStubGraphQLClient } from "../../doubles/stub_http_clients";

const README_WITH_ALL_BADGES = `
![Latest Release](https://img.shields.io/github/release/acme/repo.svg)
![License](https://img.shields.io/github/license/acme/repo.svg)
![Build](https://img.shields.io/github/actions/workflow/status/acme/repo/default.yaml)
![Coverage](https://img.shields.io/sonar/coverage/acme_repo)
![Quality Gate](https://img.shields.io/sonar/quality_gate/acme_repo)
![OpenSSF](https://img.shields.io/cii/level/1234)
`;

describe("GitHubBadgeRepository", () => {
  let stub: ReturnType<typeof createStubGraphQLClient>;

  beforeEach(() => {
    stub = createStubGraphQLClient();
  });

  it("should report every badge as present when the README has them all", async () => {
    // given
    const repository = new GitHubBadgeRepository(stub.client);
    stub.request.mockResolvedValueOnce({
      repository: { object: { text: README_WITH_ALL_BADGES } },
    });

    // when
    const result = await repository.getBadgeStatus("token", "acme", "repo");

    // then
    expect(result?.color).toBe("green");
    expect(result?.checks.every((check) => check.present)).toBe(true);
  });

  it("should report missing badges when the README is incomplete", async () => {
    // given
    const repository = new GitHubBadgeRepository(stub.client);
    stub.request.mockResolvedValueOnce({
      repository: { object: { text: "![License](https://img.shields.io/github/license/a/b.svg)" } },
    });

    // when
    const result = await repository.getBadgeStatus("token", "acme", "repo");

    // then
    expect(result?.color).toBe("yellow");
    expect(result?.checks.find((check) => check.label === "License")?.present).toBe(true);
    expect(result?.checks.find((check) => check.label === "Build Status")?.present).toBe(false);
  });

  it("should treat a missing README as no badges at all", async () => {
    // given
    const repository = new GitHubBadgeRepository(stub.client);
    stub.request.mockResolvedValueOnce({ repository: { object: null } });

    // when
    const result = await repository.getBadgeStatus("token", "acme", "repo");

    // then
    expect(result?.color).toBe("yellow");
    expect(result?.checks.some((check) => check.present)).toBe(false);
  });

  it("should query the README of the requested repository", async () => {
    // given
    const repository = new GitHubBadgeRepository(stub.client);
    stub.request.mockResolvedValueOnce({ repository: { object: null } });

    // when
    await repository.getBadgeStatus("token", "acme", "repo");

    // then
    const [token, , variables] = stub.request.mock.calls[0];
    expect(token).toBe("token");
    expect(variables).toEqual({ owner: "acme", name: "repo" });
  });

  it("should return null when the query fails", async () => {
    // given
    const repository = new GitHubBadgeRepository(stub.client);
    stub.request.mockRejectedValueOnce(new Error("GitHub API error: 404 Not Found"));

    // when
    const result = await repository.getBadgeStatus("token", "acme", "repo");

    // then
    expect(result).toBeNull();
  });
});

describe("AdoBadgeRepository", () => {
  it("should return null because Azure DevOps has no README badge convention", async () => {
    // given
    const repository = new AdoBadgeRepository();

    // when
    const result = await repository.getBadgeStatus("token", "acme/project", "repo");

    // then
    expect(result).toBeNull();
  });
});
