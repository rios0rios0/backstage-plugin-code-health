import type { MouseEventHandler } from "react";
import Chip from "@material-ui/core/Chip";
import { alpha, makeStyles } from "@material-ui/core/styles";

export type ChipTone = "success" | "warning" | "error" | "info" | "neutral";

const useStyles = makeStyles((theme) => {
  const tone = (color: string) => ({
    backgroundColor: alpha(color, theme.palette.type === "dark" ? 0.24 : 0.14),
    color,
  });

  return {
    chip: {
      height: 22,
      margin: 0,
      fontSize: theme.typography.pxToRem(11),
      fontWeight: 500,
    },
    success: tone(theme.palette.success.main),
    warning: tone(theme.palette.warning.main),
    error: tone(theme.palette.error.main),
    info: tone(theme.palette.info.main),
    neutral: {
      backgroundColor: theme.palette.action.hover,
      color: theme.palette.text.secondary,
    },
  };
});

export interface StateChipProps {
  tone: ChipTone;
  label: string;
  title?: string;
  testId?: string;
  onClick?: MouseEventHandler<HTMLElement>;
  ariaExpanded?: boolean;
}

export const StateChip = ({
  tone,
  label,
  title,
  testId,
  onClick,
  ariaExpanded,
}: StateChipProps) => {
  const classes = useStyles();

  return (
    <Chip
      size="small"
      label={label}
      title={title}
      data-testid={testId}
      onClick={onClick}
      clickable={onClick !== undefined}
      aria-expanded={onClick ? Boolean(ariaExpanded) : undefined}
      aria-haspopup={onClick ? "true" : undefined}
      className={`${classes.chip} ${classes[tone]}`}
    />
  );
};
