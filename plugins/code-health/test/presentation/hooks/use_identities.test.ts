import { act, renderHook, waitFor } from "@testing-library/react";
import { useIdentities } from "../../../src/presentation/hooks/use_identities";
import { IdentityRowBuilder } from "../../builders/identity_row_builder";
import { StubIdentityService } from "../../doubles/stub_identity_service";

const rows = [
  IdentityRowBuilder.create().from("wakatime", "jrios").build(),
  IdentityRowBuilder.create()
    .from("vcs", "dev@example.com")
    .linkedTo("user:default/dev", "catalog-email")
    .build(),
];

describe("useIdentities", () => {
  it("should load the accounts and pass the filter through", async () => {
    // given
    const service = new StubIdentityService().withRows(rows);

    // when
    const { result } = renderHook(() =>
      useIdentities(service, { sources: ["wakatime"], linked: false }),
    );

    // then
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.identities.map((row) => row.identity.sourceKey)).toEqual(["jrios"]);
    expect(service.filters[0]).toEqual({ sources: ["wakatime"], linked: false });
  });

  it("should not refetch forever when the caller passes an inline array", async () => {
    // given
    // The obvious way to call this builds a new array on every render, and a
    // dependency on the array itself would loop: a page that never stops
    // loading while hammering the backend.
    const service = new StubIdentityService().withRows(rows);

    // when
    const { result, rerender } = renderHook(() =>
      useIdentities(service, { sources: ["wakatime"] }),
    );
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    rerender();
    rerender();

    // then
    expect(service.filters).toHaveLength(1);
  });

  it("should omit an absent filter rather than sending it as undefined", async () => {
    // given
    const service = new StubIdentityService().withRows(rows);

    // when
    const { result } = renderHook(() => useIdentities(service, {}));

    // then
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(service.filters[0]).toEqual({});
    expect(result.current.identities).toHaveLength(2);
  });

  it("should surface a listing failure", async () => {
    // given
    const service = new StubIdentityService().withListFailure(new Error("nope"));

    // when
    const { result } = renderHook(() => useIdentities(service, {}));

    // then
    await waitFor(() => expect(result.current.error).toBe("nope"));
    expect(result.current.identities).toEqual([]);
  });

  it("should reload the whole listing after a link, not patch one row", async () => {
    // given
    // A link changes more than the row it was made on: the suggestions on every
    // other row were computed against a directory one of whose people is now
    // taken, and reconciling that in the browser would be a second
    // implementation of a rule the backend already owns.
    const service = new StubIdentityService().withRows(rows);
    const { result } = renderHook(() => useIdentities(service, {}));
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    // when
    await act(async () => {
      await result.current.link({
        source: "wakatime",
        sourceKey: "jrios",
        entityRef: "user:default/felipe",
      });
    });

    // then
    expect(result.current.identities[0]?.link?.entityRef).toBe("user:default/felipe");
    expect(service.filters).toHaveLength(2);
  });

  it("should report a link that was refused and leave the listing alone", async () => {
    // given
    const service = new StubIdentityService()
      .withRows(rows)
      .withLinkFailure(new Error("no such user"));
    const { result } = renderHook(() => useIdentities(service, {}));
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    // when
    let succeeded = true;
    await act(async () => {
      succeeded = await result.current.link({
        source: "wakatime",
        sourceKey: "jrios",
        entityRef: "user:default/ghost",
      });
    });

    // then
    expect(succeeded).toBe(false);
    expect(result.current.writeError).toBe("no such user");
    expect(result.current.identities[0]?.link).toBeNull();
  });

  it("should remove a link and reload", async () => {
    // given
    const service = new StubIdentityService().withRows(rows);
    const { result } = renderHook(() => useIdentities(service, {}));
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    // when
    await act(async () => {
      await result.current.unlink({ source: "vcs", sourceKey: "dev@example.com" });
    });

    // then
    expect(result.current.identities[1]?.link).toBeNull();
  });

  it("should refetch on demand", async () => {
    // given
    const service = new StubIdentityService().withRows(rows);
    const { result } = renderHook(() => useIdentities(service, {}));
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    // when
    await act(async () => {
      await result.current.refetch();
    });

    // then
    expect(service.filters).toHaveLength(2);
  });
});
