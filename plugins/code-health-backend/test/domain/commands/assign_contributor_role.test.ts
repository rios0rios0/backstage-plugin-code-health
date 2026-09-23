import {
  AssignContributorRole,
  MalformedPersonKeyError,
} from "../../../src/domain/commands/assign_contributor_role";
import { GetContributorTrend } from "../../../src/domain/commands/get_contributor_trend";
import {
  NotAUserReferenceError,
  UnknownIdentityError,
  UnknownUserError,
} from "../../../src/domain/commands/link_identity";
import { ListContributorSummaries } from "../../../src/domain/commands/list_contributor_summaries";
import { DiscoveredRepositoryBuilder } from "../../builders/discovered_repository_builder";
import { EventBuilder } from "../../builders/event_builder";
import { InMemoryCodeHealthStore } from "../../doubles/in_memory_code_health_store";
import { StubDirectoryReader } from "../../doubles/stub_directory_reader";

const NOW = new Date("2026-08-10T12:00:00.000Z");
const WINDOW = {
  from: new Date("2026-08-05T00:00:00.000Z"),
  to: new Date("2026-08-09T00:00:00.000Z"),
};

const seed = async (
  identities: Array<{ source: "vcs" | "wakatime" | "jira" | "confluence"; sourceKey: string }>,
) => {
  const store = new InMemoryCodeHealthStore();
  await store.recordObservedIdentities({
    identities: identities.map((identity) => ({
      source: identity.source,
      sourceKey: identity.sourceKey,
      displayName: null,
      email: null,
      avatarUrl: null,
      profileUrl: null,
    })),
    now: NOW,
  });
  return store;
};

/** The one catalog user the tests below can attach a role to. */
const directory = () =>
  new StubDirectoryReader([
    {
      entityRef: "user:default/jdoe",
      displayName: "J Doe",
      email: "jdoe@example.com",
      picture: null,
    },
  ]);

const commit = (repositoryId: string, at: string, actor: string) =>
  EventBuilder.commit().withRepository(repositoryId).withActor(actor).at(at).withChurn(10, 2, 1).build();

describe("AssignContributorRole", () => {
  it("should record the role under an observed account's key", async () => {
    // given
    const store = await seed([{ source: "vcs", sourceKey: "dev@example.com" }]);

    // when
    await new AssignContributorRole(store, directory()).assign({
      key: "vcs:dev@example.com",
      role: "lead",
      assignedBy: "user:default/admin",
      now: NOW,
    });

    // then
    expect(await store.listContributorRoles()).toEqual([
      {
        personKey: "vcs:dev@example.com",
        role: "lead",
        assignedBy: "user:default/admin",
        assignedAt: NOW,
      },
    ]);
  });

  it("should normalise the account's key, so a differently cased one is the same account", async () => {
    // given
    // Every account key is stored trimmed and lowercased; a role under the
    // spelling somebody typed would sit on a key no row carries.
    const store = await seed([{ source: "vcs", sourceKey: "dev@example.com" }]);

    // when
    await new AssignContributorRole(store, directory()).assign({
      key: "vcs:Dev@Example.COM",
      role: "lead",
      assignedBy: null,
      now: NOW,
    });

    // then
    expect((await store.listContributorRoles())[0]?.personKey).toBe("vcs:dev@example.com");
  });

  it("should record the role under the catalog's own reference for a linked person", async () => {
    // given
    // The catalog resolves `user:default/JDoe`; the row is keyed by what the
    // catalog calls the entity, so that is what has to be stored.
    const store = await seed([]);

    // when
    await new AssignContributorRole(store, directory()).assign({
      key: "user:default/JDoe",
      role: "lead",
      assignedBy: "user:default/admin",
      now: NOW,
    });

    // then
    expect((await store.listContributorRoles())[0]?.personKey).toBe("user:default/jdoe");
  });

  it("should refuse an account nobody has observed", async () => {
    // given
    // A role on a key nothing carries changes no row, and the administrator
    // would have no way to tell it did not take.
    const store = await seed([]);

    // when / then
    await expect(
      new AssignContributorRole(store, directory()).assign({
        key: "vcs:ghost@example.com",
        role: "lead",
        assignedBy: null,
        now: NOW,
      }),
    ).rejects.toBeInstanceOf(UnknownIdentityError);
    expect(await store.listContributorRoles()).toEqual([]);
  });

  it("should refuse a user the catalog does not hold", async () => {
    // given
    const store = await seed([]);

    // when / then
    await expect(
      new AssignContributorRole(store, directory()).assign({
        key: "user:default/nobody",
        role: "lead",
        assignedBy: null,
        now: NOW,
      }),
    ).rejects.toBeInstanceOf(UnknownUserError);
  });

  it("should refuse a reference that names something other than a user", async () => {
    // given
    // A group parses as a reference, and a role on a group would be a row
    // nobody carries.
    const store = await seed([]);

    // when / then
    await expect(
      new AssignContributorRole(store, directory()).assign({
        key: "group:default/platform",
        role: "lead",
        assignedBy: null,
        now: NOW,
      }),
    ).rejects.toBeInstanceOf(NotAUserReferenceError);
  });

  it("should refuse a key that is neither an account nor a reference", async () => {
    // given
    const store = await seed([]);

    // when / then
    await expect(
      new AssignContributorRole(store, directory()).assign({
        key: "bogus",
        role: "lead",
        assignedBy: null,
        now: NOW,
      }),
    ).rejects.toBeInstanceOf(MalformedPersonKeyError);
  });

  it("should replace the role when the same person is assigned again", async () => {
    // given
    // One answer per person: the second statement is a correction to the
    // first rather than a second role.
    const store = await seed([{ source: "vcs", sourceKey: "dev@example.com" }]);
    const command = new AssignContributorRole(store, directory());
    await command.assign({
      key: "vcs:dev@example.com",
      role: "lead",
      assignedBy: "user:default/admin",
      now: new Date("2026-07-01T00:00:00.000Z"),
    });

    // when
    await command.assign({
      key: "vcs:dev@example.com",
      role: "engineer",
      assignedBy: "user:default/other",
      now: NOW,
    });

    // then
    const stored = await store.listContributorRoles();
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({ role: "engineer", assignedBy: "user:default/other" });
  });

  it("should change what every read scores the person as", async () => {
    // given
    // The role is applied when a row is built, so the table and the trend
    // read the new weights on the next request over every window collected.
    const store = await seed([
      { source: "vcs", sourceKey: "dev@example.com" },
      { source: "vcs", sourceKey: "other@example.com" },
    ]);
    const repository = DiscoveredRepositoryBuilder.create().build();
    await store.syncRepositories({ discovered: [repository], retentionDays: 365, now: NOW });
    await store.commitIngestion({
      repositoryId: repository.id,
      events: [
        commit(repository.id, "2026-08-06T10:00:00.000Z", "dev@example.com"),
        commit(repository.id, "2026-08-07T10:00:00.000Z", "other@example.com"),
      ],
      chunk: { repositoryId: repository.id, kinds: ["commit"], days: [], ingestedAt: NOW },
      status: "active",
      now: NOW,
    });

    // when
    await new AssignContributorRole(store, directory()).assign({
      key: "vcs:dev@example.com",
      role: "lead",
      assignedBy: null,
      now: NOW,
    });

    // then
    const rows = await new ListContributorSummaries({ store }).run(WINDOW);
    expect(rows.find((row) => row.key === "vcs:dev@example.com")?.role).toBe("lead");
    expect(rows.find((row) => row.key === "vcs:other@example.com")?.role).toBe("engineer");

    const trend = await new GetContributorTrend({ store }).run({
      key: "vcs:dev@example.com",
      ...WINDOW,
      bucket: "day",
    });
    expect(trend.summary?.role).toBe("lead");
    // Forty percent of a base install's score on reviews: the lead's reading,
    // not the engineer's fifteen.
    expect(
      trend.score?.components.find((component) => component.id === "reviewsGiven")?.weight,
    ).toBeCloseTo(0.4, 10);
  });
});
