import {
  codeHealthApis,
  codeHealthConfigApiFactory,
  codeHealthContributorsApiFactory,
  codeHealthCoverageApiFactory,
  codeHealthRepositoriesApiFactory,
} from "../../src/main/apis";
import {
  codeHealthConfigApiRef,
  codeHealthContributorsApiRef,
  codeHealthCoverageApiRef,
  codeHealthRepositoriesApiRef,
} from "../../src/main/api_refs";
import { CodeHealthBackendClient } from "../../src/infrastructure/http/code_health_backend_client";
import {
  asConfigApi,
  StubConfigApi,
  StubDiscoveryApi,
  StubFetchApi,
} from "../doubles/stub_backstage_apis";

const clientDeps = () => ({
  discoveryApi: new StubDiscoveryApi(),
  fetchApi: new StubFetchApi().fetchApi,
});

describe("codeHealthApis", () => {
  it("should register one factory per API ref", () => {
    // given / when
    const ids = codeHealthApis.map((factory) => factory.api.id).sort();

    // then
    expect(ids).toEqual([
      codeHealthConfigApiRef.id,
      codeHealthContributorsApiRef.id,
      codeHealthCoverageApiRef.id,
      codeHealthRepositoriesApiRef.id,
    ].sort());
  });

  it("should build the same backend client for every data API", () => {
    // given / when
    const built = [
      codeHealthRepositoriesApiFactory.factory(clientDeps()),
      codeHealthContributorsApiFactory.factory(clientDeps()),
      codeHealthCoverageApiFactory.factory(clientDeps()),
    ];

    // then
    // One stateless client backs all three; separate refs only keep each view's
    // dependencies honest.
    expect(built.every((api) => api instanceof CodeHealthBackendClient)).toBe(true);
  });

  it("should read the configured defaults into the config API", () => {
    // given
    const configApi = asConfigApi(
      new StubConfigApi({
        "codeHealth.refreshIntervalMs": 60000,
        "codeHealth.defaultRange": "week",
      }),
    );

    // when
    const config = codeHealthConfigApiFactory.factory({ configApi });

    // then
    expect(config).toEqual({ refreshIntervalMs: 60000, defaultRange: "week" });
  });

  it("should fall back to the defaults when nothing is configured", () => {
    // given
    const configApi = asConfigApi(new StubConfigApi({}));

    // when
    const config = codeHealthConfigApiFactory.factory({ configApi });

    // then
    expect(config).toEqual({ refreshIntervalMs: null, defaultRange: "day" });
  });

  it("should ignore a range nobody can select", () => {
    // given
    // A typo in `app-config.yaml` should leave the dashboard working rather
    // than replacing it with an error page.
    const configApi = asConfigApi(new StubConfigApi({ "codeHealth.defaultRange": "fortnight" }));

    // when
    const config = codeHealthConfigApiFactory.factory({ configApi });

    // then
    expect(config.defaultRange).toBe("day");
  });

  it("should ignore a negative refresh interval", () => {
    // given
    const configApi = asConfigApi(new StubConfigApi({ "codeHealth.refreshIntervalMs": -1 }));

    // when
    const config = codeHealthConfigApiFactory.factory({ configApi });

    // then
    expect(config.refreshIntervalMs).toBeNull();
  });
});
