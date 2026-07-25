import { HttpSonarClient } from "../../../src/infrastructure/http/sonar_client";
import {
  createStubFetchApi,
  errorResponse,
  jsonResponse,
  StubEndpointResolver,
} from "../../doubles/stub_backstage_apis";

const DIRECT_ENDPOINT = { baseUrl: "https://sonarcloud.io", viaProxy: false };
const PROXY_ENDPOINT = { baseUrl: "http://localhost:7007/api/proxy/gitforge-sonar", viaProxy: true };

describe("HttpSonarClient", () => {
  let stubFetch: ReturnType<typeof createStubFetchApi>;

  beforeEach(() => {
    stubFetch = createStubFetchApi();
  });

  it("should return parsed JSON when the API responds successfully", async () => {
    // given
    const resolver = new StubEndpointResolver(DIRECT_ENDPOINT);
    const client = new HttpSonarClient(stubFetch.fetchApi, resolver);
    stubFetch.fetch.mockResolvedValue(jsonResponse({ components: [] }));

    // when
    const result = await client.get("token", null, "/api/projects/search");

    // then
    expect(result).toEqual({ components: [] });
    expect(stubFetch.fetch.mock.calls[0][0]).toBe("https://sonarcloud.io/api/projects/search");
  });

  it("should throw when the API responds with an error status", async () => {
    // given
    const client = new HttpSonarClient(stubFetch.fetchApi, new StubEndpointResolver(DIRECT_ENDPOINT));
    stubFetch.fetch.mockResolvedValue(errorResponse(401, "Unauthorized"));

    // when / then
    await expect(client.get("token", null, "/api/projects/search")).rejects.toThrow(
      "Sonar API error: 401",
    );
  });

  it("should forward the base URL override to the resolver", async () => {
    // given
    const resolver = new StubEndpointResolver(DIRECT_ENDPOINT);
    const client = new HttpSonarClient(stubFetch.fetchApi, resolver);
    stubFetch.fetch.mockResolvedValue(jsonResponse({}));

    // when
    await client.get("token", "https://sonarqube.internal", "/api/projects/search");

    // then
    expect(resolver.calls[0]).toEqual({
      target: "sonar",
      overrideBaseUrl: "https://sonarqube.internal",
    });
  });

  it("should send a bearer token when calling Sonar directly", async () => {
    // given
    const client = new HttpSonarClient(stubFetch.fetchApi, new StubEndpointResolver(DIRECT_ENDPOINT));
    stubFetch.fetch.mockResolvedValue(jsonResponse({}));

    // when
    await client.get("my-sonar-token", null, "/api/projects/search");

    // then
    const [, options] = stubFetch.fetch.mock.calls[0];
    expect(options.headers.Authorization).toBe("Bearer my-sonar-token");
  });

  it("should omit the Authorization header when routed through the proxy", async () => {
    // given
    const client = new HttpSonarClient(stubFetch.fetchApi, new StubEndpointResolver(PROXY_ENDPOINT));
    stubFetch.fetch.mockResolvedValue(jsonResponse({}));

    // when
    await client.get("my-sonar-token", null, "/api/projects/search");

    // then
    const [url, options] = stubFetch.fetch.mock.calls[0];
    expect(url).toBe("http://localhost:7007/api/proxy/gitforge-sonar/api/projects/search");
    expect(options.headers.Authorization).toBeUndefined();
  });
});
