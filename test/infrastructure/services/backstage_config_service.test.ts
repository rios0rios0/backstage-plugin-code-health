import { EMPTY_CODE_HEALTH_CONFIG } from "../../../src/domain/entities/code_health_config";
import {
  readEndpointConfig,
  readCodeHealthConfig,
} from "../../../src/infrastructure/services/backstage_config_service";
import { asConfigApi, StubConfigApi } from "../../doubles/stub_backstage_apis";

const configApi = (values: Record<string, string | number>) =>
  asConfigApi(new StubConfigApi(values));

describe("readCodeHealthConfig", () => {
  it("should return the empty config when the plugin is not configured", () => {
    // given / when
    const result = readCodeHealthConfig(configApi({}));

    // then
    expect(result).toEqual(EMPTY_CODE_HEALTH_CONFIG);
  });

  it("should read platform, organization and refresh interval", () => {
    // given / when
    const result = readCodeHealthConfig(
      configApi({
        "codeHealth.platform": "azure-devops",
        "codeHealth.organization": "  acme  ",
        "codeHealth.refreshIntervalMs": 60000,
      }),
    );

    // then
    expect(result.platform).toBe("azure-devops");
    expect(result.organization).toBe("acme");
    expect(result.refreshIntervalMs).toBe(60000);
  });

  it("should ignore an unsupported platform", () => {
    // given / when
    const result = readCodeHealthConfig(configApi({ "codeHealth.platform": "bitbucket" }));

    // then
    expect(result.platform).toBeNull();
  });

  it("should default the SonarCloud base URL when the type is cloud", () => {
    // given / when
    const result = readCodeHealthConfig(configApi({ "codeHealth.sonar.type": "cloud" }));

    // then
    expect(result.sonarType).toBe("cloud");
    expect(result.sonarBaseUrl).toBe("https://sonarcloud.io");
  });

  it("should keep the Sonar base URL unset for a SonarQube instance without a URL", () => {
    // given / when
    const result = readCodeHealthConfig(configApi({ "codeHealth.sonar.type": "qube" }));

    // then
    expect(result.sonarType).toBe("qube");
    expect(result.sonarBaseUrl).toBeNull();
  });

  it("should read the configured Sonar base URL and organization", () => {
    // given / when
    const result = readCodeHealthConfig(
      configApi({
        "codeHealth.sonar.type": "qube",
        "codeHealth.sonar.baseUrl": "https://sonar.internal",
        "codeHealth.sonar.organization": "sonar-org",
      }),
    );

    // then
    expect(result.sonarBaseUrl).toBe("https://sonar.internal");
    expect(result.sonarOrganization).toBe("sonar-org");
  });

  it("should ignore an unsupported Sonar type", () => {
    // given / when
    const result = readCodeHealthConfig(configApi({ "codeHealth.sonar.type": "enterprise" }));

    // then
    expect(result.sonarType).toBeNull();
  });

  it("should mark targets with a proxy path as proxied", () => {
    // given / when
    const result = readCodeHealthConfig(
      configApi({
        "codeHealth.github.proxyPath": "/code-health-github",
        "codeHealth.wakaTime.proxyPath": "/code-health-wakatime",
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
        "codeHealth.github.baseUrl": "https://ghe.internal/api/graphql",
        "codeHealth.azureDevOps.proxyPath": "/code-health-ado",
        "codeHealth.sonar.baseUrl": "https://sonar.internal",
        "codeHealth.wakaTime.proxyPath": "/code-health-wakatime",
      }),
    );

    // then
    expect(result.baseUrls).toEqual({
      github: "https://ghe.internal/api/graphql",
      sonar: "https://sonar.internal",
    });
    expect(result.proxyPaths).toEqual({
      "azure-devops": "/code-health-ado",
      wakatime: "/code-health-wakatime",
    });
  });
});
