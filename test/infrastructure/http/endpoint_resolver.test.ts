import {
  BackstageEndpointResolver,
  DEFAULT_BASE_URLS,
} from "../../../src/infrastructure/http/endpoint_resolver";
import { StubDiscoveryApi } from "../../doubles/stub_backstage_apis";

const createResolver = (
  config: ConstructorParameters<typeof BackstageEndpointResolver>[1],
  proxyBaseUrl?: string,
) => new BackstageEndpointResolver(new StubDiscoveryApi(proxyBaseUrl), config);

describe("BackstageEndpointResolver", () => {
  it("should fall back to the built-in base URL when nothing is configured", async () => {
    // given
    const resolver = createResolver({ baseUrls: {}, proxyPaths: {} });

    // when
    const result = await resolver.resolve("github");

    // then
    expect(result).toEqual({ baseUrl: DEFAULT_BASE_URLS.github, viaProxy: false });
  });

  it("should use the configured base URL when no proxy is set", async () => {
    // given
    const resolver = createResolver({
      baseUrls: { "azure-devops": "https://ado.example.com/" },
      proxyPaths: {},
    });

    // when
    const result = await resolver.resolve("azure-devops");

    // then
    expect(result).toEqual({ baseUrl: "https://ado.example.com", viaProxy: false });
  });

  it("should prefer the runtime override over the configured base URL", async () => {
    // given
    const resolver = createResolver({
      baseUrls: { sonar: "https://sonarcloud.io" },
      proxyPaths: {},
    });

    // when
    const result = await resolver.resolve("sonar", "https://sonarqube.internal/");

    // then
    expect(result).toEqual({ baseUrl: "https://sonarqube.internal", viaProxy: false });
  });

  it("should ignore a blank runtime override", async () => {
    // given
    const resolver = createResolver({
      baseUrls: { sonar: "https://sonarcloud.io" },
      proxyPaths: {},
    });

    // when
    const result = await resolver.resolve("sonar", "   ");

    // then
    expect(result.baseUrl).toBe("https://sonarcloud.io");
  });

  it("should build a proxy URL from the discovery base URL when a proxy path is configured", async () => {
    // given
    const resolver = createResolver(
      { baseUrls: {}, proxyPaths: { github: "/gitforge-github" } },
      "http://localhost:7007/api/proxy/",
    );

    // when
    const result = await resolver.resolve("github");

    // then
    expect(result).toEqual({
      baseUrl: "http://localhost:7007/api/proxy/gitforge-github",
      viaProxy: true,
    });
  });

  it("should tolerate a proxy path without a leading slash", async () => {
    // given
    const resolver = createResolver(
      { baseUrls: {}, proxyPaths: { wakatime: "gitforge-wakatime/" } },
      "http://localhost:7007/api/proxy",
    );

    // when
    const result = await resolver.resolve("wakatime");

    // then
    expect(result.baseUrl).toBe("http://localhost:7007/api/proxy/gitforge-wakatime");
  });

  it("should ignore the runtime override when the target is proxied", async () => {
    // given
    const resolver = createResolver({ baseUrls: {}, proxyPaths: { sonar: "/gitforge-sonar" } });

    // when
    const result = await resolver.resolve("sonar", "https://sonarqube.internal");

    // then
    expect(result.viaProxy).toBe(true);
    expect(result.baseUrl).toBe("http://localhost:7007/api/proxy/gitforge-sonar");
  });
});
