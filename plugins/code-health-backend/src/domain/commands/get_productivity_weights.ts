import type { ProductivityWeightsByRole } from "@rios0rios0/backstage-plugin-code-health-common";
import { productivityWeightsByRoleOf } from "../entities/productivity_weights";
import type { CodeHealthStore } from "../repositories/code_health_store";

/**
 * The weights every role is scored on right now.
 *
 * Read from the database on every call rather than cached, like every other
 * read here: an administrator who changes a role's weights expects the next
 * request to score through them, and a cache would make the editor's "saved"
 * a lie for however long it lived. The table holds at most one row per role,
 * so the read costs nothing worth saving.
 */
export class GetProductivityWeights {
  constructor(private readonly store: CodeHealthStore) {}

  async run(): Promise<ProductivityWeightsByRole> {
    return productivityWeightsByRoleOf(await this.store.listProductivityWeights());
  }
}
