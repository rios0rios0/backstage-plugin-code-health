import {
  DEFAULT_FILTER,
  filterRepositories,
  sortRepositories,
} from "../../../src/domain/entities/dashboard_filter";
import { RepositoryBuilder } from "../../builders/repository_builder";

describe("filterRepositories", () => {
  it("should return all repositories when no filters are active", () => {
    // given
    const repos = [
      RepositoryBuilder.create().withName("alpha").build(),
      RepositoryBuilder.create().withName("beta").build(),
    ];

    // when
    const result = filterRepositories(repos, DEFAULT_FILTER);

    // then
    expect(result).toHaveLength(2);
  });

  it("should filter by search query matching repository name case-insensitively", () => {
    // given
    const repos = [
      RepositoryBuilder.create().withName("my-project").build(),
      RepositoryBuilder.create().withName("other-repo").build(),
    ];

    // when
    const result = filterRepositories(repos, { ...DEFAULT_FILTER, searchQuery: "PROJECT" });

    // then
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("my-project");
  });

  it("should return only repositories with SUCCESS CI status when ciFilter is passing", () => {
    // given
    const repos = [
      RepositoryBuilder.create().withName("passing").withCiStatus("SUCCESS").build(),
      RepositoryBuilder.create().withName("failing").withCiStatus("FAILURE").build(),
      RepositoryBuilder.create().withName("no-ci").build(),
    ];

    // when
    const result = filterRepositories(repos, { ...DEFAULT_FILTER, ciFilter: "passing" });

    // then
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("passing");
  });

  it("should return only failing repositories when ciFilter is failing", () => {
    // given
    const repos = [
      RepositoryBuilder.create().withName("passing").withCiStatus("SUCCESS").build(),
      RepositoryBuilder.create().withName("failing").withCiStatus("FAILURE").build(),
      RepositoryBuilder.create().withName("error").withCiStatus("ERROR").build(),
    ];

    // when
    const result = filterRepositories(repos, { ...DEFAULT_FILTER, ciFilter: "failing" });

    // then
    expect(result).toHaveLength(2);
    expect(result.map((r) => r.name)).toEqual(["failing", "error"]);
  });

  it("should return only repositories without CI when ciFilter is no-ci", () => {
    // given
    const repos = [
      RepositoryBuilder.create().withName("with-ci").withCiStatus("SUCCESS").build(),
      RepositoryBuilder.create().withName("no-ci").build(),
    ];

    // when
    const result = filterRepositories(repos, { ...DEFAULT_FILTER, ciFilter: "no-ci" });

    // then
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("no-ci");
  });

  it("should return only repositories with releases when releaseFilter is has-release", () => {
    // given
    const repos = [
      RepositoryBuilder.create().withName("released").withLatestRelease().build(),
      RepositoryBuilder.create().withName("unreleased").build(),
    ];

    // when
    const result = filterRepositories(repos, { ...DEFAULT_FILTER, releaseFilter: "has-release" });

    // then
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("released");
  });

  it("should return only repositories without releases when releaseFilter is no-release", () => {
    // given
    const repos = [
      RepositoryBuilder.create().withName("released").withLatestRelease().build(),
      RepositoryBuilder.create().withName("unreleased").build(),
    ];

    // when
    const result = filterRepositories(repos, { ...DEFAULT_FILTER, releaseFilter: "no-release" });

    // then
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("unreleased");
  });

  it("should exclude archived repositories when showArchived is false", () => {
    // given
    const repos = [
      RepositoryBuilder.create().withName("active").build(),
      RepositoryBuilder.create().withName("archived").asArchived().build(),
    ];

    // when
    const result = filterRepositories(repos, { ...DEFAULT_FILTER, showArchived: false });

    // then
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("active");
  });

  it("should include archived repositories when showArchived is true", () => {
    // given
    const repos = [
      RepositoryBuilder.create().withName("active").build(),
      RepositoryBuilder.create().withName("archived").asArchived().build(),
    ];

    // when
    const result = filterRepositories(repos, { ...DEFAULT_FILTER, showArchived: true });

    // then
    expect(result).toHaveLength(2);
  });

  it("should exclude forks when showForks is false", () => {
    // given
    const repos = [
      RepositoryBuilder.create().withName("original").build(),
      RepositoryBuilder.create().withName("forked").asFork().build(),
    ];

    // when
    const result = filterRepositories(repos, { ...DEFAULT_FILTER, showForks: false });

    // then
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("original");
  });

  it("should filter by language when languageFilter is set", () => {
    // given
    const repos = [
      RepositoryBuilder.create().withName("go-project").withLanguage("Go").build(),
      RepositoryBuilder.create().withName("ts-project").withLanguage("TypeScript").build(),
    ];

    // when
    const result = filterRepositories(repos, { ...DEFAULT_FILTER, languageFilter: "Go" });

    // then
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("go-project");
  });
});

describe("sortRepositories", () => {
  it("should sort by name ascending when sortField is name and sortDirection is asc", () => {
    // given
    const repos = [
      RepositoryBuilder.create().withName("charlie").build(),
      RepositoryBuilder.create().withName("alpha").build(),
      RepositoryBuilder.create().withName("bravo").build(),
    ];

    // when
    const result = sortRepositories(repos, "name", "asc");

    // then
    expect(result.map((r) => r.name)).toEqual(["alpha", "bravo", "charlie"]);
  });

  it("should sort by name descending when sortField is name and sortDirection is desc", () => {
    // given
    const repos = [
      RepositoryBuilder.create().withName("alpha").build(),
      RepositoryBuilder.create().withName("charlie").build(),
    ];

    // when
    const result = sortRepositories(repos, "name", "desc");

    // then
    expect(result.map((r) => r.name)).toEqual(["charlie", "alpha"]);
  });

  it("should sort by CI status with failures first when sortField is ciStatus", () => {
    // given
    const repos = [
      RepositoryBuilder.create().withName("success").withCiStatus("SUCCESS").build(),
      RepositoryBuilder.create().withName("failure").withCiStatus("FAILURE").build(),
      RepositoryBuilder.create().withName("pending").withCiStatus("PENDING").build(),
    ];

    // when
    const result = sortRepositories(repos, "ciStatus", "asc");

    // then
    expect(result.map((r) => r.name)).toEqual(["failure", "pending", "success"]);
  });

  it("should sort by updatedAt with most recent first when sortField is updatedAt", () => {
    // given
    const repos = [
      RepositoryBuilder.create().withName("old").withUpdatedAt("2025-01-01T00:00:00Z").build(),
      RepositoryBuilder.create().withName("new").withUpdatedAt("2026-03-01T00:00:00Z").build(),
    ];

    // when
    const result = sortRepositories(repos, "updatedAt", "asc");

    // then
    expect(result.map((r) => r.name)).toEqual(["new", "old"]);
  });
});
