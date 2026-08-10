import type { Repository } from "../../src/domain/entities/repository";
import type { RepositoryRepository } from "../../src/domain/repositories/repository_repository";

export class StubRepositoryRepository implements RepositoryRepository {
  private result: Repository[] = [];
  private error: Error | null = null;

  withRepositories(repos: Repository[]): this {
    this.result = repos;
    return this;
  }

  withError(error: Error): this {
    this.error = error;
    return this;
  }

  async listAll(_token: string, _username: string): Promise<Repository[]> {
    if (this.error) throw this.error;
    return this.result;
  }
}
