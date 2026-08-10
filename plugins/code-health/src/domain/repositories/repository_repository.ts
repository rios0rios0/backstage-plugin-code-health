import type { Repository } from "../entities/repository";

export interface RepositoryRepository {
  listAll(token: string, username: string): Promise<Repository[]>;
}
