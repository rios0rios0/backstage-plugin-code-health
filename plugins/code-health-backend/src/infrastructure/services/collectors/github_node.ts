/**
 * Shapes of the GitHub GraphQL and REST responses this plugin reads, narrowed
 * to the fields it uses.
 */

export interface GithubRateLimitNode {
  readonly cost?: number;
  readonly limit?: number;
  readonly remaining?: number;
  readonly resetAt?: string;
}

export interface GithubActorNode {
  readonly login?: string;
  readonly avatarUrl?: string;
  readonly url?: string;
}

export interface GithubCommitNode {
  readonly oid?: string;
  readonly messageHeadline?: string;
  readonly committedDate?: string;
  readonly additions?: number;
  readonly deletions?: number;
  readonly changedFilesIfAvailable?: number;
  readonly url?: string;
  readonly author?: {
    readonly name?: string;
    readonly email?: string;
    readonly avatarUrl?: string;
    readonly user?: GithubActorNode;
  };
}

export interface GithubPageInfo {
  readonly hasNextPage?: boolean;
  readonly endCursor?: string | null;
}

export interface GithubReviewNode {
  readonly id?: string;
  readonly state?: string;
  readonly submittedAt?: string;
  readonly author?: GithubActorNode;
}

export interface GithubPullRequestNode {
  readonly number?: number;
  readonly title?: string;
  readonly state?: string;
  readonly createdAt?: string;
  readonly closedAt?: string;
  readonly mergedAt?: string;
  readonly author?: GithubActorNode;
  readonly reviews?: { readonly nodes?: readonly (GithubReviewNode | null)[] };
}

export interface GithubHistoryResponse {
  readonly data?: {
    readonly rateLimit?: GithubRateLimitNode;
    readonly repository?: {
      readonly isArchived?: boolean;
      readonly databaseId?: number;
      readonly defaultBranchRef?: {
        readonly name?: string;
        readonly target?: {
          readonly history?: {
            readonly pageInfo?: GithubPageInfo;
            readonly nodes?: readonly (GithubCommitNode | null)[];
          };
        };
      };
    };
  };
  readonly errors?: readonly { readonly message?: string }[];
}

export interface GithubSearchResponse {
  readonly data?: {
    readonly rateLimit?: GithubRateLimitNode;
    readonly search?: {
      readonly pageInfo?: GithubPageInfo;
      readonly nodes?: readonly (GithubPullRequestNode | null)[];
    };
  };
  readonly errors?: readonly { readonly message?: string }[];
}

export interface GithubWorkflowRunNode {
  readonly id?: number;
  readonly name?: string;
  readonly head_branch?: string;
  readonly status?: string;
  readonly conclusion?: string;
  readonly run_started_at?: string;
  readonly created_at?: string;
  readonly updated_at?: string;
  readonly html_url?: string;
  readonly actor?: { readonly login?: string; readonly avatar_url?: string };
}

export interface GithubWorkflowRunsResponse {
  readonly total_count?: number;
  readonly workflow_runs?: readonly GithubWorkflowRunNode[];
}
