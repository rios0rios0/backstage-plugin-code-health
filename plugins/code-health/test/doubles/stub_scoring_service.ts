import type {
  ContributorRole,
  ProductivityWeights,
  ProductivityWeightsByRole,
} from "@rios0rios0/backstage-plugin-code-health-common";
import { DEFAULT_PRODUCTIVITY_WEIGHTS } from "@rios0rios0/backstage-plugin-code-health-common";
import type { ScoringService } from "../../src/domain/services/dashboard_service";

/**
 * An in-memory reading of how the score is weighted and who is what.
 *
 * It keeps the weights rather than only recording calls, because what the
 * screens do after a write is read the weights again — a double that only
 * counted calls would pass whether or not the save took effect.
 */
export class StubScoringService implements ScoringService {
  private weights: ProductivityWeightsByRole = DEFAULT_PRODUCTIVITY_WEIGHTS;
  private readFailure: Error | null = null;
  private writeFailure: unknown = null;

  /** Every role assignment asked for, in order. */
  readonly assignments: Array<{ key: string; role: ContributorRole }> = [];
  /** Every set of weights written, in order. */
  readonly updates: Array<{ role: ContributorRole; weights: ProductivityWeights }> = [];
  /** Every role sent back to its defaults, in order. */
  readonly resets: ContributorRole[] = [];
  readCalls = 0;

  withWeights(weights: ProductivityWeightsByRole): this {
    this.weights = weights;
    return this;
  }

  withReadFailure(failure: Error): this {
    this.readFailure = failure;
    return this;
  }

  /** What the next write rejects with; `unknown` because a rejected fetch chain can settle with anything. */
  withWriteFailure(failure: unknown): this {
    this.writeFailure = failure;
    return this;
  }

  async getProductivityWeights(): Promise<ProductivityWeightsByRole> {
    this.readCalls += 1;
    if (this.readFailure) throw this.readFailure;
    return this.weights;
  }

  async updateProductivityWeights(
    role: ContributorRole,
    weights: ProductivityWeights,
  ): Promise<void> {
    this.updates.push({ role, weights });
    await this.failIfAsked();
    this.weights = { ...this.weights, [role]: weights };
  }

  async resetProductivityWeights(role: ContributorRole): Promise<void> {
    this.resets.push(role);
    await this.failIfAsked();
    this.weights = { ...this.weights, [role]: DEFAULT_PRODUCTIVITY_WEIGHTS[role] };
  }

  async assignContributorRole(key: string, role: ContributorRole): Promise<void> {
    this.assignments.push({ key, role });
    await this.failIfAsked();
  }

  /** Settles with whatever the failure was handed, as a rejected fetch chain would. */
  private failIfAsked(): Promise<void> {
    return this.writeFailure === null ? Promise.resolve() : Promise.reject(this.writeFailure);
  }
}
