import { createPermission } from "@backstage/plugin-permission-common";

/**
 * Starting the history collection over.
 *
 * `update` rather than `delete`, because the events it removes are re-derived
 * from the providers by the runs that follow: nothing is lost that the walk
 * cannot fetch again, and the lasting effect is on how far back the cursors
 * reach. Nothing else the plugin serves is permissioned — every read is a
 * dashboard the whole organisation is meant to look at.
 *
 * Registering it is what lets a host's permission policy, or the RBAC plugin,
 * refuse the reset by name. It is deliberately not the only gate: on a stock
 * Backstage the default policy allows everything, so the framework alone would
 * make every signed-in user an administrator. `codeHealth.administrators` is
 * the list that makes the restriction real out of the box, and the policy is
 * what can tighten it further.
 *
 * @public
 */
export const codeHealthIngestionResetPermission = createPermission({
  name: "code-health.ingestion.reset",
  attributes: { action: "update" },
});

/**
 * Every permission this plugin defines, for `permissionsRegistry.addPermissions`
 * and for a host writing a policy against them.
 *
 * @public
 */
export const codeHealthPermissions = [codeHealthIngestionResetPermission];
