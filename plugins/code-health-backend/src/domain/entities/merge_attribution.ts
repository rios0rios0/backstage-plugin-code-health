import type { CodeHealthEvent } from "./code_health_event";

/**
 * Who a provider says did something: the three actor fields every event carries.
 */
export interface EventActor {
  readonly actorKey: string | null;
  readonly actorName: string | null;
  readonly actorAvatarUrl: string | null;
}

/**
 * What the commit a merge produced says about who did the work.
 *
 * - `squash`: the provider collapsed the pull request into one new commit and
 *   stamped its own idea of an author on it — on Azure DevOps that is whoever
 *   pressed *Complete*. The commit carries the whole of the work, so it belongs
 *   to the pull request's author, whatever the stamp says.
 * - `linear`: the pull request's commits landed with their authors intact — a
 *   rebase, or a squash the provider already attributed to the author, as
 *   GitHub does. Nothing needs changing.
 * - `merge_commit`: the provider created a commit with two parents. It carries
 *   no work of its own — its diff against the first parent is the sum of the
 *   commits it joins — so counting it credits the merger with a phantom commit
 *   and the author's entire churn a second time. It is dropped, and the pull
 *   request's own commits are what count.
 */
export type MergeStrategy = "squash" | "linear" | "merge_commit";

/** A pull request that closed by merging, as far as attribution needs to know. */
export interface MergedPullRequest {
  readonly externalId: string;
  /** The commit the merge put on the target branch, or null when unknown. */
  readonly mergeCommitId: string | null;
  readonly strategy: MergeStrategy;
  readonly author: EventActor;
}

/** A commit as the provider reported it, with the one fact attribution needs. */
export interface CollectedCommit {
  readonly event: CodeHealthEvent;
  /** Whether the commit joins two histories rather than adding to one. */
  readonly isMerge: boolean;
}

/** A pipeline run, with the commit it built when the provider says. */
export interface CollectedBuild {
  readonly event: CodeHealthEvent;
  readonly commitId: string | null;
}

export interface AttributedWork {
  readonly commits: CodeHealthEvent[];
  readonly builds: CodeHealthEvent[];
}

/**
 * Whether a commit message is one git or a provider writes on a merge commit.
 *
 * Only for a provider that reports no parent count anywhere in its list
 * endpoints — Azure DevOps — and only over the forms git and Azure DevOps
 * generate themselves. A person is free to type "Merge branch" as a subject,
 * but nobody does, and the alternative is one request per commit to learn what
 * the message already says.
 *
 * Azure DevOps' own "Merged PR 123: …" is deliberately absent: it is written on
 * a squash commit as well as on a merge commit, so it proves nothing on its
 * own. The pull request that produced it is what decides, through
 * {@link MergedPullRequest.strategy}.
 */
export const isGitMergeMessage = (headline: string | null | undefined): boolean =>
  /^Merge (branch|remote-tracking branch|pull request|tag) /u.test(headline ?? "");

const actorOf = (event: CodeHealthEvent): EventActor => ({
  actorKey: event.actorKey,
  actorName: event.actorName,
  actorAvatarUrl: event.actorAvatarUrl,
});

const withActor = (event: CodeHealthEvent, actor: EventActor): CodeHealthEvent => ({
  ...event,
  actorKey: actor.actorKey,
  actorName: actor.actorName,
  actorAvatarUrl: actor.actorAvatarUrl,
});

/**
 * Credits merged work to the person who did it rather than to whoever merged it.
 *
 * Both providers stamp the commit a merge produces with the merger, and both
 * report the pipeline run that commit triggered as requested by the merger.
 * Taken at face value that puts every squash commit, every merge commit and
 * every post-merge build on the row of whoever presses the button — which on a
 * team where one or two people complete most pull requests makes them look
 * like the authors of everything.
 *
 * The rules, in the order they are applied to each commit:
 *
 * 1. A commit that a merged pull request names as its merge commit is decided
 *    by that pull request's {@link MergeStrategy}: re-attributed to the pull
 *    request's author for a squash, left alone for a linear merge, dropped for
 *    a merge commit.
 * 2. Any other commit the provider marks as a merge commit is dropped.
 * 3. Everything else keeps the author the provider reported.
 *
 * A build is credited to the author of the pull request whose merge produced
 * the commit it built, else to the author of that commit as decided above, else
 * to whoever the provider says requested it — which for a direct push or a pull
 * request build is the person who pushed, and so is right anyway.
 *
 * Commits are deduplicated by identifier, first occurrence wins: a pull
 * request's own commits are collected alongside the branch history, and the
 * same commit routinely arrives through both.
 */
export const attributeMergedWork = (input: {
  readonly commits: readonly CollectedCommit[];
  readonly builds: readonly CollectedBuild[];
  readonly pullRequests: readonly MergedPullRequest[];
}): AttributedWork => {
  const byMergeCommit = new Map<string, MergedPullRequest>();
  for (const pullRequest of input.pullRequests) {
    if (pullRequest.mergeCommitId !== null) {
      byMergeCommit.set(pullRequest.mergeCommitId, pullRequest);
    }
  }

  const commits = new Map<string, CodeHealthEvent>();
  for (const { event, isMerge } of input.commits) {
    if (commits.has(event.externalId)) continue;

    const pullRequest = byMergeCommit.get(event.externalId);
    if (pullRequest === undefined) {
      if (!isMerge) commits.set(event.externalId, event);
      continue;
    }

    if (pullRequest.strategy === "merge_commit") continue;
    if (pullRequest.strategy === "linear" || pullRequest.author.actorKey === null) {
      commits.set(event.externalId, event);
      continue;
    }

    commits.set(event.externalId, {
      ...withActor(event, pullRequest.author),
      payload: { ...(event.payload ?? {}), pullRequestId: pullRequest.externalId },
    });
  }

  const builds = input.builds.map(({ event, commitId }) => {
    if (commitId === null) return event;

    const pullRequest = byMergeCommit.get(commitId);
    if (pullRequest !== undefined && pullRequest.author.actorKey !== null) {
      return withActor(event, pullRequest.author);
    }

    const commit = commits.get(commitId);
    if (commit !== undefined && commit.actorKey !== null) {
      return withActor(event, actorOf(commit));
    }

    return event;
  });

  return { commits: [...commits.values()], builds };
};
