import type {
  BackstageCredentials,
  PermissionsService,
  UserInfoService,
} from "@backstage/backend-plugin-api";
import { AuthorizeResult } from "@backstage/plugin-permission-common";
import { AuthorizeAdministrator } from "../../../src/domain/commands/authorize_administrator";
import { ResetIngestion } from "../../../src/domain/commands/reset_ingestion";
import { DiscoveredRepositoryBuilder } from "../../builders/discovered_repository_builder";
import { EventBuilder } from "../../builders/event_builder";
import { InMemoryCodeHealthStore } from "../../doubles/in_memory_code_health_store";
import { RecordingLogger } from "../../doubles/recording_logger";

const NOW = new Date("2026-08-10T12:00:00.000Z");

/** Stands in for whatever the transport handed the router. */
const someCredentials = (): BackstageCredentials =>
  ({ $$type: "@backstage/BackstageCredentials", principal: {} }) as BackstageCredentials;

/**
 * Answers with the ownership references a signed-in person would carry, or
 * refuses the way the real service refuses a service principal.
 */
const userInfoFor = (ownershipEntityRefs: readonly string[] | null): UserInfoService => ({
  getUserInfo: async () => {
    if (ownershipEntityRefs === null) {
      throw new Error("User info not available for principal type 'service'");
    }
    return {
      userEntityRef: ownershipEntityRefs[0] ?? "user:default/nobody",
      ownershipEntityRefs: [...ownershipEntityRefs],
    };
  },
});

/** A permission framework that always answers the same way. */
const permissionsAnswering = (result: AuthorizeResult): PermissionsService =>
  ({
    authorize: async (requests: readonly unknown[]) =>
      requests.map((request) => ({ ...(request as object), result })),
    authorizeConditional: async (requests: readonly unknown[]) =>
      requests.map((request) => ({ ...(request as object), result })),
  }) as unknown as PermissionsService;

describe("AuthorizeAdministrator", () => {
  it("should allow a caller the list names directly", async () => {
    // given
    const command = new AuthorizeAdministrator({
      userInfo: userInfoFor(["user:default/jane"]),
      permissions: permissionsAnswering(AuthorizeResult.ALLOW),
      administrators: ["user:default/jane"],
    });

    // when
    const allowed = await command.isAdministrator(someCredentials());

    // then
    expect(allowed).toBe(true);
  });

  it("should allow a caller through a group the list names", async () => {
    // given
    // `ownershipEntityRefs` already carries every group somebody owns things
    // as, so naming a team works without this walking the catalog itself.
    const command = new AuthorizeAdministrator({
      userInfo: userInfoFor(["user:default/jane", "group:default/platform"]),
      permissions: permissionsAnswering(AuthorizeResult.ALLOW),
      administrators: ["group:default/platform"],
    });

    // when
    const allowed = await command.isAdministrator(someCredentials());

    // then
    expect(allowed).toBe(true);
  });

  it("should compare references with their kind and namespace folded", async () => {
    // given
    // The catalog folds both, and a comparison that did not would treat two
    // spellings of one group as two groups.
    const command = new AuthorizeAdministrator({
      userInfo: userInfoFor(["Group:Default/platform"]),
      permissions: permissionsAnswering(AuthorizeResult.ALLOW),
      administrators: ["group:default/platform"],
    });

    // when
    const allowed = await command.isAdministrator(someCredentials());

    // then
    expect(allowed).toBe(true);
  });

  it("should refuse a caller the list does not name", async () => {
    // given
    const command = new AuthorizeAdministrator({
      userInfo: userInfoFor(["user:default/mallory"]),
      permissions: permissionsAnswering(AuthorizeResult.ALLOW),
      administrators: ["user:default/jane"],
    });

    // when
    const allowed = await command.isAdministrator(someCredentials());

    // then
    expect(allowed).toBe(false);
  });

  it("should refuse everybody when no administrator is configured", async () => {
    // given
    // A stock Backstage policy allows everything, so this list is what makes
    // the restriction real — and an install that acquires the route by
    // upgrading must not acquire an administrator with it.
    const command = new AuthorizeAdministrator({
      userInfo: userInfoFor(["user:default/jane"]),
      permissions: permissionsAnswering(AuthorizeResult.ALLOW),
      administrators: [],
    });

    // when
    const allowed = await command.isAdministrator(someCredentials());

    // then
    expect(allowed).toBe(false);
  });

  it("should refuse a listed caller the permission framework denies", async () => {
    // given
    // The permission only ever narrows: an installed policy, or the RBAC
    // plugin, refuses the reset by name even for somebody on the list.
    const command = new AuthorizeAdministrator({
      userInfo: userInfoFor(["user:default/jane"]),
      permissions: permissionsAnswering(AuthorizeResult.DENY),
      administrators: ["user:default/jane"],
    });

    // when
    const allowed = await command.isAdministrator(someCredentials());

    // then
    expect(allowed).toBe(false);
  });

  it("should refuse a service principal", async () => {
    // given
    // The point of the route is that a person chose to pay for the re-walk, and
    // a token cannot choose. `getUserInfo` throws for anything but a user,
    // which is an answer rather than a failure.
    const command = new AuthorizeAdministrator({
      userInfo: userInfoFor(null),
      permissions: permissionsAnswering(AuthorizeResult.ALLOW),
      administrators: ["user:default/jane"],
    });

    // when
    const allowed = await command.isAdministrator(someCredentials());

    // then
    expect(allowed).toBe(false);
  });
});

describe("ResetIngestion", () => {
  const seed = async () => {
    const store = new InMemoryCodeHealthStore();
    const repository = DiscoveredRepositoryBuilder.create().build();
    await store.syncRepositories({
      discovered: [repository],
      retentionDays: 365,
      now: NOW,
    });
    await store.commitIngestion({
      repositoryId: repository.id,
      events: [
        EventBuilder.commit().withRepository(repository.id).at("2026-08-09T10:00:00.000Z").build(),
        EventBuilder.release().withRepository(repository.id).at("2026-08-09T11:00:00.000Z").build(),
      ],
      chunk: {
        repositoryId: repository.id,
        kinds: ["commit"],
        days: ["2026-08-09"],
        ingestedAt: NOW,
      },
      backfillCursor: "2026-05-01",
      status: "active",
      now: NOW,
    });
    return { store, repository };
  };

  it("should send every tracked repository back to the requested reach", async () => {
    // given
    const { store } = await seed();

    // when
    const result = await new ResetIngestion({ store }).run({ days: 30, now: NOW });

    // then
    expect(result.repositories).toBe(1);
    const [tracked] = await store.listTrackedRepositories();
    expect(tracked.state.backfillFloor).toBe("2026-07-11");
    expect(tracked.state.backfillCursor).toBe("2026-08-10");
    expect(tracked.state.status).toBe("pending");
  });

  it("should drop only what the walk re-collects", async () => {
    // given
    // Releases and tags come from the daily snapshot, so deleting them would
    // lose history nothing would ever put back.
    const { store } = await seed();

    // when
    await new ResetIngestion({ store }).run({ days: 30, now: NOW });

    // then
    const events = await store.listEvents({
      from: new Date("2026-08-01T00:00:00.000Z"),
      to: new Date("2026-08-11T00:00:00.000Z"),
    });
    expect(events.map((event) => event.kind)).toEqual(["release"]);
  });

  it("should say what it did", async () => {
    // given
    // A reset costs hours of provider requests; an operator reading the logs
    // afterwards needs to find the moment somebody asked for it.
    const { store } = await seed();
    const logger = new RecordingLogger();

    // when
    await new ResetIngestion({ store, logger }).run({ days: 30, now: NOW });

    // then
    expect(logger.at("info")).toEqual([
      "history collection reset for 1 repositories, reaching 30 days back",
    ]);
  });
});
