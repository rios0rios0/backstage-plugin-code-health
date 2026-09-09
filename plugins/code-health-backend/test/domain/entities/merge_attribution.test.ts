import type { CodeHealthEvent } from "../../../src/domain/entities/code_health_event";
import {
  attributeMergedWork,
  isGitMergeMessage,
  type CollectedBuild,
  type CollectedCommit,
  type MergedPullRequest,
} from "../../../src/domain/entities/merge_attribution";
import { EventBuilder } from "../../builders/event_builder";

const MERGER = "merger@example.com";
const AUTHOR = "author@example.com";

const commitBy = (actor: string, sha: string, isMerge = false): CollectedCommit => ({
  event: EventBuilder.commit()
    .withActor(actor, actor.split("@")[0])
    .withExternalId(sha)
    .withChurn(10, 2, 3)
    .build(),
  isMerge,
});

const buildFor = (actor: string, commitId: string | null): CollectedBuild => ({
  event: EventBuilder.build("succeeded").withActor(actor).build(),
  commitId,
});

const mergedBy = (
  strategy: MergedPullRequest["strategy"],
  mergeCommitId: string | null = "merge-sha",
  authorKey: string | null = AUTHOR,
): MergedPullRequest => ({
  externalId: "42",
  mergeCommitId,
  strategy,
  author: { actorKey: authorKey, actorName: "Author", actorAvatarUrl: "https://avatar/author" },
});

const actorsOf = (events: readonly CodeHealthEvent[]): (string | null)[] =>
  events.map((event) => event.actorKey);

describe("attributeMergedWork", () => {
  describe("commits", () => {
    it("should credit a squash commit to the pull request's author", () => {
      // given
      // Azure DevOps stamps the squash commit with whoever pressed Complete,
      // and the commit carries the whole of the pull request's work.
      const squash = commitBy(MERGER, "merge-sha");

      // when
      const result = attributeMergedWork({
        commits: [squash],
        builds: [],
        pullRequests: [mergedBy("squash")],
      });

      // then
      expect(result.commits).toHaveLength(1);
      expect(result.commits[0]).toMatchObject({
        externalId: "merge-sha",
        actorKey: AUTHOR,
        actorName: "Author",
        actorAvatarUrl: "https://avatar/author",
        // The work itself travels with the commit, whoever it is credited to.
        additions: 10,
        deletions: 2,
        changedFiles: 3,
      });
      // The pull request it came through is recorded, so the credit is traceable.
      expect(result.commits[0]?.payload).toMatchObject({ pullRequestId: "42" });
    });

    it("should drop the merge commit of a pull request merged with one", () => {
      // given
      // Its diff against the first parent is the sum of the commits it joins,
      // so counting it credits the merger with a phantom commit and the
      // author's churn a second time.
      const merge = commitBy(MERGER, "merge-sha");
      const work = commitBy(AUTHOR, "work-sha");

      // when
      const result = attributeMergedWork({
        commits: [merge, work],
        builds: [],
        pullRequests: [mergedBy("merge_commit")],
      });

      // then
      expect(result.commits.map((commit) => commit.externalId)).toEqual(["work-sha"]);
      expect(actorsOf(result.commits)).toEqual([AUTHOR]);
    });

    it("should leave a linear merge's commit with the author it carries", () => {
      // given
      // A rebase keeps every commit's own author, and GitHub's squash already
      // names the pull request's author, so there is nothing to correct.
      const tip = commitBy(AUTHOR, "merge-sha");

      // when
      const result = attributeMergedWork({
        commits: [tip],
        builds: [],
        pullRequests: [mergedBy("linear")],
      });

      // then
      expect(result.commits[0]?.actorKey).toBe(AUTHOR);
      // Nothing was re-attributed, so nothing names a pull request.
      expect(result.commits[0]?.payload).toBeNull();
    });

    it("should drop any other commit the provider marks as a merge commit", () => {
      // given
      // A merge made outside a pull request — `git merge` and a push — has no
      // pull request to decide it, and joins two histories all the same.
      const merge = commitBy(MERGER, "local-merge", true);
      const work = commitBy(AUTHOR, "work-sha");

      // when
      const result = attributeMergedWork({ commits: [merge, work], builds: [], pullRequests: [] });

      // then
      expect(result.commits.map((commit) => commit.externalId)).toEqual(["work-sha"]);
    });

    it("should keep a squash commit under the merger when the pull request names no author", () => {
      // given
      // A deleted account, or a payload without one: the stamp on the commit is
      // still the best evidence there is, and dropping the work would be worse.
      const squash = commitBy(MERGER, "merge-sha");

      // when
      const result = attributeMergedWork({
        commits: [squash],
        builds: [],
        pullRequests: [mergedBy("squash", "merge-sha", null)],
      });

      // then
      expect(actorsOf(result.commits)).toEqual([MERGER]);
    });

    it("should count a commit once when it arrives through the history and the pull request", () => {
      // given
      // The pull request's commits are fetched alongside the branch history,
      // and the same commit routinely arrives through both.
      const viaHistory = commitBy(AUTHOR, "work-sha");
      const viaPullRequest = commitBy(AUTHOR, "work-sha");

      // when
      const result = attributeMergedWork({
        commits: [viaHistory, viaPullRequest],
        builds: [],
        pullRequests: [mergedBy("merge_commit")],
      });

      // then
      expect(result.commits).toHaveLength(1);
    });

    it("should ignore a merged pull request whose merge commit is unknown", () => {
      // given
      const work = commitBy(AUTHOR, "work-sha");

      // when
      const result = attributeMergedWork({
        commits: [work],
        builds: [],
        pullRequests: [mergedBy("squash", null)],
      });

      // then
      expect(actorsOf(result.commits)).toEqual([AUTHOR]);
    });
  });

  describe("builds", () => {
    it("should credit a run to the author of the pull request whose merge it built", () => {
      // given
      // The post-merge run is requested by whoever merged, and it built the
      // author's change.
      const run = buildFor(MERGER, "merge-sha");

      // when
      const result = attributeMergedWork({
        commits: [],
        builds: [run],
        pullRequests: [mergedBy("merge_commit")],
      });

      // then
      expect(result.builds[0]).toMatchObject({ actorKey: AUTHOR, actorName: "Author" });
    });

    it("should credit a run to the author of the commit it built", () => {
      // given
      const run = buildFor(MERGER, "work-sha");

      // when
      const result = attributeMergedWork({
        commits: [commitBy(AUTHOR, "work-sha")],
        builds: [run],
        pullRequests: [],
      });

      // then
      expect(result.builds[0]?.actorKey).toBe(AUTHOR);
    });

    it("should credit a run through the commit's own attribution", () => {
      // given
      // The commit was a squash re-attributed to the pull request's author, and
      // the run that built it follows the commit rather than the stamp.
      const run = buildFor(MERGER, "merge-sha");

      // when
      const result = attributeMergedWork({
        commits: [commitBy(MERGER, "merge-sha")],
        builds: [run],
        pullRequests: [mergedBy("squash")],
      });

      // then
      expect(result.builds[0]?.actorKey).toBe(AUTHOR);
    });

    it("should keep the requester when nothing says what the run built", () => {
      // given
      // A direct push, or a run the provider reported without a commit: the
      // person who pushed is the person who requested, and that is right.
      const run = buildFor(MERGER, null);
      const unknown = buildFor(MERGER, "elsewhere-sha");

      // when
      const result = attributeMergedWork({ commits: [], builds: [run, unknown], pullRequests: [] });

      // then
      expect(actorsOf(result.builds)).toEqual([MERGER, MERGER]);
    });

    it("should keep the requester when the commit it built has no author", () => {
      // given
      const run = buildFor(MERGER, "anon-sha");

      // when
      const result = attributeMergedWork({
        commits: [{ event: EventBuilder.commit().withActor(null).withExternalId("anon-sha").build(), isMerge: false }],
        builds: [run],
        pullRequests: [],
      });

      // then
      expect(result.builds[0]?.actorKey).toBe(MERGER);
    });

    it("should keep the requester when the merged pull request names no author", () => {
      // given
      const run = buildFor(MERGER, "merge-sha");

      // when
      const result = attributeMergedWork({
        commits: [],
        builds: [run],
        pullRequests: [mergedBy("merge_commit", "merge-sha", null)],
      });

      // then
      expect(result.builds[0]?.actorKey).toBe(MERGER);
    });
  });
});

describe("isGitMergeMessage", () => {
  it.each([
    "Merge branch 'main' into feature/thing",
    "Merge remote-tracking branch 'origin/main' into feature/thing",
    "Merge pull request #12 from acme/feature",
    "Merge tag 'v1.2.0' into main",
  ])("should recognise %s", (headline) => {
    // given / when / then
    expect(isGitMergeMessage(headline)).toBe(true);
  });

  it.each([
    "Merged PR 123: add the thing",
    "merge the two config files",
    "Merge sort implementation",
    "",
    null,
    undefined,
  ])("should not mistake %s for a merge commit", (headline) => {
    // given / when / then
    // "Merged PR" is written on a squash commit as well as on a merge commit,
    // so on its own it proves nothing; the pull request decides.
    expect(isGitMergeMessage(headline)).toBe(false);
  });
});
