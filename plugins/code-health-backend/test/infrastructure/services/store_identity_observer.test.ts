import { StoreIdentityObserver } from "../../../src/infrastructure/services/store_identity_observer";
import { InMemoryCodeHealthStore } from "../../doubles/in_memory_code_health_store";

const NOW = new Date("2026-08-10T12:00:00.000Z");

describe("StoreIdentityObserver", () => {
  it("should record what a collector observed", async () => {
    // given
    const store = new InMemoryCodeHealthStore();

    // when
    await new StoreIdentityObserver(store).observe(
      [
        {
          source: "wakatime",
          sourceKey: "jrios",
          displayName: "Felipe",
          email: null,
          avatarUrl: null,
          profileUrl: null,
        },
      ],
      NOW,
    );

    // then
    const [identity] = await store.listIdentities();
    expect(identity).toMatchObject({ source: "wakatime", sourceKey: "jrios" });
  });

  it("should not write at all when nothing was observed", async () => {
    // given
    // A collector that found nobody calls this on every run; a write per run
    // that changes nothing is pure churn on a table the whole read path scans.
    const store = new InMemoryCodeHealthStore();

    // when
    await new StoreIdentityObserver(store).observe([], NOW);

    // then
    expect(await store.listIdentities()).toEqual([]);
  });
});
