import { HttpAdoRestClient } from "../../../src/infrastructure/http/ado_rest_client";
import {
  createStubFetchApi,
  errorResponse,
  jsonResponse,
  StubEndpointResolver,
} from "../../doubles/stub_backstage_apis";

const DIRECT_ENDPOINT = { baseUrl: "https://dev.azure.com", viaProxy: false };
const PROXY_ENDPOINT = { baseUrl: "http://localhost:7007/api/proxy/code-health-ado", viaProxy: true };

describe("HttpAdoRestClient", () => {
  let stubFetch: ReturnType<typeof createStubFetchApi>;

  const createClient = (endpoint = DIRECT_ENDPOINT) =>
    new HttpAdoRestClient(stubFetch.fetchApi, new StubEndpointResolver(endpoint));

  beforeEach(() => {
    stubFetch = createStubFetchApi();
  });

  it("should return parsed JSON when API responds successfully", async () => {
    // given
    const responseData = { value: [{ id: "1", name: "repo1" }], count: 1 };
    stubFetch.fetch.mockResolvedValue(jsonResponse(responseData));

    // when
    const result = await createClient().get("token", "/org/_apis/projects");

    // then
    expect(result).toEqual(responseData);
  });

  it("should throw when HTTP response is not ok", async () => {
    // given
    stubFetch.fetch.mockResolvedValue(errorResponse(403, "Forbidden"));

    // when / then
    await expect(createClient().get("token", "/org/_apis/projects")).rejects.toThrow(
      "Azure DevOps API error: 403 Forbidden",
    );
  });

  it("should send Basic auth header with base64-encoded token", async () => {
    // given
    stubFetch.fetch.mockResolvedValue(jsonResponse({}));

    // when
    await createClient().get("my-pat-token", "/org/_apis/projects");

    // then
    const [, options] = stubFetch.fetch.mock.calls[0];
    expect(options.headers.Authorization).toBe(`Basic ${btoa(":my-pat-token")}`);
  });

  it("should send Content-Type application/json header", async () => {
    // given
    stubFetch.fetch.mockResolvedValue(jsonResponse({}));

    // when
    await createClient().get("token", "/org/_apis/projects");

    // then
    const [, options] = stubFetch.fetch.mock.calls[0];
    expect(options.headers["Content-Type"]).toBe("application/json");
  });

  it("should append the path to the resolved base URL", async () => {
    // given
    stubFetch.fetch.mockResolvedValue(jsonResponse({}));

    // when
    await createClient().get("token", "/org/_apis/projects?api-version=7.1");

    // then
    const [url] = stubFetch.fetch.mock.calls[0];
    expect(url).toBe("https://dev.azure.com/org/_apis/projects?api-version=7.1");
  });

  it("should omit the Authorization header when routed through the proxy", async () => {
    // given
    stubFetch.fetch.mockResolvedValue(jsonResponse({}));

    // when
    await createClient(PROXY_ENDPOINT).get("my-pat-token", "/org/_apis/projects");

    // then
    const [url, options] = stubFetch.fetch.mock.calls[0];
    expect(url).toBe("http://localhost:7007/api/proxy/code-health-ado/org/_apis/projects");
    expect(options.headers.Authorization).toBeUndefined();
  });
});
