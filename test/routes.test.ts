import {
  contributorsRouteRef,
  rootRouteRef,
  settingsRouteRef,
} from "../src/routes";

describe("routes", () => {
  it("should expose a root route ref identified as the plugin", () => {
    // given / when
    const description = String(rootRouteRef);

    // then
    expect(description).toContain("code-health");
  });

  it("should mount the contributors sub route under the root route", () => {
    // given / when
    const path = contributorsRouteRef.path;

    // then
    expect(path).toBe("/contributors");
    expect(contributorsRouteRef.parent).toBe(rootRouteRef);
  });

  it("should mount the settings sub route under the root route", () => {
    // given / when
    const path = settingsRouteRef.path;

    // then
    expect(path).toBe("/settings");
    expect(settingsRouteRef.parent).toBe(rootRouteRef);
  });

  it("should keep the two sub routes distinct", () => {
    // given / when
    const paths = [contributorsRouteRef.path, settingsRouteRef.path];

    // then
    expect(new Set(paths).size).toBe(2);
  });
});
