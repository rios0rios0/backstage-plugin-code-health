import { useCallback, useEffect, useState } from "react";
import { useTheme as useMuiTheme } from "@material-ui/core/styles";
import { appThemeApiRef, useApi } from "@backstage/core-plugin-api";

export type Theme = "light" | "dark";

/**
 * Reads and toggles the theme owned by the Backstage app rather than keeping a
 * plugin-local copy, so the plugin stays in sync with the sidebar theme picker.
 */
export const useTheme = () => {
  const appThemeApi = useApi(appThemeApiRef);
  const muiTheme = useMuiTheme();
  const [activeThemeId, setActiveThemeId] = useState<string | undefined>(() =>
    appThemeApi.getActiveThemeId(),
  );

  useEffect(() => {
    const subscription = appThemeApi.activeThemeId$().subscribe({
      next: setActiveThemeId,
    });
    return () => subscription.unsubscribe();
  }, [appThemeApi]);

  // Without an explicit selection the app follows the system preference, which
  // is only observable through the resolved Material UI palette.
  const resolvedThemeId = activeThemeId ?? muiTheme.palette.type;
  const theme: Theme = resolvedThemeId === "dark" ? "dark" : "light";

  const toggleTheme = useCallback(() => {
    appThemeApi.setActiveThemeId(theme === "light" ? "dark" : "light");
  }, [appThemeApi, theme]);

  return { theme, toggleTheme };
};
