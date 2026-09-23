import type {
  ContributorRole,
  ProductivityWeights,
  ProductivityWeightsByRole,
} from "@rios0rios0/backstage-plugin-code-health-common";
import { DEFAULT_PRODUCTIVITY_WEIGHTS } from "@rios0rios0/backstage-plugin-code-health-common";

/**
 * The weights one role is scored on, as an administrator set them.
 *
 * A role with no record is scored on the defaults the common package ships,
 * so the table only ever holds what somebody changed and restoring a role's
 * defaults is deleting its row rather than writing the defaults back — which
 * is what keeps a later release's better defaults reaching an install that
 * never touched them.
 */
export interface ProductivityWeightsRecord {
  readonly role: ContributorRole;
  readonly weights: ProductivityWeights;
  /** The catalog user who last changed them. */
  readonly updatedBy: string | null;
  readonly updatedAt: Date;
}

/**
 * Every role's weights: what was stored where something was, the defaults
 * everywhere else.
 *
 * The one place a stored set is laid over the defaults, so the contributors
 * table, a person's trend and the editor all read one answer.
 */
export const productivityWeightsByRoleOf = (
  records: readonly ProductivityWeightsRecord[],
): ProductivityWeightsByRole =>
  records.reduce<ProductivityWeightsByRole>(
    (weights, record) => ({ ...weights, [record.role]: record.weights }),
    DEFAULT_PRODUCTIVITY_WEIGHTS,
  );
