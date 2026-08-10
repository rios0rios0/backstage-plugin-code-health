/**
 * Raised when a run has spent every request it was allowed.
 *
 * This is a normal outcome rather than a fault: the run stops, leaves its
 * cursors where they are, and the next one resumes from there. Callers are
 * expected to catch it and finish cleanly.
 */
export class BudgetExhaustedError extends Error {
  constructor(readonly spent: number) {
    super(`request budget exhausted after ${spent} requests`);
    this.name = "BudgetExhaustedError";
  }
}

/**
 * A run's allowance of provider requests.
 *
 * Capping the work per run — rather than per repository, or not at all — is
 * what bounds the load the plugin puts on a provider no matter how many
 * repositories the catalog holds. Retries draw from the same allowance, because
 * a retry is a real request and a host that is failing should not be granted
 * more traffic than one that is healthy.
 */
export class RequestBudget {
  private consumed = 0;

  constructor(private readonly limit: number) {}

  /** Reserves one request, or returns false when the allowance is gone. */
  tryConsume(): boolean {
    if (this.consumed >= this.limit) return false;
    this.consumed += 1;
    return true;
  }

  /** Reserves one request, throwing rather than returning false. */
  consume(): void {
    if (!this.tryConsume()) throw new BudgetExhaustedError(this.consumed);
  }

  get spent(): number {
    return this.consumed;
  }

  get remaining(): number {
    return Math.max(0, this.limit - this.consumed);
  }

  get isExhausted(): boolean {
    return this.consumed >= this.limit;
  }
}
