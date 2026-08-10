export interface AdoPullRequestIdentity {
  readonly displayName: string;
  readonly uniqueName: string;
  readonly imageUrl: string;
  readonly url: string;
}

export interface AdoPullRequestReviewer {
  readonly displayName: string;
  readonly uniqueName: string;
  readonly vote: number;
  readonly imageUrl: string;
  readonly url: string;
}

export interface AdoPullRequestNode {
  readonly pullRequestId: number;
  readonly title: string;
  readonly status: "completed" | "active" | "abandoned";
  readonly creationDate: string;
  readonly closedDate: string | null;
  readonly createdBy: AdoPullRequestIdentity;
  readonly reviewers: AdoPullRequestReviewer[];
  readonly lastMergeSourceCommit: { readonly commitId: string } | null;
  readonly repository: {
    readonly id: string;
    readonly name: string;
    readonly project: { readonly name: string };
  };
}
