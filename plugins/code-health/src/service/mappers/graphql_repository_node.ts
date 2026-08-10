export interface GraphQLRepositoryNode {
  id: string;
  name: string;
  nameWithOwner: string;
  url: string;
  description: string | null;
  visibility: "PUBLIC" | "PRIVATE";
  isArchived: boolean;
  isFork: boolean;
  updatedAt: string;
  primaryLanguage: { name: string } | null;
  defaultBranchRef: {
    name: string;
    target: {
      oid: string;
      messageHeadline: string;
      commitUrl: string;
      statusCheckRollup: { state: string } | null;
    };
  } | null;
  latestRelease: {
    tagName: string;
    name: string;
    publishedAt: string;
    url: string;
    isPrerelease: boolean;
  } | null;
  refs: {
    nodes: { name: string; target: { oid: string } }[];
  };
  branchRefs: {
    nodes: { name: string }[];
  };
}
