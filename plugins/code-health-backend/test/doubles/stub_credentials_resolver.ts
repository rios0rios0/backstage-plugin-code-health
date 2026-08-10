import type { TrackedRepository } from "../../src/domain/entities/tracked_repository";
import {
  MissingCredentialsError,
  type CredentialsResolver,
} from "../../src/domain/services/credentials_resolver";

export class StubCredentialsResolver implements CredentialsResolver {
  private headers: Record<string, string> = { Authorization: "Basic fixture-token-placeholder" };
  private failing = false;

  /** Repositories credentials were asked for, in order. */
  readonly calls: string[] = [];

  withHeaders(headers: Record<string, string>): StubCredentialsResolver {
    this.headers = headers;
    return this;
  }

  withMissingCredentials(): StubCredentialsResolver {
    this.failing = true;
    return this;
  }

  async resolve(repository: TrackedRepository): Promise<Record<string, string>> {
    this.calls.push(repository.entityRef);
    if (this.failing) throw new MissingCredentialsError(repository.repoUrl);
    return this.headers;
  }
}
