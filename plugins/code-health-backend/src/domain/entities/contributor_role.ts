import type { ContributorRole } from "@rios0rios0/backstage-plugin-code-health-common";
import { isIdentitySource } from "@rios0rios0/backstage-plugin-code-health-common";
import type { IdentityRef } from "./identity";

/**
 * A statement that a person is scored as an engineer or as a lead.
 *
 * Recorded under the person key their contributor row carried when the
 * administrator made the statement: a catalog reference for somebody linked,
 * `<source>:<sourceKey>` for an account nobody has linked yet. It is resolved
 * through the person directory on read rather than baked into the stored
 * rows, so changing somebody's role today re-reads every window the plugin
 * has ever collected through the new weights — the same rule a link and an
 * exclusion follow, and for the same reason.
 */
export interface ContributorRoleRecord {
  readonly personKey: string;
  readonly role: ContributorRole;
  /** The catalog user who assigned the role. */
  readonly assignedBy: string | null;
  readonly assignedAt: Date;
}

/**
 * The account a person key names, when it names one.
 *
 * A linked person's key is their catalog reference and names no account; an
 * unlinked account's key is `<source>:<sourceKey>`, the same composite the
 * identity table is keyed by. Only the first colon splits it, because a source
 * never contains one and an account key routinely does — an e-mail address
 * does not, but nothing guarantees the next source's identifiers will not.
 */
export const accountOfPersonKey = (personKey: string): IdentityRef | null => {
  const separator = personKey.indexOf(":");
  if (separator <= 0) return null;
  const source = personKey.slice(0, separator);
  const sourceKey = personKey.slice(separator + 1);
  if (!isIdentitySource(source) || sourceKey === "") return null;
  return { source, sourceKey };
};
