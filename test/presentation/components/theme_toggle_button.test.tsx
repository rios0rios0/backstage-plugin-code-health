import { describe, it, expect } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { appThemeApiRef } from "@backstage/core-plugin-api";
import { TestApiProvider } from "@backstage/test-utils";
import { ThemeToggleButton } from "../../../src/presentation/components/theme_toggle_button";
import { StubAppThemeApi } from "../../doubles/stub_app_theme_api";

const renderButton = (appThemeApi: StubAppThemeApi) =>
  render(
    <TestApiProvider apis={[[appThemeApiRef, appThemeApi]]}>
      <ThemeToggleButton />
    </TestApiProvider>,
  );

describe("ThemeToggleButton", () => {
  it("should render an accessible toggle", () => {
    // given / when
    renderButton(new StubAppThemeApi("light"));

    // then
    expect(screen.getByLabelText("Toggle theme")).toBeInTheDocument();
  });

  it("should switch the app theme to dark when the active theme is light", () => {
    // given
    const appThemeApi = new StubAppThemeApi("light");
    renderButton(appThemeApi);

    // when
    fireEvent.click(screen.getByLabelText("Toggle theme"));

    // then
    expect(appThemeApi.getActiveThemeId()).toBe("dark");
  });

  it("should switch the app theme to light when the active theme is dark", () => {
    // given
    const appThemeApi = new StubAppThemeApi("dark");
    renderButton(appThemeApi);

    // when
    fireEvent.click(screen.getByLabelText("Toggle theme"));

    // then
    expect(appThemeApi.getActiveThemeId()).toBe("light");
  });
});
