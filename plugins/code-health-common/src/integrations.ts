/**
 * The optional systems the plugin enriches its own data with.
 *
 * Each one is configured independently and each is absent by default, so a view
 * cannot assume any of them is there. The dashboard has to be able to tell
 * "this integration is switched off" from "it is on and reported nothing" —
 * they call for completely different reactions, and a column that renders an
 * empty cell for both is answering neither question. That is why this is a
 * declared capability rather than something inferred from whether any row
 * happens to carry a value.
 */
export type IntegrationId = "wakatime" | "jira" | "confluence";

export const INTEGRATION_IDS: readonly IntegrationId[] = ["wakatime", "jira", "confluence"];

export const isIntegrationId = (value: unknown): value is IntegrationId =>
  typeof value === "string" && (INTEGRATION_IDS as readonly string[]).includes(value);

/** Which integrations the backend was configured with. */
export type IntegrationCapabilities = Readonly<Record<IntegrationId, boolean>>;

export const NO_INTEGRATIONS: IntegrationCapabilities = {
  wakatime: false,
  jira: false,
  confluence: false,
};

/**
 * Reads the capabilities out of an untyped response body.
 *
 * Anything missing or malformed reads as disabled rather than throwing. A
 * frontend one release ahead of its backend asks about integrations that
 * backend has never heard of, and the honest answer to "is Jira on?" from a
 * backend with no Jira is "no" — not a broken dashboard.
 */
export const parseIntegrationCapabilities = (value: unknown): IntegrationCapabilities => {
  if (typeof value !== "object" || value === null) return NO_INTEGRATIONS;
  const record = value as Record<string, unknown>;

  return INTEGRATION_IDS.reduce<Record<IntegrationId, boolean>>(
    (capabilities, id) => ({ ...capabilities, [id]: record[id] === true }),
    { ...NO_INTEGRATIONS },
  );
};

export const enabledIntegrations = (
  capabilities: IntegrationCapabilities,
): readonly IntegrationId[] => INTEGRATION_IDS.filter((id) => capabilities[id]);
