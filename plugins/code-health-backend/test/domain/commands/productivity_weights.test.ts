import type { ProductivityWeights } from "@rios0rios0/backstage-plugin-code-health-common";
import {
  DEFAULT_PRODUCTIVITY_WEIGHTS,
  PRODUCTIVITY_COMPONENT_IDS,
} from "@rios0rios0/backstage-plugin-code-health-common";
import { GetContributorTrend } from "../../../src/domain/commands/get_contributor_trend";
import { GetProductivityWeights } from "../../../src/domain/commands/get_productivity_weights";
import { UpdateProductivityWeights } from "../../../src/domain/commands/update_productivity_weights";
import { DiscoveredRepositoryBuilder } from "../../builders/discovered_repository_builder";
import { EventBuilder } from "../../builders/event_builder";
import { InMemoryCodeHealthStore } from "../../doubles/in_memory_code_health_store";
import { RecordingLogger } from "../../doubles/recording_logger";

const NOW = new Date("2026-08-10T12:00:00.000Z");
const WINDOW = {
  from: new Date("2026-08-05T00:00:00.000Z"),
  to: new Date("2026-08-09T00:00:00.000Z"),
};

/** Every component at nothing but the one named, which then carries the whole score. */
const only = (id: (typeof PRODUCTIVITY_COMPONENT_IDS)[number]): ProductivityWeights =>
  Object.fromEntries(
    PRODUCTIVITY_COMPONENT_IDS.map((component) => [component, component === id ? 1 : 0]),
  ) as Record<(typeof PRODUCTIVITY_COMPONENT_IDS)[number], number>;

const customLead = (): ProductivityWeights => ({
  ...DEFAULT_PRODUCTIVITY_WEIGHTS.lead,
  reviewsGiven: 0.6,
});

describe("GetProductivityWeights", () => {
  it("should answer with the defaults when nothing was stored", async () => {
    // given
    const store = new InMemoryCodeHealthStore();

    // when
    const weights = await new GetProductivityWeights(store).run();

    // then
    expect(weights).toEqual(DEFAULT_PRODUCTIVITY_WEIGHTS);
  });

  it("should answer with a stored set beside the other role's defaults", async () => {
    // given
    const store = new InMemoryCodeHealthStore();
    await store.saveProductivityWeights({
      role: "lead",
      weights: customLead(),
      updatedBy: "user:default/admin",
      updatedAt: NOW,
    });

    // when
    const weights = await new GetProductivityWeights(store).run();

    // then
    expect(weights.lead).toEqual(customLead());
    expect(weights.engineer).toEqual(DEFAULT_PRODUCTIVITY_WEIGHTS.engineer);
  });
});

describe("UpdateProductivityWeights", () => {
  it("should store a role's whole set and say who changed it", async () => {
    // given
    // These numbers decide how people are read; an operator looking at a
    // score that moved overnight needs to find the moment somebody moved it.
    const store = new InMemoryCodeHealthStore();
    const logger = new RecordingLogger();

    // when
    await new UpdateProductivityWeights({ store, logger }).update({
      role: "lead",
      weights: customLead(),
      updatedBy: "user:default/admin",
      now: NOW,
    });

    // then
    expect(await store.listProductivityWeights()).toEqual([
      { role: "lead", weights: customLead(), updatedBy: "user:default/admin", updatedAt: NOW },
    ]);
    expect(logger.at("info")).toEqual([
      "productivity weights for lead replaced by user:default/admin",
    ]);
  });

  it("should replace what was stored rather than keeping two sets", async () => {
    // given
    const store = new InMemoryCodeHealthStore();
    const command = new UpdateProductivityWeights({ store });
    await command.update({ role: "lead", weights: customLead(), updatedBy: null, now: NOW });

    // when
    await command.update({
      role: "lead",
      weights: DEFAULT_PRODUCTIVITY_WEIGHTS.lead,
      updatedBy: "user:default/other",
      now: NOW,
    });

    // then
    const stored = await store.listProductivityWeights();
    expect(stored).toHaveLength(1);
    expect(stored[0]?.weights).toEqual(DEFAULT_PRODUCTIVITY_WEIGHTS.lead);
  });

  it("should send a role back to the defaults and say who asked", async () => {
    // given
    // Deleting rather than writing the defaults back, so a later release's
    // better defaults reach an install that never customised the role.
    const store = new InMemoryCodeHealthStore();
    const logger = new RecordingLogger();
    await store.saveProductivityWeights({
      role: "lead",
      weights: customLead(),
      updatedBy: null,
      updatedAt: NOW,
    });

    // when
    await new UpdateProductivityWeights({ store, logger }).reset({
      role: "lead",
      updatedBy: "user:default/admin",
    });

    // then
    expect(await store.listProductivityWeights()).toEqual([]);
    expect(await new GetProductivityWeights(store).run()).toEqual(DEFAULT_PRODUCTIVITY_WEIGHTS);
    expect(logger.at("info")).toEqual([
      "productivity weights for lead restored to the defaults by user:default/admin",
    ]);
  });

  it("should name an administrator it was not told about", async () => {
    // given
    // The route always knows who asked, but the command must not print
    // `null` into a log line somebody reads back six months later.
    const store = new InMemoryCodeHealthStore();
    const logger = new RecordingLogger();
    const command = new UpdateProductivityWeights({ store, logger });

    // when
    await command.update({ role: "engineer", weights: customLead(), updatedBy: null, now: NOW });
    await command.reset({ role: "engineer", updatedBy: null });

    // then
    expect(logger.at("info")).toEqual([
      "productivity weights for engineer replaced by an administrator",
      "productivity weights for engineer restored to the defaults by an administrator",
    ]);
  });

  it("should work without a logger at all", async () => {
    // given
    const store = new InMemoryCodeHealthStore();

    // when
    await new UpdateProductivityWeights({ store }).update({
      role: "engineer",
      weights: customLead(),
      updatedBy: null,
      now: NOW,
    });

    // then
    expect(await store.listProductivityWeights()).toHaveLength(1);
  });
});

describe("GetContributorTrend with stored weights", () => {
  const seed = async () => {
    const store = new InMemoryCodeHealthStore();
    const repository = DiscoveredRepositoryBuilder.create().build();
    await store.syncRepositories({ discovered: [repository], retentionDays: 365, now: NOW });
    const commit = (at: string, actor: string) =>
      EventBuilder.commit()
        .withRepository(repository.id)
        .withActor(actor)
        .at(at)
        .withChurn(10, 2, 1)
        .build();
    await store.commitIngestion({
      repositoryId: repository.id,
      events: [
        commit("2026-08-06T10:00:00.000Z", "dev@example.com"),
        commit("2026-08-07T10:00:00.000Z", "dev@example.com"),
        ...Array.from({ length: 4 }, (_unused, index) =>
          commit(`2026-08-07T1${index}:00:00.000Z`, "other@example.com"),
        ),
      ],
      chunk: { repositoryId: repository.id, kinds: ["commit"], days: [], ingestedAt: NOW },
      status: "active",
      now: NOW,
    });
    return store;
  };

  it("should fold the headline and every bucket through the weights it is given", async () => {
    // given
    // An administrator who decided commits are everything for an engineer.
    const store = await seed();
    await store.saveProductivityWeights({
      role: "engineer",
      weights: only("commits"),
      updatedBy: null,
      updatedAt: NOW,
    });

    // when
    const trend = await new GetContributorTrend({
      store,
      weights: new GetProductivityWeights(store),
    }).run({ key: "vcs:dev@example.com", ...WINDOW, bucket: "day" });

    // then
    const commits = trend.score?.components.find((component) => component.id === "commits");
    expect(commits?.weight).toBe(1);
    // With one component carrying everything, the score is that component's
    // reading and nothing else — half the team's rate against twice it.
    expect(trend.score?.value).toBe(Math.round((commits?.normalized ?? 0) * 100));
    expect(commits?.normalized).toBeCloseTo(1 / 3, 3);
    for (const point of trend.points) {
      expect(
        point.score.components.find((component) => component.id === "commits")?.weight,
      ).toBe(1);
    }
  });

  it("should fold through the defaults when it was given no reader", async () => {
    // given
    // The contributors table in the browser falls back to the same defaults
    // when the backend sends nothing, so the two never disagree about an
    // install nobody has customised.
    const store = await seed();
    await store.saveProductivityWeights({
      role: "engineer",
      weights: only("commits"),
      updatedBy: null,
      updatedAt: NOW,
    });

    // when
    const trend = await new GetContributorTrend({ store }).run({
      key: "vcs:dev@example.com",
      ...WINDOW,
      bucket: "day",
    });

    // then
    expect(
      trend.score?.components.find((component) => component.id === "commits")?.weight,
    ).toBeCloseTo(DEFAULT_PRODUCTIVITY_WEIGHTS.engineer.commits, 10);
  });
});
