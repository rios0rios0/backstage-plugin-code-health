/**
 * Shapes of the Azure DevOps REST responses this plugin reads, narrowed to the
 * fields it uses. Every field is optional because the API omits rather than
 * nulls, and a payload that changes shape must degrade to a missing value
 * instead of throwing mid-window.
 */

export interface AdoIdentityNode {
  readonly displayName?: string;
  readonly uniqueName?: string;
  readonly email?: string;
  readonly imageUrl?: string;
  readonly id?: string;
}

export interface AdoCommitNode {
  readonly commitId?: string;
  readonly comment?: string;
  readonly remoteUrl?: string;
  readonly author?: AdoIdentityNode & { readonly date?: string };
  readonly committer?: AdoIdentityNode & { readonly date?: string };
  readonly changeCounts?: {
    readonly Add?: number;
    readonly Edit?: number;
    readonly Delete?: number;
  };
}

export interface AdoReviewerNode {
  readonly id?: string;
  readonly displayName?: string;
  readonly uniqueName?: string;
  readonly imageUrl?: string;
  readonly vote?: number;
  readonly isContainer?: boolean;
}

export interface AdoPullRequestNode {
  readonly pullRequestId?: number;
  readonly title?: string;
  readonly status?: string;
  readonly creationDate?: string;
  readonly closedDate?: string;
  readonly mergeStatus?: string;
  readonly createdBy?: AdoIdentityNode;
  readonly reviewers?: readonly AdoReviewerNode[];
  readonly repository?: { readonly id?: string; readonly name?: string };
}

export interface AdoBuildNode {
  readonly id?: number;
  readonly buildNumber?: string;
  readonly status?: string;
  readonly result?: string;
  readonly queueTime?: string;
  readonly startTime?: string;
  readonly finishTime?: string;
  readonly sourceBranch?: string;
  readonly requestedFor?: AdoIdentityNode;
  readonly definition?: { readonly id?: number; readonly name?: string };
}

export interface AdoRepositoryNode {
  readonly id?: string;
  readonly name?: string;
  readonly defaultBranch?: string;
  readonly isDisabled?: boolean;
  readonly webUrl?: string;
  readonly project?: { readonly id?: string; readonly name?: string };
}

export interface AdoListResponse<T> {
  readonly count?: number;
  readonly value?: readonly T[];
}

export interface AdoPolicyConfigurationNode {
  readonly isEnabled?: boolean;
  readonly isBlocking?: boolean;
  readonly type?: { readonly id?: string; readonly displayName?: string };
  readonly settings?: {
    readonly validDuration?: number;
    readonly buildDefinitionId?: number;
    readonly scope?: readonly {
      readonly repositoryId?: string | null;
      readonly refName?: string;
      readonly matchKind?: string;
    }[];
  };
}

export interface AdoBuildDefinitionNode {
  readonly id?: number;
  readonly name?: string;
  readonly path?: string;
  readonly queueStatus?: string;
}

export interface AdoRefNode {
  readonly name?: string;
  readonly objectId?: string;
  readonly peeledObjectId?: string;
}

export interface AdoItemNode {
  readonly path?: string;
  readonly content?: string;
}
