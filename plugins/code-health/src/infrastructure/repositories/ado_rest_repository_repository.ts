import type { Repository } from "../../domain/entities/repository";
import type { RepositoryRepository } from "../../domain/repositories/repository_repository";
import { mapAdoRepoToRepository } from "../../service/mappers/ado_repository_mapper";
import type { AdoBuildNode, AdoProject, AdoRefNode, AdoRepositoryNode } from "../../service/mappers/ado_repository_node";
import type { AdoRestClient } from "../http/ado_rest_client";

const API_VERSION = "api-version=7.1";
const BATCH_SIZE = 10;

interface AdoListResponse<T> {
  value: T[];
  count: number;
}

const fetchProjects = async (
  client: AdoRestClient,
  token: string,
  org: string,
): Promise<AdoProject[]> => {
  const path = `/${org}/_apis/projects?${API_VERSION}`;
  const response = await client.get<AdoListResponse<AdoProject>>(token, path);
  return response.value;
};

const fetchRepos = async (
  client: AdoRestClient,
  token: string,
  org: string,
  project: string,
): Promise<AdoRepositoryNode[]> => {
  const path = `/${org}/${project}/_apis/git/repositories?${API_VERSION}`;
  const response = await client.get<AdoListResponse<AdoRepositoryNode>>(token, path);
  return response.value;
};

const fetchLatestBuild = async (
  client: AdoRestClient,
  token: string,
  org: string,
  project: string,
  repoId: string,
): Promise<AdoBuildNode | null> => {
  try {
    const path = `/${org}/${project}/_apis/build/builds?repositoryId=${repoId}&repositoryType=TfsGit&$top=1&queryOrder=finishTimeDescending&${API_VERSION}`;
    const response = await client.get<AdoListResponse<AdoBuildNode>>(token, path);
    return response.value[0] ?? null;
  } catch {
    return null;
  }
};

const fetchBranches = async (
  client: AdoRestClient,
  token: string,
  org: string,
  project: string,
  repoId: string,
): Promise<string[]> => {
  try {
    const path = `/${org}/${project}/_apis/git/repositories/${repoId}/refs?filter=heads/&${API_VERSION}`;
    const response = await client.get<AdoListResponse<AdoRefNode>>(token, path);
    return response.value.map((ref) => ref.name.replace("refs/heads/", ""));
  } catch {
    return [];
  }
};

const fetchLatestTag = async (
  client: AdoRestClient,
  token: string,
  org: string,
  project: string,
  repoId: string,
): Promise<AdoRefNode | null> => {
  try {
    const path = `/${org}/${project}/_apis/git/repositories/${repoId}/refs?filter=tags/&$top=1&${API_VERSION}`;
    const response = await client.get<AdoListResponse<AdoRefNode>>(token, path);
    return response.value[0] ?? null;
  } catch {
    return null;
  }
};

const processBatch = async <T, R>(
  items: T[],
  batchSize: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> => {
  const results: R[] = [];
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const batchResults = await Promise.all(batch.map(fn));
    results.push(...batchResults);
  }
  return results;
};

export class AdoRestRepositoryRepository implements RepositoryRepository {
  private readonly client: AdoRestClient;

  constructor(client: AdoRestClient) {
    this.client = client;
  }

  async listAll(token: string, organization: string): Promise<Repository[]> {
    const projects = await fetchProjects(this.client, token, organization);

    const allRepos: AdoRepositoryNode[] = [];
    for (const project of projects) {
      try {
        const repos = await fetchRepos(this.client, token, organization, project.name);
        allRepos.push(...repos);
      } catch {
        // skip projects where repo access fails
      }
    }

    return processBatch(allRepos, BATCH_SIZE, async (repo) => {
      const projectName = repo.project.name;
      const [build, tagRef, branches] = await Promise.all([
        fetchLatestBuild(this.client, token, organization, projectName, repo.id),
        fetchLatestTag(this.client, token, organization, projectName, repo.id),
        fetchBranches(this.client, token, organization, projectName, repo.id),
      ]);
      return mapAdoRepoToRepository(repo, build, tagRef, organization, branches);
    });
  }
}
