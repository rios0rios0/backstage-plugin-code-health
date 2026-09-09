import type {
  ListOwnedRepositoriesResponse,
  RepositorySummary,
  TimeWindow,
} from "@rios0rios0/backstage-plugin-code-health-common";
import type { OwnershipService } from "../../src/domain/services/dashboard_service";

export class StubOwnershipService implements OwnershipService {
  private items: RepositorySummary[] = [];
  private ownership: ListOwnedRepositoriesResponse["ownership"] = {
    entityRef: null,
    owners: [],
  };
  private error: Error | null = null;

  readonly calls: Array<{ key: string; window: TimeWindow }> = [];

  withOwnership(entityRef: string | null, owners: readonly string[]): this {
    this.ownership = { entityRef, owners };
    return this;
  }

  withRepositories(items: RepositorySummary[]): this {
    this.items = items;
    return this;
  }

  withError(error: Error): this {
    this.error = error;
    return this;
  }

  async listOwnedRepositories(
    key: string,
    window: TimeWindow,
  ): Promise<ListOwnedRepositoriesResponse> {
    this.calls.push({ key, window });
    if (this.error) throw this.error;
    return { window, ownership: this.ownership, items: this.items };
  }
}
