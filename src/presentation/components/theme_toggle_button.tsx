import IconButton from "@material-ui/core/IconButton";
import Tooltip from "@material-ui/core/Tooltip";
import Brightness4Icon from "@material-ui/icons/Brightness4";
import Brightness7Icon from "@material-ui/icons/Brightness7";
import { useTheme } from "../hooks/use_theme";

/** Switches the Backstage app theme, kept here so the plugin header offers the same toggle it always had. */
export const ThemeToggleButton = () => {
  const { theme, toggleTheme } = useTheme();

  return (
    <Tooltip title="Toggle theme">
      <IconButton size="small" aria-label="Toggle theme" onClick={toggleTheme}>
        {theme === "light" ? <Brightness4Icon /> : <Brightness7Icon />}
      </IconButton>
    </Tooltip>
  );
};
