import {
  detectRepositoryFiles,
  SCANNED_DIRECTORIES,
} from "../../../../src/infrastructure/services/collectors/repository_files";

describe("detectRepositoryFiles", () => {
  it("should find a README at the root", () => {
    // given / when
    const facts = detectRepositoryFiles(["README.md", "src/main.go"]);

    // then
    expect(facts.hasReadme).toBe(true);
  });

  it("should accept a README with any extension", () => {
    // given / when
    const facts = detectRepositoryFiles(["readme.rst"]);

    // then
    expect(facts.hasReadme).toBe(true);
  });

  it("should not count a README buried in a subdirectory", () => {
    // given / when
    const facts = detectRepositoryFiles(["docs/README.md"]);

    // then
    // The badge and documentation checks both mean the repository's own front
    // page, not any file that happens to be named this.
    expect(facts.hasReadme).toBe(false);
  });

  it("should treat a file under docs as documentation", () => {
    // given / when
    const facts = detectRepositoryFiles(["docs/index.md"]);

    // then
    expect(facts.hasDocsSource).toBe(true);
  });

  it("should treat an mkdocs config as documentation", () => {
    // given / when
    const facts = detectRepositoryFiles(["mkdocs.yml"]);

    // then
    // TechDocs' own generator reads this file, so a repository carrying one is
    // set up to publish whether or not the annotation exists yet.
    expect(facts.hasDocsSource).toBe(true);
  });

  it("should not treat a README alone as documentation", () => {
    // given / when
    const facts = detectRepositoryFiles(["README.md"]);

    // then
    // Nearly every repository has one. Counting it would grade the whole fleet
    // documented and the metric would measure nothing.
    expect(facts.hasDocsSource).toBe(false);
  });

  it("should find an OpenAPI definition at the root", () => {
    // given / when
    const facts = detectRepositoryFiles(["openapi.yaml", "README.md"]);

    // then
    expect(facts.apiDefinitionPath).toBe("openapi.yaml");
  });

  it("should find a definition inside a scanned directory", () => {
    // given / when
    const facts = detectRepositoryFiles(["api/swagger.json"]);

    // then
    expect(facts.apiDefinitionPath).toBe("api/swagger.json");
  });

  it("should prefer the most unambiguous definition when several are present", () => {
    // given
    // A stray `.proto` might be a message definition shared between services;
    // an `openapi.yaml` says exactly what it is.
    const paths = ["internal/events.proto", "docs/openapi.yml", "api/asyncapi.yaml"];

    // when
    const facts = detectRepositoryFiles(paths);

    // then
    expect(facts.apiDefinitionPath).toBe("docs/openapi.yml");
  });

  it("should report the same path whatever order the provider listed the files in", () => {
    // given
    const paths = ["b/service.proto", "a/events.proto"];

    // when
    const forward = detectRepositoryFiles(paths);
    const reversed = detectRepositoryFiles([...paths].reverse());

    // then
    // Two snapshots of an unchanged repository must not disagree about which
    // file they found.
    expect(forward.apiDefinitionPath).toBe(reversed.apiDefinitionPath);
  });

  it("should report no definition when nothing matches", () => {
    // given / when
    const facts = detectRepositoryFiles(["src/main.go", "go.mod"]);

    // then
    expect(facts.apiDefinitionPath).toBeNull();
  });

  it("should tolerate leading slashes and empty entries", () => {
    // given
    // Azure DevOps roots every path at `/`, and an empty repository lists
    // nothing at all.
    const facts = detectRepositoryFiles(["/README.md", "", "/docs/index.md"]);

    // then
    expect(facts).toEqual({
      hasReadme: true,
      hasDocsSource: true,
      apiDefinitionPath: null,
    });
  });

  it("should report nothing found for an empty repository", () => {
    // given / when
    const facts = detectRepositoryFiles([]);

    // then
    expect(facts).toEqual({
      hasReadme: false,
      hasDocsSource: false,
      apiDefinitionPath: null,
    });
  });
});

describe("SCANNED_DIRECTORIES", () => {
  it("should stay shallow", () => {
    // given / when / then
    // A recursive listing is unbounded on a large repository and costs a
    // different amount on each platform, which would make the metric
    // incomparable between them.
    expect(SCANNED_DIRECTORIES).toEqual(["docs", "api"]);
  });
});
