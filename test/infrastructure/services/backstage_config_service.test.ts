import { describe, it, expect } from "vitest";
import { EMPTY_GITFORGE_CONFIG } from "../../../src/domain/entities/gitforge_config";
import {
  readEndpointConfig,
  readGitforgeConfig,
} from "../../../src/infrastructure/services/backstage_config_service";
import { asConfigApi, StubConfigApi } from "../../doubles/stub_backstage_apis";

const configApi = (values: Record<string, string | number>) =>
  asConfigApi(new StubConfigApi(values));

describe("readGitforgeConfig", () => {
  it("should return the empty config when the plugin is not configured", () => {
    // given / when
    const result = readGitforgeConfig(configApi({}));

    // then
    expect(result).toEqual(EMPTY_GITFORGE_CONFIG);
  });

  it("should read platform, organization and refresh interval", () => {
    // given / when
    const result = readGitforgeConfig(
      configApi({
        "gitforgeDashboard.platform": "azure-devops",
        "gitforgeDashboard.organization": "  acme  ",
        "gitforgeDashboard.refreshIntervalMs": 60000,
      }),
    );

    // then
    expect(result.platform).toBe("azure-devops");
    expect(result.organization).toBe("acme");
    expect(result.refreshIntervalMs).toBe(60000);
  });

  it("should ignore an unsupported platform", () => {
    // given / when
    const result = readGitforgeConfig(configApi({ "gitforgeDashboard.platform": "bitbucket" }));

    // then
    expect(result.platform).toBeNull();
  });

  it("should default the SonarCloud base URL when the type is cloud", () => {
    // given / when
    const result = readGitforgeConfig(configApi({ "gitforgeDashboard.sonar.type": "cloud" }));

    // then
    expect(result.sonarType).toBe("cloud");
    expect(result.sonarBaseUrl).toBe("https://sonarcloud.io");
  });

  it("should keep the Sonar base URL unset for a SonarQube instance without a URL", () => {
    // given / when
    const result = readGitforgeConfig(configApi({ "gitforgeDashboard.sonar.type": "qube" }));

    // then
    expect(result.sonarType).toBe("qube");
    expect(result.sonarBaseUrl).toBeNull();
  });

  it("should read the configured Sonar base URL and organization", () => {
    // given / when
    const result = readGitforgeConfig(
      configApi({
        "gitforgeDashboard.sonar.type": "qube",
        "gitforgeDashboard.sonar.baseUrl": "https://sonar.internal",
        "gitforgeDashboard.sonar.organization": "sonar-org",
      }),
    );

    // then
    expect(result.sonarBaseUrl).toBe("https://sonar.internal");
    expect(result.sonarOrganization).toBe("sonar-org");
  });

  it("should ignore an unsupported Sonar type", () => {
    // given / when
    const result = readGitforgeConfig(configApi({ "gitforgeDashboard.sonar.type": "enterprise" }));

    // then
    expect(result.sonarType).toBeNull();
  });

  it("should mark targets with a proxy path as proxied", () => {
    // given / when
    const result = readGitforgeConfig(
      configApi({
        "gitforgeDashboard.github.proxyPath": "/gitforge-github",
        "gitforgeDashboard.wakaTime.proxyPath": "/gitforge-wakatime",
      }),
    );

    // then
    expect(result.proxied).toEqual({
      github: true,
      "azure-devops": false,
      sonar: false,
      wakatime: true,
    });
  });
});

describe("readEndpointConfig", () => {
  it("should return empty maps when nothing is configured", () => {
    // given / when
    const result = readEndpointConfig(configApi({}));

    // then
    expect(result).toEqual({ baseUrls: {}, proxyPaths: {} });
  });

  it("should map each target to its base URL and proxy path", () => {
    // given / when
    const result = readEndpointConfig(
      configApi({
        "gitforgeDashboard.github.baseUrl": "https://ghe.internal/api/graphql",
        "gitforgeDashboard.azureDevOps.proxyPath": "/gitforge-ado",
        "gitforgeDashboard.sonar.baseUrl": "https://sonar.internal",
        "gitforgeDashboard.wakaTime.proxyPath": "/gitforge-wakatime",
      }),
    );

    // then
    expect(result.baseUrls).toEqual({
      github: "https://ghe.internal/api/graphql",
      sonar: "https://sonar.internal",
    });
    expect(result.proxyPaths).toEqual({
      "azure-devops": "/gitforge-ado",
      wakatime: "/gitforge-wakatime",
    });
  });
});
