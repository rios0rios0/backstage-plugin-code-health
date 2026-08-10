import type { Repository } from "../../domain/entities/repository";
import type { RepositoryRepository } from "../../domain/repositories/repository_repository";
import type { GraphQLRepositoryNode } from "../../service/mappers/graphql_repository_node";
import type { GraphQLClient } from "../http/graphql_client";
import { mapGraphQLNodeToRepository } from "../../service/mappers/graphql_repository_mapper";

const DASHBOARD_QUERY = `
query DashboardData($username: String!, $cursor: String) {
  user(login: $username) {
    repositories(
      first: 100
      after: $cursor
      ownerAffiliations: OWNER
      orderBy: { field: UPDATED_AT, direction: DESC }
    ) {
      pageInfo {
        hasNextPage
        endCursor
      }
      nodes {
        id
        name
        nameWithOwner
        url
        description
        visibility
        isArchived
        isFork
        updatedAt
        primaryLanguage {
          name
        }
        defaultBranchRef {
          name
          target {
            ... on Commit {
              oid
              messageHeadline
              commitUrl
              statusCheckRollup {
                state
              }
            }
          }
        }
        latestRelease {
          tagName
          name
          publishedAt
          url
          isPrerelease
        }
        refs(refPrefix: "refs/tags/", first: 1, orderBy: { field: TAG_COMMIT_DATE, direction: DESC }) {
          nodes {
            name
            target {
              oid
            }
          }
        }
        branchRefs: refs(refPrefix: "refs/heads/", first: 100) {
          nodes {
            name
          }
        }
      }
    }
  }
}
`;

interface DashboardQueryResponse {
  user: {
    repositories: {
      pageInfo: { hasNextPage: boolean; endCursor: string | null };
      nodes: GraphQLRepositoryNode[];
    };
  };
}

export class GitHubGraphQLRepositoryRepository implements RepositoryRepository {
  private readonly client: GraphQLClient;

  constructor(client: GraphQLClient) {
    this.client = client;
  }

  async listAll(token: string, username: string): Promise<Repository[]> {
    const allRepos: Repository[] = [];
    let cursor: string | null = null;

    for (;;) {
      const response: DashboardQueryResponse = await this.client.request<DashboardQueryResponse>(
        token,
        DASHBOARD_QUERY,
        { username, cursor },
      );

      const repositories = response.user.repositories;
      const mapped = repositories.nodes.map(mapGraphQLNodeToRepository);
      allRepos.push(...mapped);

      if (!repositories.pageInfo.hasNextPage) break;
      cursor = repositories.pageInfo.endCursor;
    }

    return allRepos;
  }
}
