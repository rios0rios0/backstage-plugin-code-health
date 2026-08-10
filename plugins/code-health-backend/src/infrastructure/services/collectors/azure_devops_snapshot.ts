import type { Tag } from "@rios0rios0/backstage-plugin-code-health-common";
import type { AdoPolicyConfigurationNode, AdoRefNode } from "./azure_devops_node";

/**
 * Azure DevOps policy type identifiers. They are stable GUIDs rather than
 * names, because the display name is localised.
 */
const BUILD_POLICY_TYPE = "0609b952-1397-4640-95ec-e00a01b2c241";

/**
 * Whether a policy applies to the given repository.
 *
 * Policies are configured per *project* and scoped to repositories and
 * branches. A scope entry with a null `repositoryId` applies to every
 * repository in the project, which is how organisation-wide rules are usually
 * expressed.
 */
const appliesTo = (policy: AdoPolicyConfigurationNode, repositoryId: string): boolean => {
  const scopes = policy.settings?.scope;
  if (!scopes || scopes.length === 0) return false;
  return scopes.some(
    (scope) =>
      scope.repositoryId === null ||
      scope.repositoryId === undefined ||
      scope.repositoryId === repositoryId,
  );
};

export interface AdoPolicyFindings {
  readonly buildPolicyOnPRs: boolean;
  readonly buildPolicyExpiration: boolean;
  readonly branchProtection: boolean;
}

/**
 * Reduces a project's policy list to the three checks the dashboard shows.
 *
 * The list is fetched once per project per snapshot pass and evaluated here for
 * each of its repositories. The previous design fetched the identical payload
 * once per repository — forty repositories in a project meant forty downloads
 * of the same thing — which was the single largest source of avoidable Azure
 * DevOps traffic.
 */
export const evaluatePolicies = (
  policies: readonly AdoPolicyConfigurationNode[],
  repositoryId: string,
): AdoPolicyFindings => {
  const relevant = policies.filter(
    (policy) => policy.isEnabled === true && appliesTo(policy, repositoryId),
  );

  const buildPolicies = relevant.filter((policy) => policy.type?.id === BUILD_POLICY_TYPE);

  return {
    buildPolicyOnPRs: buildPolicies.length > 0,
    // A validity duration of zero means the build result never expires, so a
    // stale green build keeps satisfying the policy indefinitely.
    buildPolicyExpiration: buildPolicies.some(
      (policy) => (policy.settings?.validDuration ?? 0) > 0,
    ),
    // Any blocking policy makes the branch protected in the sense the dashboard
    // means: something stands between a push and the default branch.
    branchProtection: relevant.some((policy) => policy.isBlocking === true),
  };
};

const VERSION_PATTERN = /^v?(\d+)\.(\d+)\.(\d+)(?:[.-](.+))?$/;

const asVersion = (name: string): number[] | null => {
  const match = VERSION_PATTERN.exec(name);
  if (!match) return null;
  return [Number(match[1]), Number(match[2]), Number(match[3])];
};

const compareVersions = (left: number[], right: number[]): number => {
  for (let index = 0; index < 3; index += 1) {
    const difference = (left[index] ?? 0) - (right[index] ?? 0);
    if (difference !== 0) return difference;
  }
  return 0;
};

/**
 * Picks the newest tag from a ref listing.
 *
 * Azure DevOps returns refs with no dates at all, so "newest" cannot be
 * answered directly — and taking the first of an alphabetically ordered list,
 * which is what the previous implementation did with `$top=1`, reliably
 * returned the *oldest* version-like tag. Version-shaped names are therefore
 * compared numerically, and anything else falls back to the greatest name.
 * Resolving real dates would need one annotated-tag lookup per tag, which is
 * not worth a request per tag per repository per day.
 */
export const pickLatestTag = (refs: readonly AdoRefNode[]): Tag | null => {
  const tags = refs
    .map((ref) => ({
      name: (ref.name ?? "").replace(/^refs\/tags\//, ""),
      commitSha: ref.peeledObjectId ?? ref.objectId ?? "",
    }))
    .filter((tag) => tag.name !== "");

  if (tags.length === 0) return null;

  const versioned = tags
    .map((tag) => ({ tag, version: asVersion(tag.name) }))
    .filter((entry): entry is { tag: Tag; version: number[] } => entry.version !== null);

  if (versioned.length > 0) {
    return versioned.reduce((newest, entry) =>
      compareVersions(entry.version, newest.version) > 0 ? entry : newest,
    ).tag;
  }

  return tags.reduce((newest, tag) => (tag.name.localeCompare(newest.name) > 0 ? tag : newest));
};
