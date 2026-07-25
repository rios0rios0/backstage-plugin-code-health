import { describe, it, expect } from "vitest";
import type { AuthenticationService } from "../../../src/domain/services/authentication_service";
import { DeferredAuthenticationService } from "../../../src/infrastructure/services/deferred_authentication_service";
import { StubAuthenticationService } from "../../doubles/stub_authentication_service";

const deferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { promise, resolve };
};

describe("DeferredAuthenticationService", () => {
  it("should report not ready and read null before the delegate arrives", async () => {
    // given
    const gate = deferred();
    const delegate = new StubAuthenticationService();
    delegate.setToken("tok");

    // when
    const service = new DeferredAuthenticationService(async () => {
      await gate.promise;
      return delegate;
    });

    // then
    expect(service.isReady()).toBe(false);
    expect(service.getToken()).toBeNull();
    expect(service.getUsername()).toBeNull();
    expect(service.getSonarToken()).toBeNull();
    expect(service.getSonarType()).toBeNull();
    expect(service.getSonarUrl()).toBeNull();
    expect(service.getWakaTimeToken()).toBeNull();
    expect(service.getPlatform()).toBeNull();

    gate.resolve();
    await service.whenReady();
  });

  it("should expose the delegate values once ready", async () => {
    // given
    const delegate = new StubAuthenticationService();
    delegate.setToken("tok");
    delegate.setUsername("acme");
    delegate.setPlatform("github");
    delegate.setSonarToken("sonar");
    delegate.setSonarType("cloud");
    delegate.setSonarUrl("https://sonar.internal");
    delegate.setWakaTimeToken("waka");

    // when
    const service = new DeferredAuthenticationService(async () => delegate);
    await service.whenReady();

    // then
    expect(service.isReady()).toBe(true);
    expect(service.getToken()).toBe("tok");
    expect(service.getUsername()).toBe("acme");
    expect(service.getPlatform()).toBe("github");
    expect(service.getSonarToken()).toBe("sonar");
    expect(service.getSonarType()).toBe("cloud");
    expect(service.getSonarUrl()).toBe("https://sonar.internal");
    expect(service.getWakaTimeToken()).toBe("waka");
  });

  it("should apply writes made before the delegate arrives, in order", async () => {
    // given
    const gate = deferred();
    const delegate = new StubAuthenticationService();
    const service = new DeferredAuthenticationService(async () => {
      await gate.promise;
      return delegate;
    });

    // when
    service.setToken("first");
    service.setToken("second");
    service.setUsername("acme");
    service.setPlatform("github");
    service.setSonarToken("sonar");
    service.setSonarType("cloud");
    service.setSonarUrl("https://sonar.internal");
    service.setWakaTimeToken("waka");
    gate.resolve();
    await service.whenReady();
    await Promise.resolve();

    // then
    expect(delegate.getToken()).toBe("second");
    expect(delegate.getUsername()).toBe("acme");
    expect(delegate.getPlatform()).toBe("github");
    expect(delegate.getSonarToken()).toBe("sonar");
    expect(delegate.getSonarType()).toBe("cloud");
    expect(delegate.getSonarUrl()).toBe("https://sonar.internal");
    expect(delegate.getWakaTimeToken()).toBe("waka");
  });

  it("should forward writes directly once ready", async () => {
    // given
    const delegate = new StubAuthenticationService();
    const service = new DeferredAuthenticationService(async () => delegate);
    await service.whenReady();

    // when
    service.setToken("tok");
    service.setSonarToken("sonar");
    service.setWakaTimeToken("waka");

    // then
    expect(delegate.getToken()).toBe("tok");
    expect(delegate.getSonarToken()).toBe("sonar");
    expect(delegate.getWakaTimeToken()).toBe("waka");
  });

  it("should forward the clear operations", async () => {
    // given
    const delegate = new StubAuthenticationService();
    delegate.setToken("tok");
    delegate.setSonarToken("sonar");
    delegate.setWakaTimeToken("waka");
    const service = new DeferredAuthenticationService(async () => delegate);
    await service.whenReady();

    // when
    service.clearSonar();
    service.clearWakaTimeToken();
    service.clearToken();

    // then
    expect(delegate.getToken()).toBeNull();
    expect(delegate.getSonarToken()).toBeNull();
    expect(delegate.getWakaTimeToken()).toBeNull();
  });

  it("should stay usable when the credential store fails to initialize", async () => {
    // given
    const service = new DeferredAuthenticationService(async () => {
      throw new Error("IndexedDB unavailable");
    });

    // when
    await service.whenReady();
    service.setToken("tok");

    // then
    expect(service.isReady()).toBe(false);
    expect(service.getToken()).toBeNull();
  });

  it("should drop queued writes when the delegate never arrives", async () => {
    // given
    const service: AuthenticationService = new DeferredAuthenticationService(async () => {
      throw new Error("IndexedDB unavailable");
    });

    // when
    service.setUsername("acme");
    await Promise.resolve();

    // then
    expect(service.getUsername()).toBeNull();
  });
});
