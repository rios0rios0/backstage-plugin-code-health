import type { AdministrationService } from "../../domain/services/dashboard_service";

export interface IngestionResetButtonProps {
  readonly administrationService: AdministrationService;
  /** Called after a reset was accepted, so the caller can re-read coverage. */
  readonly onReset: () => void;
}

/**
 * The administrator's control for starting the history collection over.
 *
 * Placeholder: the access probe, the confirmation dialog and the reach picker
 * are built by the administration work; this keeps the header slot and the
 * props wired in the meantime, and draws nothing for anybody.
 */
export const IngestionResetButton = (_props: IngestionResetButtonProps) => null;
