import { ConfigReader } from "@backstage/config";
import type { JsonObject } from "@backstage/types";
import { ScmIntegrations } from "@backstage/integration";
import { IntegrationsCredentialsResolver } from "../../../src/infrastructure/services/integrations_credentials_resolver";
import { aTrackedRepository } from "../../builders/tracked_repository_builder";

const resolverFor = (data: JsonObject) =>
  new IntegrationsCredentialsResolver(ScmIntegrations.fromConfig(new ConfigReader(data)));

describe("IntegrationsCredentialsResolver", () => {
  it("should build a GitHub authorization header from the configured token", async () => {
    // given
    // The token comes from the host application's existing `integrations`
    // block, so an operator who already configured Backstage for GitHub
    // configures nothing further here.
    const resolver = resolverFor({
      integrations: { github: [{ host: "github.com", token: "fixture-token-placeholder" }] },
    });

    // when
    const headers = await resolver.resolve(aTrackedRepository());

    // then
    expect(headers.Authorization).toContain("fixture-token-placeholder");
  });

  it("should build an Azure DevOps authorization header from the configured credential", async () => {
    // given
    const resolver = resolverFor({
      integrations: {
        azure: [
          {
            host: "dev.azure.com",
            credentials: [{ personalAccessToken: "fixture-token-placeholder" }],
          },
        ],
      },
    });

    // when
    const headers = await resolver.resolve(
      aTrackedRepository({
        platform: "azure-devops",
        host: "dev.azure.com",
        owner: "example-org",
        project: "platform",
        name: "gateway",
        repoUrl: "https://dev.azure.com/example-org/platform/_git/gateway",
      }),
    );

    // then
    // The provider encodes `Basic base64(:pat)` or `Bearer <token>` depending
    // on the credential type, so the header is used verbatim rather than
    // rebuilt from the raw token.
    expect(headers.Authorization).toMatch(/^Basic /);
  });

  it("should fail with an actionable message when no Azure DevOps integration matches", async () => {
    // given
    const resolver = resolverFor({
      integrations: { github: [{ host: "github.com", token: "fixture-token-placeholder" }] },
    });

    // when / then
    await expect(
      resolver.resolve(
        aTrackedRepository({
          platform: "azure-devops",
          host: "azure.internal",
          owner: "example-org",
          project: "platform",
          name: "gateway",
          repoUrl: "https://azure.internal/example-org/platform/_git/gateway",
        }),
      ),
    ).rejects.toThrow("add it under `integrations` in app-config");
  });

  it("should fail when no GitHub integration matches the host", async () => {
    // given
    const resolver = resolverFor({
      integrations: { github: [{ host: "github.com", token: "fixture-token-placeholder" }] },
    });

    // when / then
    await expect(
      resolver.resolve(
        aTrackedRepository({
          host: "github.internal",
          repoUrl: "https://github.internal/rios0rios0/pipelines",
        }),
      ),
    ).rejects.toThrow(/no GitHub integration|integrations/);
  });
});
