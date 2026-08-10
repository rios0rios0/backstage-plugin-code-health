import codeHealthFrontendPlugin, {
  codeHealthCoverageApi,
  codeHealthConfigApi,
  codeHealthContributorsApi,
  codeHealthPage,
  codeHealthRepositoriesApi,
} from "../src/alpha";

/**
 * The `/alpha` entry point is what apps on `@backstage/frontend-defaults` load,
 * so the set of extensions it declares — and where each attaches — is part of
 * the published contract. Extension definitions expose their kind, name and
 * attachment point only through `toString()`, so that is what is asserted.
 */
describe("alpha entry point", () => {
  it("should declare the plugin under the same id as the legacy entry point", () => {
    // given / when
    const id = codeHealthFrontendPlugin.id;

    // then
    expect(id).toBe("code-health");
  });

  it("should attach every API extension to the app's API surface", () => {
    // given
    const apiExtensions = [
      codeHealthConfigApi,
      codeHealthRepositoriesApi,
      codeHealthContributorsApi,
      codeHealthCoverageApi,
    ];

    // when
    const descriptions = apiExtensions.map(String);

    // then
    expect(descriptions).toEqual([
      "ExtensionDefinition{kind=api,name=config,attachTo=root@apis}",
      "ExtensionDefinition{kind=api,name=repositories,attachTo=root@apis}",
      "ExtensionDefinition{kind=api,name=contributors,attachTo=root@apis}",
      "ExtensionDefinition{kind=api,name=coverage,attachTo=root@apis}",
    ]);
  });

  it("should expose the dashboard as a page attached to the app routes", () => {
    // given / when
    const description = String(codeHealthPage);

    // then
    expect(description).toBe("ExtensionDefinition{kind=page,attachTo=app/routes@routes}");
  });

  it("should register every API extension plus the page on the plugin", () => {
    // given
    const ids = [
      "api:code-health/config",
      "api:code-health/repositories",
      "api:code-health/contributors",
      "api:code-health/coverage",
      "page:code-health",
    ] as const;

    // when
    const resolved = ids.map((id) => codeHealthFrontendPlugin.getExtension(id));

    // then
    expect(resolved.every(Boolean)).toBe(true);
  });
});
