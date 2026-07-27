import type { Contributor } from "../../domain/entities/contributor";
import type { ContributorRepository } from "../../domain/repositories/contributor_repository";
import type { GraphQLPullRequestNode } from "../../service/mappers/graphql_contributor_node";
import { mapPullRequestsToContributors } from "../../service/mappers/graphql_contributor_mapper";
import type { GraphQLClient } from "../http/graphql_client";

const buildDateFilter = (dateFrom: string | null, dateTo: string | null): string => {
  if (!dateFrom && !dateTo) return "";
  const parts: string[] = [];
  if (dateFrom) parts.push(`created:>=${dateFrom}`);
  if (dateTo) parts.push(`created:<=${dateTo}`);
  return parts.join(" ");
};

const CONTRIBUTOR_QUERY = `
query ContributorData($searchQuery: String!, $cursor: String) {
  search(query: $searchQuery, type: ISSUE, first: 100, after: $cursor) {
    pageInfo {
      hasNextPage
      endCursor
    }
    nodes {
      ... on PullRequest {
        number
        title
        state
        createdAt
        mergedAt
        additions
        deletions
        author {
          login
          avatarUrl
          url
        }
        reviews(first: 10) {
          nodes {
            state
          }
        }
        commits(last: 1) {
          nodes {
            commit {
              statusCheckRollup {
                state
                contexts(first: 0) {
                  totalCount
                }
              }
            }
          }
        }
      }
    }
  }
}
`;

interface SearchQueryResponse {
  search: {
    pageInfo: { hasNextPage: boolean; endCursor: string | null };
    nodes: GraphQLPullRequestNode[];
  };
}

export class GitHubGraphQLContributorRepository implements ContributorRepository {
  private readonly client: GraphQLClient;

  constructor(client: GraphQLClient) {
    this.client = client;
  }

  async listContributors(
    token: string,
    username: string,
    dateFrom: string | null,
    dateTo: string | null,
  ): Promise<Contributor[]> {
    const allPRs: GraphQLPullRequestNode[] = [];
    let cursor: string | null = null;

    const dateFilter = buildDateFilter(dateFrom, dateTo);
    const searchQuery = `type:pr user:${username} ${dateFilter}`.trim();

    for (;;) {
      const response: SearchQueryResponse = await this.client.request<SearchQueryResponse>(
        token,
        CONTRIBUTOR_QUERY,
        { searchQuery, cursor },
      );

      const { search } = response;
      allPRs.push(...search.nodes);

      if (!search.pageInfo.hasNextPage) break;
      cursor = search.pageInfo.endCursor;
    }

    return mapPullRequestsToContributors(allPRs);
  }
}
