import { ConfigReader } from "@backstage/config";
import { ScmIntegrations } from "@backstage/integration";
import {
  AnnotationRepositoryResolver,
  repositoryIdFor,
} from "../../../src/infrastructure/services/annotation_repository_resolver";
import { EntityBuilder } from "../../builders/entity_builder";

const integrations = () =>
  ScmIntegrations.fromConfig(
    new ConfigReader({
      integrations: {
        github: [{ host: "github.com", token: "fixture-token-placeholder" }],
        azure: [
          {
            host: "dev.azure.com",
            credentials: [{ personalAccessToken: "fixture-token-placeholder" }],
          },
        ],
      },
    }),
  );

const resolver = () => new AnnotationRepositoryResolver(integrations());

describe("AnnotationRepositoryResolver", () => {
  it("should resolve a GitHub repository from the project slug annotation", () => {
    // given
    const entity = EntityBuilder.create()
      .withName("gateway")
      .withGithubSlug("rios0rios0/pipelines")
      .build();

    // when
    const result = resolver().resolve(entity);

    // then
    expect(result).toMatchObject({
      platform: "github",
      host: "github.com",
      owner: "rios0rios0",
      project: null,
      name: "pipelines",
      repoUrl: "https://github.com/rios0rios0/pipelines",
      entityRef: "component:default/gateway",
    });
  });

  it("should resolve an Azure DevOps repository from the project-repo and host-org annotations", () => {
    // given
    const entity = EntityBuilder.create()
      .withName("gateway")
      .withAzureRepo("platform/gateway", "dev.azure.com/example-org")
      .build();

    // when
    const result = resolver().resolve(entity);

    // then
    expect(result).toMatchObject({
      platform: "azure-devops",
      host: "dev.azure.com",
      owner: "example-org",
      project: "platform",
      name: "gateway",
      repoUrl: "https://dev.azure.com/example-org/platform/_git/gateway",
    });
  });

  it("should fall back to the source location when no slug annotation is present", () => {
    // given
    // Backstage's own discovery providers always set a source location, but
    // only set a slug annotation when the corresponding processor is installed.
    const entity = EntityBuilder.create()
      .withSourceLocation("https://github.com/rios0rios0/autobump/tree/main/")
      .build();

    // when
    const result = resolver().resolve(entity);

    // then
    expect(result).toMatchObject({
      platform: "github",
      owner: "rios0rios0",
      name: "autobump",
      repoUrl: "https://github.com/rios0rios0/autobump",
    });
  });

  it("should resolve an Azure DevOps source location by anchoring on the _git segment", () => {
    // given
    const entity = EntityBuilder.create()
      .withSourceLocation("https://dev.azure.com/example-org/platform/_git/gateway")
      .build();

    // when
    const result = resolver().resolve(entity);

    // then
    expect(result).toMatchObject({
      platform: "azure-devops",
      owner: "example-org",
      project: "platform",
      name: "gateway",
    });
  });

  it("should resolve an on-premises Azure DevOps source location with a tfs prefix", () => {
    // given
    // The on-premises URL carries an extra leading segment; anchoring on `_git`
    // rather than on a fixed offset is what makes both shapes work.
    const config = new ConfigReader({
      integrations: {
        azure: [
          {
            host: "azure.internal",
            credentials: [{ personalAccessToken: "fixture-token-placeholder" }],
          },
        ],
      },
    });
    const entity = EntityBuilder.create()
      .withSourceLocation("https://azure.internal/tfs/example-org/platform/_git/gateway")
      .build();

    // when
    const result = new AnnotationRepositoryResolver(ScmIntegrations.fromConfig(config)).resolve(
      entity,
    );

    // then
    expect(result).toMatchObject({
      platform: "azure-devops",
      host: "azure.internal",
      owner: "example-org",
      project: "platform",
      name: "gateway",
    });
  });

  it("should prefer the slug annotation over the source location", () => {
    // given
    const entity = EntityBuilder.create()
      .withGithubSlug("rios0rios0/pipelines")
      .withSourceLocation("https://github.com/someone-else/other/tree/main/")
      .build();

    // when
    const result = resolver().resolve(entity);

    // then
    expect(result?.name).toBe("pipelines");
  });

  it("should carry the Sonar project key when the entity is annotated with one", () => {
    // given
    const entity = EntityBuilder.create()
      .withGithubSlug("rios0rios0/pipelines")
      .withSonarProjectKey("rios0rios0_pipelines")
      .build();

    // when
    const result = resolver().resolve(entity);

    // then
    expect(result?.sonarProjectKey).toBe("rios0rios0_pipelines");
  });

  it("should leave the Sonar project key null when the entity has none", () => {
    // given
    const entity = EntityBuilder.create().withGithubSlug("rios0rios0/pipelines").build();

    // when
    const result = resolver().resolve(entity);

    // then
    expect(result?.sonarProjectKey).toBeNull();
  });

  it("should skip an entity with no repository annotations at all", () => {
    // given
    const entity = EntityBuilder.create().build();

    // when
    const result = resolver().resolve(entity);

    // then
    expect(result).toBeNull();
  });

  it("should skip a source location pointing at a host with no configured integration", () => {
    // given
    const entity = EntityBuilder.create()
      .withSourceLocation("https://bitbucket.org/team/repo/src/main/")
      .build();

    // when
    const result = resolver().resolve(entity);

    // then
    expect(result).toBeNull();
  });

  it("should skip a malformed GitHub slug", () => {
    // given
    const entity = EntityBuilder.create().withGithubSlug("just-an-owner").build();

    // when
    const result = resolver().resolve(entity);

    // then
    expect(result).toBeNull();
  });

  it("should skip a slug carrying more segments than owner and repository", () => {
    // given
    const entity = EntityBuilder.create().withGithubSlug("owner/repo/extra").build();

    // when
    const result = resolver().resolve(entity);

    // then
    expect(result).toBeNull();
  });

  it("should skip an Azure repository whose organisation cannot be determined", () => {
    // given
    // `project-repo` names a project and a repository but never an
    // organisation, so without `host-org` there is nothing to build a URL from.
    const entity = EntityBuilder.create().withAzureRepo("platform/gateway").build();

    // when
    const result = resolver().resolve(entity);

    // then
    expect(result).toBeNull();
  });

  it("should ignore a malformed host-org annotation and fall through", () => {
    // given
    const entity = EntityBuilder.create()
      .withAzureRepo("platform/gateway", "not-a-host-org")
      .build();

    // when
    const result = resolver().resolve(entity);

    // then
    expect(result).toBeNull();
  });

  it("should skip an entity whose source location is not a URL", () => {
    // given
    const entity = EntityBuilder.create()
      .withAnnotation("backstage.io/source-location", "file:/etc/catalog-info.yaml")
      .build();

    // when
    const result = resolver().resolve(entity);

    // then
    expect(result).toBeNull();
  });

  it("should treat an empty annotation as absent", () => {
    // given
    const entity = EntityBuilder.create().withAnnotation("github.com/project-slug", "").build();

    // when
    const result = resolver().resolve(entity);

    // then
    expect(result).toBeNull();
  });

  it("should skip an Azure source location with no _git segment", () => {
    // given
    const entity = EntityBuilder.create()
      .withSourceLocation("https://dev.azure.com/example-org/platform")
      .build();

    // when
    const result = resolver().resolve(entity);

    // then
    expect(result).toBeNull();
  });
});

describe("repositoryIdFor", () => {
  it("should be stable across calls for the same entity reference", () => {
    // given
    const entityRef = "component:default/gateway";

    // when
    const first = repositoryIdFor(entityRef);
    const second = repositoryIdFor(entityRef);

    // then
    // Rediscovery must produce the same id, or every catalog refresh would
    // orphan the history and restart the backfill from today.
    expect(first).toBe(second);
    expect(first).toHaveLength(32);
  });

  it("should differ between entities", () => {
    // given / when
    const first = repositoryIdFor("component:default/gateway");
    const second = repositoryIdFor("component:default/other");

    // then
    expect(first).not.toBe(second);
  });
});
