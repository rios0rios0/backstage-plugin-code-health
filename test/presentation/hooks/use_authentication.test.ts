import { renderHook, act, waitFor } from "@testing-library/react";
import { EMPTY_CODE_HEALTH_CONFIG } from "../../../src/domain/entities/code_health_config";
import { useAuthentication } from "../../../src/presentation/hooks/use_authentication";
import { StubAsyncAuthenticationService } from "../../doubles/stub_async_authentication_service";

describe("useAuthentication", () => {
  it("should initialize state from auth service", () => {
    // given
    const service = new StubAsyncAuthenticationService();
    service.setToken("t1");
    service.setUsername("u1");
    service.setPlatform("github");

    // when
    const { result } = renderHook(() => useAuthentication(service, EMPTY_CODE_HEALTH_CONFIG));

    // then
    expect(result.current.token).toBe("t1");
    expect(result.current.username).toBe("u1");
    expect(result.current.platform).toBe("github");
  });

  it("should set isConfigured to true when token, username, and platform are all present", () => {
    // given
    const service = new StubAsyncAuthenticationService();
    service.setToken("token");
    service.setUsername("user");
    service.setPlatform("github");

    // when
    const { result } = renderHook(() => useAuthentication(service, EMPTY_CODE_HEALTH_CONFIG));

    // then
    expect(result.current.isConfigured).toBe(true);
  });

  it("should set isConfigured to false when any credential is missing", () => {
    // given
    const service = new StubAsyncAuthenticationService();
    service.setToken("token");

    // when
    const { result } = renderHook(() => useAuthentication(service, EMPTY_CODE_HEALTH_CONFIG));

    // then
    expect(result.current.isConfigured).toBe(false);
  });

  it("should persist all credentials via auth service on login", () => {
    // given
    const service = new StubAsyncAuthenticationService();
    const { result } = renderHook(() => useAuthentication(service, EMPTY_CODE_HEALTH_CONFIG));

    // when
    act(() => {
      result.current.login("tok", "usr", { sonar: null, wakaTimeToken: null }, "github");
    });

    // then
    expect(result.current.token).toBe("tok");
    expect(result.current.username).toBe("usr");
    expect(result.current.platform).toBe("github");
    expect(service.getToken()).toBe("tok");
    expect(service.getUsername()).toBe("usr");
    expect(service.getPlatform()).toBe("github");
  });

  it("should persist sonar credentials when provided on login", () => {
    // given
    const service = new StubAsyncAuthenticationService();
    const { result } = renderHook(() => useAuthentication(service, EMPTY_CODE_HEALTH_CONFIG));

    // when
    act(() => {
      result.current.login(
        "tok",
        "usr",
        {
          sonar: { type: "cloud", token: "sonar-tok", url: "https://sonar.io" },
          wakaTimeToken: null,
        },
        "github",
      );
    });

    // then
    expect(result.current.sonarToken).toBe("sonar-tok");
    expect(result.current.sonarType).toBe("cloud");
    expect(result.current.sonarUrl).toBe("https://sonar.io");
    expect(service.getSonarToken()).toBe("sonar-tok");
  });

  it("should clear sonar credentials when sonar is null on login", () => {
    // given
    const service = new StubAsyncAuthenticationService();
    service.setSonarToken("old");
    service.setSonarType("cloud");
    const { result } = renderHook(() => useAuthentication(service, EMPTY_CODE_HEALTH_CONFIG));

    // when
    act(() => {
      result.current.login("tok", "usr", { sonar: null, wakaTimeToken: null }, "github");
    });

    // then
    expect(result.current.sonarToken).toBeNull();
    expect(result.current.sonarType).toBeNull();
  });

  it("should persist wakaTime token when provided on login", () => {
    // given
    const service = new StubAsyncAuthenticationService();
    const { result } = renderHook(() => useAuthentication(service, EMPTY_CODE_HEALTH_CONFIG));

    // when
    act(() => {
      result.current.login("tok", "usr", { sonar: null, wakaTimeToken: "waka-tok" }, "github");
    });

    // then
    expect(result.current.wakaTimeToken).toBe("waka-tok");
    expect(service.getWakaTimeToken()).toBe("waka-tok");
  });

  it("should clear wakaTime token when null on login", () => {
    // given
    const service = new StubAsyncAuthenticationService();
    service.setWakaTimeToken("old");
    const { result } = renderHook(() => useAuthentication(service, EMPTY_CODE_HEALTH_CONFIG));

    // when
    act(() => {
      result.current.login("tok", "usr", { sonar: null, wakaTimeToken: null }, "github");
    });

    // then
    expect(result.current.wakaTimeToken).toBeNull();
  });

  it("should clear all credentials on logout", () => {
    // given
    const service = new StubAsyncAuthenticationService();
    service.setToken("tok");
    service.setUsername("usr");
    service.setPlatform("github");
    const { result } = renderHook(() => useAuthentication(service, EMPTY_CODE_HEALTH_CONFIG));

    // when
    act(() => {
      result.current.logout();
    });

    // then
    expect(result.current.token).toBeNull();
    expect(result.current.username).toBeNull();
    expect(result.current.platform).toBeNull();
    expect(result.current.sonarToken).toBeNull();
    expect(result.current.wakaTimeToken).toBeNull();
    expect(result.current.isConfigured).toBe(false);
  });

  it("should update token, username, and platform via updateVcsCredentials", () => {
    // given
    const service = new StubAsyncAuthenticationService();
    const { result } = renderHook(() => useAuthentication(service, EMPTY_CODE_HEALTH_CONFIG));

    // when
    act(() => {
      result.current.updateVcsCredentials("new-tok", "new-usr", "azure-devops");
    });

    // then
    expect(result.current.token).toBe("new-tok");
    expect(result.current.username).toBe("new-usr");
    expect(result.current.platform).toBe("azure-devops");
  });

  it("should update sonar credentials via updateSonarConfig when provided", () => {
    // given
    const service = new StubAsyncAuthenticationService();
    const { result } = renderHook(() => useAuthentication(service, EMPTY_CODE_HEALTH_CONFIG));

    // when
    act(() => {
      result.current.updateSonarConfig({
        type: "qube",
        token: "q-tok",
        url: "https://sonar.local",
      });
    });

    // then
    expect(result.current.sonarToken).toBe("q-tok");
    expect(result.current.sonarType).toBe("qube");
    expect(result.current.sonarUrl).toBe("https://sonar.local");
  });

  it("should clear sonar credentials via updateSonarConfig when null", () => {
    // given
    const service = new StubAsyncAuthenticationService();
    service.setSonarToken("old-tok");
    service.setSonarType("cloud");
    const { result } = renderHook(() => useAuthentication(service, EMPTY_CODE_HEALTH_CONFIG));

    // when
    act(() => {
      result.current.updateSonarConfig(null);
    });

    // then
    expect(result.current.sonarToken).toBeNull();
    expect(result.current.sonarType).toBeNull();
    expect(result.current.sonarUrl).toBeNull();
  });

  it("should set new wakaTime token via updateWakaTimeToken", () => {
    // given
    const service = new StubAsyncAuthenticationService();
    const { result } = renderHook(() => useAuthentication(service, EMPTY_CODE_HEALTH_CONFIG));

    // when
    act(() => {
      result.current.updateWakaTimeToken("new-waka");
    });

    // then
    expect(result.current.wakaTimeToken).toBe("new-waka");
  });

  it("should clear wakaTime token via updateWakaTimeToken when null", () => {
    // given
    const service = new StubAsyncAuthenticationService();
    service.setWakaTimeToken("old");
    const { result } = renderHook(() => useAuthentication(service, EMPTY_CODE_HEALTH_CONFIG));

    // when
    act(() => {
      result.current.updateWakaTimeToken(null);
    });

    // then
    expect(result.current.wakaTimeToken).toBeNull();
  });

  it("should validate stored sonarType (only cloud or qube)", () => {
    // given
    const service = new StubAsyncAuthenticationService();
    service.setSonarType("invalid-type");

    // when
    const { result } = renderHook(() => useAuthentication(service, EMPTY_CODE_HEALTH_CONFIG));

    // then
    expect(result.current.sonarType).toBeNull();
  });

  it("should validate stored platform (only github or azure-devops)", () => {
    // given
    const service = new StubAsyncAuthenticationService();
    service.setPlatform("bitbucket");

    // when
    const { result } = renderHook(() => useAuthentication(service, EMPTY_CODE_HEALTH_CONFIG));

    // then
    expect(result.current.platform).toBeNull();
  });

  it("should prefer the platform and organization pinned in app-config", () => {
    // given
    const service = new StubAsyncAuthenticationService();
    service.setToken("tok");
    service.setUsername("personal");
    service.setPlatform("github");
    const config = {
      ...EMPTY_CODE_HEALTH_CONFIG,
      platform: "azure-devops" as const,
      organization: "acme-corp",
    };

    // when
    const { result } = renderHook(() => useAuthentication(service, config));

    // then
    expect(result.current.effectivePlatform).toBe("azure-devops");
    expect(result.current.effectiveOrganization).toBe("acme-corp");
    expect(result.current.platform).toBe("github");
  });

  it("should be configured without a token when the platform is proxied", () => {
    // given
    const service = new StubAsyncAuthenticationService();
    const config = {
      ...EMPTY_CODE_HEALTH_CONFIG,
      platform: "github" as const,
      organization: "acme",
      proxied: { ...EMPTY_CODE_HEALTH_CONFIG.proxied, github: true },
    };

    // when
    const { result } = renderHook(() => useAuthentication(service, config));

    // then
    expect(result.current.isConfigured).toBe(true);
  });

  it("should hydrate once the encrypted store finishes unwrapping its key", async () => {
    // given
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const service = new StubAsyncAuthenticationService(gate);
    service.setToken("tok");
    service.setUsername("acme");
    service.setPlatform("github");

    // when
    const { result } = renderHook(() => useAuthentication(service, EMPTY_CODE_HEALTH_CONFIG));
    expect(result.current.isReady).toBe(false);
    expect(result.current.token).toBeNull();
    release();

    // then
    await waitFor(() => expect(result.current.isReady).toBe(true));
    expect(result.current.token).toBe("tok");
    expect(result.current.isConfigured).toBe(true);
  });
});
