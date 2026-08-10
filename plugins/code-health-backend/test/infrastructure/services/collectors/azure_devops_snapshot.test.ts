import {
  evaluatePolicies,
  pickLatestTag,
} from "../../../../src/infrastructure/services/collectors/azure_devops_snapshot";

const BUILD_POLICY_TYPE = "0609b952-1397-4640-95ec-e00a01b2c241";

const aBuildPolicy = (overrides: Record<string, unknown> = {}) => ({
  isEnabled: true,
  isBlocking: true,
  type: { id: BUILD_POLICY_TYPE, displayName: "Build" },
  settings: { validDuration: 720, scope: [{ repositoryId: "repo-1", refName: "refs/heads/main" }] },
  ...overrides,
});

describe("evaluatePolicies", () => {
  it("should report a build policy that applies to the repository", () => {
    // given / when
    const result = evaluatePolicies([aBuildPolicy()], "repo-1");

    // then
    expect(result).toEqual({
      buildPolicyOnPRs: true,
      buildPolicyExpiration: true,
      branchProtection: true,
    });
  });

  it("should apply a project-wide policy to every repository in it", () => {
    // given
    // A scope entry with a null repository is how an organisation expresses a
    // rule that covers everything in the project.
    const policy = aBuildPolicy({
      settings: { validDuration: 720, scope: [{ repositoryId: null }] },
    });

    // when
    const result = evaluatePolicies([policy], "some-other-repo");

    // then
    expect(result.buildPolicyOnPRs).toBe(true);
  });

  it("should ignore a policy scoped to a different repository", () => {
    // given / when
    const result = evaluatePolicies([aBuildPolicy()], "repo-2");

    // then
    expect(result).toEqual({
      buildPolicyOnPRs: false,
      buildPolicyExpiration: false,
      branchProtection: false,
    });
  });

  it("should ignore a disabled policy", () => {
    // given / when
    const result = evaluatePolicies([aBuildPolicy({ isEnabled: false })], "repo-1");

    // then
    expect(result.buildPolicyOnPRs).toBe(false);
  });

  it("should report no expiry when the build result never expires", () => {
    // given
    // A validity duration of zero lets a stale green build keep satisfying the
    // policy indefinitely, which is exactly what this check is asking about.
    const policy = aBuildPolicy({
      settings: { validDuration: 0, scope: [{ repositoryId: "repo-1" }] },
    });

    // when
    const result = evaluatePolicies([policy], "repo-1");

    // then
    expect(result.buildPolicyOnPRs).toBe(true);
    expect(result.buildPolicyExpiration).toBe(false);
  });

  it("should treat any blocking policy as branch protection", () => {
    // given
    const reviewerPolicy = {
      isEnabled: true,
      isBlocking: true,
      type: { id: "some-other-guid" },
      settings: { scope: [{ repositoryId: "repo-1" }] },
    };

    // when
    const result = evaluatePolicies([reviewerPolicy], "repo-1");

    // then
    expect(result.branchProtection).toBe(true);
    expect(result.buildPolicyOnPRs).toBe(false);
  });

  it("should not treat an advisory policy as branch protection", () => {
    // given
    const advisory = {
      isEnabled: true,
      isBlocking: false,
      type: { id: "some-other-guid" },
      settings: { scope: [{ repositoryId: "repo-1" }] },
    };

    // when
    const result = evaluatePolicies([advisory], "repo-1");

    // then
    expect(result.branchProtection).toBe(false);
  });

  it("should ignore a policy with no scope at all", () => {
    // given / when
    const result = evaluatePolicies([aBuildPolicy({ settings: { validDuration: 1 } })], "repo-1");

    // then
    expect(result.buildPolicyOnPRs).toBe(false);
  });
});

describe("pickLatestTag", () => {
  it("should pick the highest version rather than the first alphabetically", () => {
    // given
    // Azure DevOps returns refs alphabetically and with no dates, so taking the
    // first — which is what `$top=1` did — reliably returned the *oldest*
    // version-like tag.
    const refs = [
      { name: "refs/tags/v1.0.0", objectId: "a" },
      { name: "refs/tags/v1.10.0", objectId: "b" },
      { name: "refs/tags/v1.9.0", objectId: "c" },
    ];

    // when
    const result = pickLatestTag(refs);

    // then
    expect(result).toEqual({ name: "v1.10.0", commitSha: "b" });
  });

  it("should compare version components numerically", () => {
    // given
    const refs = [
      { name: "refs/tags/2.0.0", objectId: "a" },
      { name: "refs/tags/10.0.0", objectId: "b" },
    ];

    // when
    const result = pickLatestTag(refs);

    // then
    expect(result?.name).toBe("10.0.0");
  });

  it("should prefer the peeled object of an annotated tag", () => {
    // given
    // Without `peelTags` the object id is the tag object rather than the commit
    // it points at, so the dashboard would link to something that is not a
    // commit.
    const refs = [{ name: "refs/tags/v1.0.0", objectId: "tag-object", peeledObjectId: "commit" }];

    // when
    const result = pickLatestTag(refs);

    // then
    expect(result?.commitSha).toBe("commit");
  });

  it("should fall back to the greatest name when nothing looks like a version", () => {
    // given
    const refs = [
      { name: "refs/tags/alpha", objectId: "a" },
      { name: "refs/tags/zulu", objectId: "b" },
    ];

    // when
    const result = pickLatestTag(refs);

    // then
    expect(result?.name).toBe("zulu");
  });

  it("should ignore non-version names when versions are present", () => {
    // given
    const refs = [
      { name: "refs/tags/zulu", objectId: "a" },
      { name: "refs/tags/v0.1.0", objectId: "b" },
    ];

    // when
    const result = pickLatestTag(refs);

    // then
    expect(result?.name).toBe("v0.1.0");
  });

  it("should return nothing when there are no tags", () => {
    // given / when
    const result = pickLatestTag([]);

    // then
    expect(result).toBeNull();
  });

  it("should discard refs with no name", () => {
    // given / when
    const result = pickLatestTag([{ objectId: "a" }]);

    // then
    expect(result).toBeNull();
  });
});
