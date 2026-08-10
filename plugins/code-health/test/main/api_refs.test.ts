import {
  codeHealthConfigApiRef,
  codeHealthContributorsApiRef,
  codeHealthCoverageApiRef,
  codeHealthRepositoriesApiRef,
} from "../../src/main/api_refs";

const refs = [
  codeHealthConfigApiRef,
  codeHealthRepositoriesApiRef,
  codeHealthContributorsApiRef,
  codeHealthCoverageApiRef,
];

describe("api_refs", () => {
  it("should namespace every ref under the plugin id", () => {
    // given / when
    const ids = refs.map((ref) => ref.id);

    // then
    expect(ids.every((id) => id.startsWith("plugin.code-health."))).toBe(true);
  });

  it("should give each ref a distinct id", () => {
    // given
    const ids = refs.map((ref) => ref.id);

    // when
    const unique = new Set(ids);

    // then
    expect(unique.size).toBe(ids.length);
  });

  it("should name the refs after the capability they carry", () => {
    // given / when / then
    expect(codeHealthConfigApiRef.id).toBe("plugin.code-health.config");
    expect(codeHealthRepositoriesApiRef.id).toBe("plugin.code-health.repositories");
    expect(codeHealthContributorsApiRef.id).toBe("plugin.code-health.contributors");
    expect(codeHealthCoverageApiRef.id).toBe("plugin.code-health.coverage");
  });
});
