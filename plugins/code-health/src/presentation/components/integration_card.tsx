import { type ReactNode, useState } from "react";
import Box from "@material-ui/core/Box";
import Button from "@material-ui/core/Button";
import Typography from "@material-ui/core/Typography";
import { InfoCard } from "@backstage/core-components";
import { StateChip } from "./state_chip";

interface IntegrationCardProps {
  title: string;
  description: string;
  status: "connected" | "disconnected";
  isRequired?: boolean;
  /** Explains that some fields come from `app-config.yaml` and cannot be edited here. */
  managedNote?: string;
  children: (editing: boolean) => ReactNode;
  onSave: () => void;
  onCancel?: () => void;
  onDisconnect?: () => void;
}

export const IntegrationCard = ({
  title,
  description,
  status,
  isRequired = false,
  managedNote,
  children,
  onSave,
  onCancel,
  onDisconnect,
}: IntegrationCardProps) => {
  const [editing, setEditing] = useState(false);

  const handleSave = () => {
    onSave();
    setEditing(false);
  };

  const handleCancel = () => {
    onCancel?.();
    setEditing(false);
  };

  const actions = editing ? (
    <>
      <Button color="primary" variant="contained" size="small" onClick={handleSave}>
        Save
      </Button>
      <Button size="small" onClick={handleCancel}>
        Cancel
      </Button>
    </>
  ) : (
    <>
      <Button size="small" variant="outlined" onClick={() => setEditing(true)}>
        Edit
      </Button>
      {!isRequired && status === "connected" && onDisconnect && (
        <Button size="small" variant="outlined" onClick={onDisconnect}>
          Disconnect
        </Button>
      )}
    </>
  );

  return (
    <InfoCard
      title={title}
      titleTypographyProps={{ component: "h2", variant: "h6" }}
      subheader={description}
      action={
        <StateChip
          testId="statusBadge"
          tone={status === "connected" ? "success" : "neutral"}
          label={status === "connected" ? "Connected" : "Disconnected"}
        />
      }
      actions={actions}
    >
      {managedNote && (
        <Box mb={2}>
          <Typography variant="caption" color="textSecondary">
            {managedNote}
          </Typography>
        </Box>
      )}
      <Box display="flex" flexDirection="column" gridGap={12}>
        {children(editing)}
      </Box>
    </InfoCard>
  );
};
