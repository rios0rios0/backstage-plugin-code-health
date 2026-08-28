import type { IntegrationCapabilities } from "@rios0rios0/backstage-plugin-code-health-common";
import { NO_INTEGRATIONS } from "@rios0rios0/backstage-plugin-code-health-common";
import { useCallback, useEffect, useState } from "react";
import type { IntegrationsService } from "../../domain/services/dashboard_service";

export interface UseCapabilitiesResult {
  readonly capabilities: IntegrationCapabilities;
  readonly isLoading: boolean;
}

/**
 * Which integrations the backend was configured with, asked once.
 *
 * A failure is not surfaced. The tabs already have a reachability gate, and a
 * second error panel saying the same thing would push the dashboard off the
 * screen; an unreachable backend simply reports nothing enabled, which draws
 * exactly the columns a backend with no integrations would.
 */
export const useCapabilities = (service: IntegrationsService): UseCapabilitiesResult => {
  const [capabilities, setCapabilities] = useState<IntegrationCapabilities>(NO_INTEGRATIONS);
  const [isLoading, setIsLoading] = useState(true);

  const fetchCapabilities = useCallback(async () => {
    setIsLoading(true);
    try {
      setCapabilities(await service.getCapabilities());
    } catch {
      setCapabilities(NO_INTEGRATIONS);
    } finally {
      setIsLoading(false);
    }
  }, [service]);

  useEffect(() => {
    void fetchCapabilities();
  }, [fetchCapabilities]);

  return { capabilities, isLoading };
};
