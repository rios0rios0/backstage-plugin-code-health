import {
  codeHealthAuthApiRef,
  codeHealthConfigApiRef,
  codeHealthContributorsApiRef,
  codeHealthRepositoriesApiRef,
} from "../../src/main/api_refs";

describe("api_refs", () => {
  it("should namespace every ref under the plugin id", () => {
    // given
    const refs = [
      codeHealthAuthApiRef,
      codeHealthConfigApiRef,
      codeHealthRepositoriesApiRef,
      codeHealthContributorsApiRef,
    ];

    // when
    const ids = refs.map((ref) => ref.id);

    // then
    expect(ids.every((id) => id.startsWith("plugin.code-health."))).toBe(true);
  });

  it("should give each ref a distinct id", () => {
    // given
    const ids = [
      codeHealthAuthApiRef.id,
      codeHealthConfigApiRef.id,
      codeHealthRepositoriesApiRef.id,
      codeHealthContributorsApiRef.id,
    ];

    // when
    const unique = new Set(ids);

    // then
    expect(unique.size).toBe(ids.length);
  });

  it("should name the refs after the capability they carry", () => {
    // given / when / then
    expect(codeHealthAuthApiRef.id).toBe("plugin.code-health.auth");
    expect(codeHealthConfigApiRef.id).toBe("plugin.code-health.config");
    expect(codeHealthRepositoriesApiRef.id).toBe("plugin.code-health.repositories");
    expect(codeHealthContributorsApiRef.id).toBe("plugin.code-health.contributors");
  });
});
