import { HttpGraphQLClient } from "../../../src/infrastructure/http/graphql_client";
import {
  createStubFetchApi,
  errorResponse,
  jsonResponse,
  StubEndpointResolver,
} from "../../doubles/stub_backstage_apis";

const DIRECT_ENDPOINT = { baseUrl: "https://api.github.com/graphql", viaProxy: false };
const PROXY_ENDPOINT = {
  baseUrl: "http://localhost:7007/api/proxy/code-health-github",
  viaProxy: true,
};

describe("HttpGraphQLClient", () => {
  let stubFetch: ReturnType<typeof createStubFetchApi>;

  const createClient = (endpoint = DIRECT_ENDPOINT) =>
    new HttpGraphQLClient(stubFetch.fetchApi, new StubEndpointResolver(endpoint));

  beforeEach(() => {
    stubFetch = createStubFetchApi();
  });

  it("should return data when API responds successfully", async () => {
    // given
    stubFetch.fetch.mockResolvedValue(jsonResponse({ data: { user: { login: "octocat" } } }));

    // when
    const result = await createClient().request("token", "query {}");

    // then
    expect(result).toEqual({ user: { login: "octocat" } });
  });

  it("should throw when HTTP response is not ok", async () => {
    // given
    stubFetch.fetch.mockResolvedValue(errorResponse(401, "Unauthorized"));

    // when / then
    await expect(createClient().request("token", "query {}")).rejects.toThrow(
      "GitHub API error: 401 Unauthorized",
    );
  });

  it("should throw when GraphQL response contains errors", async () => {
    // given
    stubFetch.fetch.mockResolvedValue(
      jsonResponse({ data: null, errors: [{ message: "Bad credentials" }] }),
    );

    // when / then
    await expect(createClient().request("token", "query {}")).rejects.toThrow(
      "GraphQL error: Bad credentials",
    );
  });

  it("should send the bearer token when calling the API directly", async () => {
    // given
    stubFetch.fetch.mockResolvedValue(jsonResponse({ data: {} }));

    // when
    await createClient().request("my-token", "query {}");

    // then
    const [url, options] = stubFetch.fetch.mock.calls[0];
    expect(url).toBe("https://api.github.com/graphql");
    expect(options.headers.Authorization).toBe("bearer my-token");
  });

  it("should omit the Authorization header when routed through the proxy", async () => {
    // given
    stubFetch.fetch.mockResolvedValue(jsonResponse({ data: {} }));

    // when
    await createClient(PROXY_ENDPOINT).request("my-token", "query {}");

    // then
    const [url, options] = stubFetch.fetch.mock.calls[0];
    expect(url).toBe("http://localhost:7007/api/proxy/code-health-github");
    expect(options.headers.Authorization).toBeUndefined();
  });

  it("should send query and variables in the request body", async () => {
    // given
    stubFetch.fetch.mockResolvedValue(jsonResponse({ data: {} }));

    // when
    await createClient().request("token", "query Q($a: String) {}", { a: "b" });

    // then
    const [, options] = stubFetch.fetch.mock.calls[0];
    expect(options.method).toBe("POST");
    expect(JSON.parse(options.body)).toEqual({
      query: "query Q($a: String) {}",
      variables: { a: "b" },
    });
  });
});
