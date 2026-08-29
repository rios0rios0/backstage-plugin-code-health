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

  describe("integrations and identities", () => {
    it("should parse the capabilities the backend reported", async () => {
      // given
      const fetchApi = new StubFetchApi().withResponses({
        body: { integrations: { wakatime: true, jira: false, confluence: true } },
      });
      const { client } = createClient(fetchApi);

      // when
      const capabilities = await client.getCapabilities();

      // then
      expect(capabilities).toEqual({ wakatime: true, jira: false, confluence: true });
    });

    it("should report an integration the backend never mentioned as disabled", async () => {
      // given
      // A frontend one release ahead of its backend asks about integrations that
      // backend has never heard of; the honest answer is "no", not a dashboard
      // that fails to render.
      const fetchApi = new StubFetchApi().withResponses({
        body: { integrations: { wakatime: true } },
      });
      const { client } = createClient(fetchApi);

      // when / then
      expect(await client.getCapabilities()).toEqual({
        wakatime: true,
        jira: false,
        confluence: false,
      });
    });

    it("should send several sources as repeated parameters, not a joined one", async () => {
      // given
      // `source=vcs,jira` is a single value that matches no known source, and
      // the backend rejects it with a 400.
      const fetchApi = new StubFetchApi().withResponses({ body: { items: [] } });
      const { client } = createClient(fetchApi);

      // when
      await client.listIdentities({ sources: ["vcs", "jira"], linked: false });

      // then
      expect(fetchApi.queryOf(0).getAll("source")).toEqual(["vcs", "jira"]);
      expect(fetchApi.queryOf(0).get("linked")).toBe("false");
    });

    it("should ask for everything when no filter is given", async () => {
      // given
      const fetchApi = new StubFetchApi().withResponses({ body: { items: [] } });
      const { client } = createClient(fetchApi);

      // when
      await client.listIdentities({});

      // then
      expect(fetchApi.calls[0]?.url).not.toContain("?");
    });

    it("should treat an empty source list as no filter at all", async () => {
      // given
      const fetchApi = new StubFetchApi().withResponses({ body: { items: [] } });
      const { client } = createClient(fetchApi);

      // when
      await client.listIdentities({ sources: [] });

      // then
      expect(fetchApi.calls[0]?.url).not.toContain("source");
    });

    it("should PUT a link, because linking the same pair twice means the same thing", async () => {
      // given
      const fetchApi = new StubFetchApi().withResponses({ status: 204 });
      const { client } = createClient(fetchApi);

      // when
      await client.linkIdentity({
        source: "wakatime",
        sourceKey: "jrios",
        entityRef: "user:default/felipe",
      });

      // then
      expect(fetchApi.calls[0]?.method).toBe("PUT");
      expect(fetchApi.calls[0]?.url).toContain("/v1/identities/links");
      expect(JSON.parse(fetchApi.calls[0]?.body ?? "{}")).toEqual({
        source: "wakatime",
        sourceKey: "jrios",
        entityRef: "user:default/felipe",
      });
    });

    it("should encode an account key that is an address into the delete path", async () => {
      // given
      // A commit author's key is an e-mail; unencoded it would break the route.
      const fetchApi = new StubFetchApi().withResponses({ status: 204 });
      const { client } = createClient(fetchApi);

      // when
      await client.unlinkIdentity({ source: "vcs", sourceKey: "dev@example.com" });

      // then
      expect(fetchApi.calls[0]?.method).toBe("DELETE");
      expect(fetchApi.calls[0]?.url).toContain("/identities/links/vcs/dev%40example.com");
    });

    it("should surface the backend's own message when a link is refused", async () => {
      // given
      const fetchApi = new StubFetchApi().withResponses({
        status: 404,
        body: { error: { message: "user:default/ghost is not a user in the catalog" } },
      });
      const { client } = createClient(fetchApi);

      // when / then
      await expect(
        client.linkIdentity({
          source: "wakatime",
          sourceKey: "jrios",
          entityRef: "user:default/ghost",
        }),
      ).rejects.toThrow("user:default/ghost is not a user in the catalog");
    });
  });
});
