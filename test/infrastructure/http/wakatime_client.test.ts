import { describe, it, expect, beforeEach } from "vitest";
import { HttpWakaTimeClient } from "../../../src/infrastructure/http/wakatime_client";
import {
  createStubFetchApi,
  errorResponse,
  jsonResponse,
  StubEndpointResolver,
} from "../../doubles/stub_backstage_apis";

const DIRECT_ENDPOINT = { baseUrl: "https://wakatime.com/api/v1", viaProxy: false };
const PROXY_ENDPOINT = {
  baseUrl: "http://localhost:7007/api/proxy/gitforge-wakatime",
  viaProxy: true,
};

describe("HttpWakaTimeClient", () => {
  let stubFetch: ReturnType<typeof createStubFetchApi>;

  const createClient = (endpoint = DIRECT_ENDPOINT) =>
    new HttpWakaTimeClient(stubFetch.fetchApi, new StubEndpointResolver(endpoint));

  beforeEach(() => {
    stubFetch = createStubFetchApi();
  });

  it("should return parsed JSON when the API responds successfully", async () => {
    // given
    stubFetch.fetch.mockResolvedValue(jsonResponse({ data: [] }));

    // when
    const result = await createClient().get("token", "/orgs/my-org/members");

    // then
    expect(result).toEqual({ data: [] });
    expect(stubFetch.fetch.mock.calls[0][0]).toBe(
      "https://wakatime.com/api/v1/orgs/my-org/members",
    );
  });

  it("should throw when the API responds with an error status", async () => {
    // given
    stubFetch.fetch.mockResolvedValue(errorResponse(402, "Payment Required"));

    // when / then
    await expect(createClient().get("token", "/orgs/my-org/members")).rejects.toThrow(
      "WakaTime API error: 402",
    );
  });

  it("should send a bearer token when calling WakaTime directly", async () => {
    // given
    stubFetch.fetch.mockResolvedValue(jsonResponse({ data: [] }));

    // when
    await createClient().get("waka-token", "/orgs/my-org/members");

    // then
    const [, options] = stubFetch.fetch.mock.calls[0];
    expect(options.headers.Authorization).toBe("Bearer waka-token");
  });

  it("should omit the Authorization header when routed through the proxy", async () => {
    // given
    stubFetch.fetch.mockResolvedValue(jsonResponse({ data: [] }));

    // when
    await createClient(PROXY_ENDPOINT).get("waka-token", "/orgs/my-org/members");

    // then
    const [url, options] = stubFetch.fetch.mock.calls[0];
    expect(url).toBe("http://localhost:7007/api/proxy/gitforge-wakatime/orgs/my-org/members");
    expect(options.headers.Authorization).toBeUndefined();
  });
});
