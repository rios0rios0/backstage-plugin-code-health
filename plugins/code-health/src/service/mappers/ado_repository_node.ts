export interface AdoProject {
  readonly id: string;
  readonly name: string;
  readonly description: string | null;
  readonly url: string;
  readonly visibility: "private" | "public";
  readonly state: string;
}

export interface AdoRepositoryNode {
  readonly id: string;
  readonly name: string;
  readonly url: string;
  readonly webUrl: string;
  readonly project: AdoProject;
  readonly defaultBranch: string | null;
  readonly isFork: boolean;
  readonly isDisabled: boolean;
  readonly size: number;
}

export interface AdoBuildNode {
  readonly id: number;
  readonly buildNumber: string;
  readonly status: "completed" | "inProgress" | "cancelling" | "postponed" | "notStarted" | "none";
  readonly result:
    | "succeeded"
    | "partiallySucceeded"
    | "failed"
    | "canceled"
    | "none"
    | null;
  readonly finishTime: string | null;
  readonly sourceVersion: string;
  readonly sourceBranch: string;
  readonly definition: { readonly name: string };
  readonly _links: { readonly web: { readonly href: string } };
}

export interface AdoRefNode {
  readonly name: string;
  readonly objectId: string;
  readonly peeledObjectId: string | null;
}
