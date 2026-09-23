import type { LoggerService } from "@backstage/backend-plugin-api";
import type {
  ContributorRole,
  ProductivityWeights,
} from "@rios0rios0/backstage-plugin-code-health-common";
import type { CodeHealthStore } from "../repositories/code_health_store";

export interface UpdateProductivityWeightsOptions {
  readonly store: CodeHealthStore;
  readonly logger?: LoggerService;
}

/**
 * Replaces the weights one role is scored on, or sends them back to the
 * defaults.
 *
 * The whole set arrives at once, already validated by the route: every
 * component named, nothing negative, something above zero. Nothing collected
 * is touched — the weights are applied when a score is folded, so the change
 * reaches every window the plugin has ever collected, the trends included.
 *
 * Both halves are logged with who asked. These numbers decide how people are
 * read, and an operator looking at a score that moved overnight needs to find
 * the moment somebody moved it.
 */
export class UpdateProductivityWeights {
  constructor(private readonly options: UpdateProductivityWeightsOptions) {}

  async update(input: {
    role: ContributorRole;
    weights: ProductivityWeights;
    updatedBy: string | null;
    now: Date;
  }): Promise<void> {
    await this.options.store.saveProductivityWeights({
      role: input.role,
      weights: input.weights,
      updatedBy: input.updatedBy,
      updatedAt: input.now,
    });

    this.options.logger?.info(
      `productivity weights for ${input.role} replaced by ${input.updatedBy ?? "an administrator"}`,
    );
  }

  /**
   * Forgets what was stored for the role, so it is scored on the defaults again.
   *
   * Deleting rather than writing the defaults back, so a later release's
   * better defaults reach an install that never customised the role.
   */
  async reset(input: { role: ContributorRole; updatedBy: string | null }): Promise<void> {
    await this.options.store.deleteProductivityWeights(input.role);

    this.options.logger?.info(
      `productivity weights for ${input.role} restored to the defaults by ${
        input.updatedBy ?? "an administrator"
      }`,
    );
  }
}
