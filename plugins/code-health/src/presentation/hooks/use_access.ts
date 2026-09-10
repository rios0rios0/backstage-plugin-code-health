import type { GetAccessResponse } from "@rios0rios0/backstage-plugin-code-health-common";
import { useCallback, useEffect, useState } from "react";
import type { AdministrationService } from "../../domain/services/dashboard_service";

/**
 * What a caller may do before the backend has answered, and what it answers
 * for everybody who is not an administrator.
 *
 * The retention matches the backend's own default, so the reach picker offers
 * a sensible list even in the window between the button appearing and the
 * probe returning — it is never the reason a reset is refused, because the
 * backend bounds `days` again on the way in.
 */
export const NO_ADMINISTRATION_ACCESS: GetAccessResponse = {
  canResetIngestion: false,
  retentionDays: 365,
};

export interface UseAccessResult {
  readonly access: GetAccessResponse;
  readonly isLoading: boolean;
}

/**
 * What this caller may do beyond reading, asked once.
 *
 * A failure is not surfaced, for the same reason the capabilities probe stays
 * quiet: the tabs already carry a reachability gate, and a second error panel
 * in the page header would say the same thing twice while pushing the
 * dashboard down. An unreachable backend reads as "not an administrator",
 * which draws exactly what a reader without the permission sees — and since
 * the backend authorises the reset route itself, a browser that guessed
 * generously would only be able to draw a button that then gets a `403`.
 */
export const useAccess = (service: AdministrationService): UseAccessResult => {
  const [access, setAccess] = useState<GetAccessResponse>(NO_ADMINISTRATION_ACCESS);
  const [isLoading, setIsLoading] = useState(true);

  const fetchAccess = useCallback(async () => {
    setIsLoading(true);
    try {
      setAccess(await service.getAccess());
    } catch {
      setAccess(NO_ADMINISTRATION_ACCESS);
    } finally {
      setIsLoading(false);
    }
  }, [service]);

  useEffect(() => {
    void fetchAccess();
  }, [fetchAccess]);

  return { access, isLoading };
};
