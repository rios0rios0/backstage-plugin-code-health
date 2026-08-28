import { CodeHealthBackendClient } from "../../../src/infrastructure/http/code_health_backend_client";
import { StubDiscoveryApi, StubFetchApi } from "../../doubles/stub_backstage_apis";
import { aCoverageInfo } from "../../doubles/stub_coverage_service";

const WINDOW = { from: "2026-08-09T12:00:00.000Z", to: "2026-08-10T12:00:00.000Z" };

const createClient = (fetchApi: StubFetchApi) => {
  const discoveryApi = new StubDiscoveryApi();
  const client = new CodeHealthBackendClient({ discoveryApi, fetchApi: fetchApi.fetchApi });
  return { client, discoveryApi };
};

describe("CodeHealthBackendClient", () => {
  it("should ask the backend for the repositories in a window", async () => {
    // given
    const fetchApi = new StubFetchApi().withResponses({
      body: { window: WINDOW, items: [{ id: "a" }] },
    });
    const { client } = createClient(fetchApi);

    // when
    const repositories = await client.listRepositories(WINDOW);

    // then
    expect(repositories).toEqual([{ id: "a" }]);
    expect(fetchApi.queryOf(0).get("from")).toBe(WINDOW.from);
    expect(fetchApi.queryOf(0).get("to")).toBe(WINDOW.to);
  });

  it("should resolve the backend through the plugin id", async () => {
    // given
    // Both plugins claim `code-health`, which is what makes this resolve to the
    // backend rather than to nothing.
    const fetchApi = new StubFetchApi().withResponses({ body: { items: [] } });
    const { client, discoveryApi } = createClient(fetchApi);

    // when
    await client.listRepositories(WINDOW);

    // then
    expect(discoveryApi.calls).toEqual(["code-health"]);
  });

  it("should resolve the base URL again on every request", async () => {
    // given
    // A base URL captured once goes stale when the backend moves, and the
    // failure then looks like the plugin being uninstalled.
    const fetchApi = new StubFetchApi().withResponses(
      { body: { items: [] } },
      { body: { items: [] } },
    );
    const { client, discoveryApi } = createClient(fetchApi);

    // when
    await client.listRepositories(WINDOW);
    await client.listContributors(WINDOW);

    // then
    expect(discoveryApi.calls).toHaveLength(2);
  });

  it("should narrow contributors to one repository when asked", async () => {
    // given
    const fetchApi = new StubFetchApi().withResponses({ body: { items: [] } });
    const { client } = createClient(fetchApi);

    // when
    await client.listContributors(WINDOW, "repo-1");

    // then
    expect(fetchApi.queryOf(0).get("repositoryId")).toBe("repo-1");
  });

  it("should omit the repository filter when none was given", async () => {
    // given
    const fetchApi = new StubFetchApi().withResponses({ body: { items: [] } });
    const { client } = createClient(fetchApi);

    // when
    await client.listContributors(WINDOW);

    // then
    expect(fetchApi.queryOf(0).has("repositoryId")).toBe(false);
  });

  it("should read the ingestion coverage", async () => {
    // given
    const coverage = aCoverageInfo();
    const fetchApi = new StubFetchApi().withResponses({ body: coverage });
    const { client } = createClient(fetchApi);

    // when
    const result = await client.getCoverage();

    // then
    expect(result).toEqual(coverage);
    expect(fetchApi.calls[0].url).toContain("/v1/coverage");
  });

  it("should ask the backend to run its tasks now", async () => {
    // given
    const fetchApi = new StubFetchApi().withResponses({ body: { triggered: [] } });
    const { client } = createClient(fetchApi);

    // when
    await client.refresh();

    // then
    expect(fetchApi.calls[0]).toMatchObject({ method: "POST" });
    expect(fetchApi.calls[0].url).toContain("/v1/refresh");
  });

  it("should surface the message the backend explained the failure with", async () => {
    // given
    // "the requested window is longer than the retention period" tells a user
    // what to do; "request failed with 400" does not.
    const fetchApi = new StubFetchApi().withResponses({
      status: 400,
      body: { error: { message: "the requested window is longer than the retention period" } },
    });
    const { client } = createClient(fetchApi);

    // when / then
    await expect(client.listRepositories(WINDOW)).rejects.toThrow(
      "the requested window is longer than the retention period",
    );
  });

  it("should fall back to the status when the error body is not readable", async () => {
    // given
    const fetchApi = new StubFetchApi().withResponses({ status: 502 });
    const { client } = createClient(fetchApi);

    // when / then
    await expect(client.listRepositories(WINDOW)).rejects.toThrow(
      "code-health request to repositories failed with 502",
    );
  });

  it("should report a failed refresh", async () => {
    // given
    const fetchApi = new StubFetchApi().withResponses({ status: 403, body: {} });
    const { client } = createClient(fetchApi);

    // when / then
    await expect(client.refresh()).rejects.toThrow(
      "code-health request to v1/refresh failed with 403",
    );
  });

  it("should let a transport failure through", async () => {
    // given
    // A backend that is not installed answers nothing at all, and that has to
    // reach the dashboard rather than being flattened into an empty list.
    const fetchApi = new StubFetchApi().withNetworkFailure();
    const { client } = createClient(fetchApi);

    // when / then
    await expect(client.getCoverage()).rejects.toThrow("Failed to fetch");
  });
});
