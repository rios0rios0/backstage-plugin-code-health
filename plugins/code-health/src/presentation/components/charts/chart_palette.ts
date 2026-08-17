import { useTheme } from "@material-ui/core/styles";
import type { StatusTone } from "../../../domain/entities/insights";

/**
 * The chart colours, one set per mode.
 *
 * Neither set was picked by eye. Both were run through a colour-vision
 * simulator: the two series hold their separation under deuteranopia,
 * protanopia and tritanopia, keep enough chroma to read as colours rather than
 * greys, sit inside the mode's lightness band, and clear 3:1 against their own
 * surface. The dark steps are chosen against the dark surface rather than
 * derived by lightening the light ones, which lands outside the band.
 *
 * The status trio is reserved: it never stands in for a third series. Red,
 * amber and green are the textbook colour-vision collision — amber against red
 * separates by about 6 for a deuteranope, which is the floor — so every status
 * mark ships with an icon and a written label and the colour only reinforces
 * what the text already says.
 */
interface ChartPalette {
  readonly series: readonly [string, string];
  readonly status: Record<StatusTone, string>;
  readonly grid: string;
  readonly axis: string;
}

const LIGHT: ChartPalette = {
  series: ["#2a78d6", "#eb6834"],
  status: {
    good: "#12855f",
    warning: "#b07d00",
    critical: "#c2352f",
    unknown: "#7a7f85",
  },
  grid: "rgba(0, 0, 0, 0.08)",
  axis: "rgba(0, 0, 0, 0.26)",
};

const DARK: ChartPalette = {
  series: ["#3987e5", "#d95926"],
  status: {
    good: "#17a06b",
    warning: "#bd8a00",
    critical: "#e05252",
    unknown: "#8a9098",
  },
  grid: "rgba(255, 255, 255, 0.10)",
  axis: "rgba(255, 255, 255, 0.32)",
};

export const useChartPalette = (): ChartPalette => {
  const theme = useTheme();
  return theme.palette.type === "dark" ? DARK : LIGHT;
};
