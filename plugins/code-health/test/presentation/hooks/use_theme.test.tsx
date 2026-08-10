import { renderHook, act } from "@testing-library/react";
import type { ReactNode } from "react";
import { appThemeApiRef } from "@backstage/core-plugin-api";
import { TestApiProvider } from "@backstage/test-utils";
import { useTheme } from "../../../src/presentation/hooks/use_theme";
import { StubAppThemeApi } from "../../doubles/stub_app_theme_api";

const renderUseTheme = (appThemeApi: StubAppThemeApi) =>
  renderHook(() => useTheme(), {
    wrapper: ({ children }: { children: ReactNode }) => (
      <TestApiProvider apis={[[appThemeApiRef, appThemeApi]]}>{children}</TestApiProvider>
    ),
  });

describe("useTheme", () => {
  it("should report the active theme when the app selected dark", () => {
    // given
    const appThemeApi = new StubAppThemeApi("dark");

    // when
    const { result } = renderUseTheme(appThemeApi);

    // then
    expect(result.current.theme).toBe("dark");
  });

  it("should report the active theme when the app selected light", () => {
    // given
    const appThemeApi = new StubAppThemeApi("light");

    // when
    const { result } = renderUseTheme(appThemeApi);

    // then
    expect(result.current.theme).toBe("light");
  });

  it("should fall back to the Material UI palette when no theme is selected", () => {
    // given
    const appThemeApi = new StubAppThemeApi(undefined);

    // when
    const { result } = renderUseTheme(appThemeApi);

    // then
    expect(result.current.theme).toBe("light");
  });

  it("should switch the app theme from light to dark", () => {
    // given
    const appThemeApi = new StubAppThemeApi("light");
    const { result } = renderUseTheme(appThemeApi);

    // when
    act(() => {
      result.current.toggleTheme();
    });

    // then
    expect(appThemeApi.getActiveThemeId()).toBe("dark");
    expect(result.current.theme).toBe("dark");
  });

  it("should switch the app theme from dark to light", () => {
    // given
    const appThemeApi = new StubAppThemeApi("dark");
    const { result } = renderUseTheme(appThemeApi);

    // when
    act(() => {
      result.current.toggleTheme();
    });

    // then
    expect(appThemeApi.getActiveThemeId()).toBe("light");
    expect(result.current.theme).toBe("light");
  });

  it("should follow theme changes made outside the plugin", () => {
    // given
    const appThemeApi = new StubAppThemeApi("light");
    const { result } = renderUseTheme(appThemeApi);

    // when
    act(() => {
      appThemeApi.setActiveThemeId("dark");
    });

    // then
    expect(result.current.theme).toBe("dark");
  });
});
