import { useCallback, useEffect, useState } from "react";
import Paper from "@material-ui/core/Paper";
import Typography from "@material-ui/core/Typography";
import { makeStyles } from "@material-ui/core/styles";
import type { BadgeColor, BadgeStatus } from "../../domain/entities/badge_status";
import { EmptyCell } from "./empty_cell";
import type { ChipTone } from "./state_chip";
import { StateChip } from "./state_chip";

const COLOR_STYLES: Record<BadgeColor, { tone: ChipTone; label: string }> = {
  green: { tone: "success", label: "Complete" },
  yellow: { tone: "warning", label: "Incomplete" },
};

const useStyles = makeStyles((theme) => ({
  anchor: {
    position: "relative",
  },
  overlay: {
    position: "fixed",
    inset: 0,
    zIndex: theme.zIndex.modal - 1,
  },
  popup: {
    position: "absolute",
    left: 0,
    top: "100%",
    zIndex: theme.zIndex.modal,
    marginTop: theme.spacing(0.5),
    width: 256,
  },
  list: {
    listStyle: "none",
    margin: 0,
    padding: theme.spacing(0.5, 0),
  },
  item: {
    display: "flex",
    alignItems: "center",
    gap: theme.spacing(1),
    padding: theme.spacing(0.5, 1.5),
  },
  present: {
    color: theme.palette.success.main,
  },
  missing: {
    color: theme.palette.error.main,
  },
}));

interface BadgeStatusCellProps {
  status: BadgeStatus | null;
}

export const BadgeStatusCell = ({ status }: BadgeStatusCellProps) => {
  const classes = useStyles();
  const [open, setOpen] = useState(false);
  const toggle = useCallback(() => setOpen((prev) => !prev), []);
  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return undefined;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, close]);

  if (!status) return <EmptyCell />;

  const { tone, label } = COLOR_STYLES[status.color];

  return (
    <div className={classes.anchor}>
      <StateChip tone={tone} label={label} onClick={toggle} ariaExpanded={open} />
      {open && (
        <>
          <div
            data-testid="badge-overlay"
            className={classes.overlay}
            onClick={close}
            aria-hidden="true"
          />
          <Paper elevation={8} role="menu" aria-label="Badge details" className={classes.popup}>
            <ul className={classes.list}>
              {status.checks.map((check) => (
                <li key={check.label} className={classes.item}>
                  <span className={check.present ? classes.present : classes.missing}>
                    {check.present ? "✓" : "✗"}
                  </span>
                  <Typography variant="caption">{check.label}</Typography>
                </li>
              ))}
            </ul>
          </Paper>
        </>
      )}
    </div>
  );
};
