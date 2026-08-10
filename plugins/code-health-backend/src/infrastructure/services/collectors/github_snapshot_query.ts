/**
 * Everything the dashboard shows about a GitHub repository's current state, in
 * one document.
 *
 * The previous design spent three separate requests per repository *per
 * dashboard load* on this — one for the repository, one for compliance, one to
 * download the whole README for badge detection. Asking for all of it in a
 * single query, once a day, org-wide, is the same information for a tiny
 * fraction of the traffic.
 */
export const SNAPSHOT_QUERY = `
query CodeHealthSnapshot($owner: String!, $name: String!) {
  rateLimit { limit remaining resetAt cost }
  repository(owner: $owner, name: $name) {
    databaseId
    description
    isArchived
    isFork
    isPrivate
    updatedAt
    primaryLanguage { name }
    defaultBranchRef {
      name
      target {
        ... on Commit {
          oid
          messageHeadline
          url
          statusCheckRollup { state }
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
    tags: refs(refPrefix: "refs/tags/", first: 1, orderBy: { field: TAG_COMMIT_DATE, direction: DESC }) {
      nodes { name target { oid } }
    }
    branches: refs(refPrefix: "refs/heads/", first: 100) {
      nodes { name }
    }
    branchProtectionRules(first: 1) { totalCount }
    rulesets(first: 1) { totalCount }
    readme: object(expression: "HEAD:README.md") { ... on Blob { text } }
    workflows: object(expression: "HEAD:.github/workflows") {
      ... on Tree { entries { name type } }
    }
  }
}`;

export interface GithubSnapshotResponse {
  readonly data?: {
    readonly rateLimit?: {
      readonly limit?: number;
      readonly remaining?: number;
      readonly resetAt?: string;
    };
    readonly repository?: {
      readonly databaseId?: number;
      readonly description?: string | null;
      readonly isArchived?: boolean;
      readonly isFork?: boolean;
      readonly isPrivate?: boolean;
      readonly updatedAt?: string;
      readonly primaryLanguage?: { readonly name?: string } | null;
      readonly defaultBranchRef?: {
        readonly name?: string;
        readonly target?: {
          readonly oid?: string;
          readonly messageHeadline?: string;
          readonly url?: string;
          readonly statusCheckRollup?: { readonly state?: string } | null;
        } | null;
      } | null;
      readonly latestRelease?: {
        readonly tagName?: string;
        readonly name?: string | null;
        readonly publishedAt?: string;
        readonly url?: string;
        readonly isPrerelease?: boolean;
      } | null;
      readonly tags?: {
        readonly nodes?: readonly ({ readonly name?: string; readonly target?: { readonly oid?: string } } | null)[];
      };
      readonly branches?: {
        readonly nodes?: readonly ({ readonly name?: string } | null)[];
      };
      readonly branchProtectionRules?: { readonly totalCount?: number };
      readonly rulesets?: { readonly totalCount?: number };
      readonly readme?: { readonly text?: string } | null;
      readonly workflows?: {
        readonly entries?: readonly { readonly name?: string; readonly type?: string }[];
      } | null;
    } | null;
  };
  readonly errors?: readonly { readonly message?: string }[];
}
