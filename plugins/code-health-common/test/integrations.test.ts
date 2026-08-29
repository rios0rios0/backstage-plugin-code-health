import {
  enabledIntegrations,
  INTEGRATION_IDS,
  isIntegrationId,
  NO_INTEGRATIONS,
  parseIntegrationCapabilities,
} from "../src/integrations";

describe("isIntegrationId", () => {
  it("should accept every declared id", () => {
    // given
    const ids = INTEGRATION_IDS;

    // when
    const result = ids.every(isIntegrationId);

    // then
    expect(result).toBe(true);
  });

  it("should reject a value that is not one of them", () => {
    // given / when / then
    expect(isIntegrationId("sonar")).toBe(false);
    expect(isIntegrationId(7)).toBe(false);
    expect(isIntegrationId(null)).toBe(false);
  });
});

describe("parseIntegrationCapabilities", () => {
  it("should read the flags a backend reported", () => {
    // given
    const body = { wakatime: true, jira: false, confluence: true };

    // when
    const capabilities = parseIntegrationCapabilities(body);

    // then
    expect(capabilities).toEqual({ wakatime: true, jira: false, confluence: true });
  });

  it("should report an integration the backend never mentioned as disabled", () => {
    // given
    // A frontend one release ahead of its backend asks about integrations that
    // backend has never heard of.
    const body = { wakatime: true };

    // when
    const capabilities = parseIntegrationCapabilities(body);

    // then
    expect(capabilities).toEqual({ wakatime: true, jira: false, confluence: false });
  });

  it("should treat a non-boolean flag as disabled", () => {
    // given
    const body = { wakatime: "yes", jira: 1, confluence: null };

    // when
    const capabilities = parseIntegrationCapabilities(body);

    // then
    expect(capabilities).toEqual(NO_INTEGRATIONS);
  });

  it("should report nothing enabled when the body is not an object", () => {
    // given / when / then
    expect(parseIntegrationCapabilities(null)).toEqual(NO_INTEGRATIONS);
    expect(parseIntegrationCapabilities("wakatime")).toEqual(NO_INTEGRATIONS);
    expect(parseIntegrationCapabilities(undefined)).toEqual(NO_INTEGRATIONS);
  });
});

describe("enabledIntegrations", () => {
  it("should list only the enabled ids, in declaration order", () => {
    // given
    const capabilities = { wakatime: true, jira: false, confluence: true };

    // when
    const enabled = enabledIntegrations(capabilities);

    // then
    expect(enabled).toEqual(["wakatime", "confluence"]);
  });

  it("should return an empty list when nothing is configured", () => {
    // given / when
    const enabled = enabledIntegrations(NO_INTEGRATIONS);

    // then
    expect(enabled).toEqual([]);
  });
});
