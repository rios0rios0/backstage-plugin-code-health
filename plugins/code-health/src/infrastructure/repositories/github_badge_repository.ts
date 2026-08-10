import type { BadgeStatus } from "@rios0rios0/backstage-plugin-code-health-common";
import { parseBadgesFromReadme } from "@rios0rios0/backstage-plugin-code-health-common";
import type { BadgeRepository } from "../../domain/repositories/badge_repository";
import type { GraphQLClient } from "../http/graphql_client";

const BADGE_QUERY = `
query BadgeCheck($owner: String!, $name: String!) {
  repository(owner: $owner, name: $name) {
    object(expression: "HEAD:README.md") {
      ... on Blob { text }
    }
  }
}
`;

interface BadgeQueryResponse {
  repository: {
    object: { text: string } | null;
  };
}

export class GitHubBadgeRepository implements BadgeRepository {
  private readonly client: GraphQLClient;

  constructor(client: GraphQLClient) {
    this.client = client;
  }

  async getBadgeStatus(
    token: string,
    owner: string,
    repoName: string,
  ): Promise<BadgeStatus | null> {
    try {
      const data = await this.client.request<BadgeQueryResponse>(token, BADGE_QUERY, {
        owner,
        name: repoName,
      });

      const readmeContent = data.repository.object?.text ?? "";
      return parseBadgesFromReadme(readmeContent);
    } catch {
      return null;
    }
  }
}
