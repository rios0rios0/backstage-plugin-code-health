import { EMPTY_GITFORGE_CONFIG, requiresToken } from "../../src/domain/entities/gitforge_config";
import { resolveSettings } from "../../src/service/settings_resolver";
import { StubAuthenticationService } from "../doubles/stub_authentication_service";
import { aGitforgeConfig } from "../builders/gitforge_config_builder";

const authWith = (values: Record<string, string>): StubAuthenticationService => {
  const service = new StubAuthenticationService();
  const setters: Record<string, (value: string) => void> = {
    token: (v) => service.setToken(v),
    username: (v) => service.setUsername(v),
    platform: (v) => service.setPlatform(v),
    sonarToken: (v) => service.setSonarToken(v),
    sonarType: (v) => service.setSonarType(v),
    sonarUrl: (v) => service.setSonarUrl(v),
    wakaTimeToken: (v) => service.setWakaTimeToken(v),
  };
  for (const [key, value] of Object.entries(values)) {
    setters[key]?.(value);
  }
  return service;
};

describe("resolveSettings", () => {
  it("should read platform, organization and token from the user's own settings", () => {
    // given
    const auth = authWith({ token: "tok", username: "acme", platform: "github" });

    // when
    const settings = resolveSettings(auth, EMPTY_GITFORGE_CONFIG);

    // then
    expect(settings.platform).toBe("github");
    expect(settings.organization).toBe("acme");
    expect(settings.token).toBe("tok");
    expect(settings.ready).toBe(true);
    expect(settings.managedPlatform).toBe(false);
    expect(settings.managedOrganization).toBe(false);
  });

  it("should let app-config override the platform and organization", () => {
    // given
    const auth = authWith({ token: "tok", username: "personal", platform: "github" });
    const config = aGitforgeConfig({ platform: "azure-devops", organization: "acme-corp" });

    // when
    const settings = resolveSettings(auth, config);

    // then
    expect(settings.platform).toBe("azure-devops");
    expect(settings.organization).toBe("acme-corp");
    expect(settings.managedPlatform).toBe(true);
    expect(settings.managedOrganization).toBe(true);
  });

  it("should ignore an unknown stored platform", () => {
    // given
    const auth = authWith({ token: "tok", username: "acme", platform: "bitbucket" });

    // when
    const settings = resolveSettings(auth, EMPTY_GITFORGE_CONFIG);

    // then
    expect(settings.platform).toBeNull();
    expect(settings.ready).toBe(false);
  });

  it("should not require a token when the platform is proxied", () => {
    // given
    const auth = authWith({ platform: "github" });
    const config = aGitforgeConfig({ organization: "acme", proxied: { github: true } });

    // when
    const settings = resolveSettings(auth, config);

    // then
    expect(settings.token).toBe("");
    expect(settings.ready).toBe(true);
  });

  it("should not be ready without an organization", () => {
    // given
    const auth = authWith({ token: "tok", platform: "github" });

    // when
    const settings = resolveSettings(auth, EMPTY_GITFORGE_CONFIG);

    // then
    expect(settings.ready).toBe(false);
  });

  it("should not be ready without a token when the platform is not proxied", () => {
    // given
    const auth = authWith({ username: "acme", platform: "github" });

    // when
    const settings = resolveSettings(auth, EMPTY_GITFORGE_CONFIG);

    // then
    expect(settings.ready).toBe(false);
  });

  it("should leave Sonar disabled when the user configured no token", () => {
    // given
    const auth = authWith({ token: "tok", username: "acme", platform: "github" });

    // when
    const settings = resolveSettings(auth, EMPTY_GITFORGE_CONFIG);

    // then
    expect(settings.sonar).toBeNull();
    expect(settings.managedSonar).toBe(false);
  });

  it("should resolve SonarCloud from the user's token and default base URL", () => {
    // given
    const auth = authWith({
      token: "tok",
      username: "acme",
      platform: "github",
      sonarToken: "sonar-tok",
      sonarType: "cloud",
    });

    // when
    const settings = resolveSettings(auth, EMPTY_GITFORGE_CONFIG);

    // then
    expect(settings.sonar).toEqual({
      type: "cloud",
      token: "sonar-tok",
      baseUrl: "https://sonarcloud.io",
      organization: "acme",
    });
  });

  it("should resolve SonarQube from the user's instance URL", () => {
    // given
    const auth = authWith({
      token: "tok",
      username: "acme",
      platform: "github",
      sonarToken: "sonar-tok",
      sonarType: "qube",
      sonarUrl: "https://sonar.internal",
    });

    // when
    const settings = resolveSettings(auth, EMPTY_GITFORGE_CONFIG);

    // then
    expect(settings.sonar?.baseUrl).toBe("https://sonar.internal");
    expect(settings.sonar?.type).toBe("qube");
  });

  it("should leave Sonar disabled when SonarQube has no instance URL", () => {
    // given
    const auth = authWith({
      token: "tok",
      username: "acme",
      platform: "github",
      sonarToken: "sonar-tok",
      sonarType: "qube",
    });

    // when
    const settings = resolveSettings(auth, EMPTY_GITFORGE_CONFIG);

    // then
    expect(settings.sonar).toBeNull();
  });

  it("should enable Sonar without a token when it is proxied", () => {
    // given
    const auth = authWith({ token: "tok", username: "acme", platform: "github" });
    const config = aGitforgeConfig({
      proxied: { sonar: true },
      sonarType: "qube",
      sonarBaseUrl: "https://sonar.internal",
      sonarOrganization: "sonar-org",
    });

    // when
    const settings = resolveSettings(auth, config);

    // then
    expect(settings.sonar).toEqual({
      type: "qube",
      token: "",
      baseUrl: "https://sonar.internal",
      organization: "sonar-org",
    });
    expect(settings.managedSonar).toBe(true);
  });

  it("should ignore an unknown stored Sonar type", () => {
    // given
    const auth = authWith({
      token: "tok",
      username: "acme",
      platform: "github",
      sonarToken: "sonar-tok",
      sonarType: "nope",
    });

    // when
    const settings = resolveSettings(auth, EMPTY_GITFORGE_CONFIG);

    // then
    expect(settings.sonar?.type).toBe("cloud");
  });

  it("should read the WakaTime token from the user's settings", () => {
    // given
    const auth = authWith({
      token: "tok",
      username: "acme",
      platform: "github",
      wakaTimeToken: "waka",
    });

    // when
    const settings = resolveSettings(auth, EMPTY_GITFORGE_CONFIG);

    // then
    expect(settings.wakaTimeToken).toBe("waka");
    expect(settings.managedWakaTime).toBe(false);
  });

  it("should enable WakaTime without a token when it is proxied", () => {
    // given
    const auth = authWith({ token: "tok", username: "acme", platform: "github" });
    const config = aGitforgeConfig({ proxied: { wakatime: true } });

    // when
    const settings = resolveSettings(auth, config);

    // then
    expect(settings.wakaTimeToken).toBe("");
    expect(settings.managedWakaTime).toBe(true);
  });
});

describe("requiresToken", () => {
  it("should require a token when the target is not proxied", () => {
    // given / when / then
    expect(requiresToken(EMPTY_GITFORGE_CONFIG, "github")).toBe(true);
  });

  it("should not require a token when the target is proxied", () => {
    // given
    const config = aGitforgeConfig({ proxied: { sonar: true } });

    // when / then
    expect(requiresToken(config, "sonar")).toBe(false);
  });
});
