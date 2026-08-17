import { catalogEntityPath, parseEntityRef } from "../src/entity_ref";

describe("parseEntityRef", () => {
  it("should split a fully qualified reference", () => {
    // given
    const entityRef = "component:default/backstage-app";

    // when
    const parsed = parseEntityRef(entityRef);

    // then
    expect(parsed).toEqual({ kind: "component", namespace: "default", name: "backstage-app" });
  });

  it("should default the namespace when the reference omits it", () => {
    // given
    // The catalog writes `<kind>:<name>` for entities in the default namespace.
    const entityRef = "user:jane.doe";

    // when
    const parsed = parseEntityRef(entityRef);

    // then
    expect(parsed).toEqual({ kind: "user", namespace: "default", name: "jane.doe" });
  });

  it("should lowercase the kind and namespace but preserve the name", () => {
    // given
    // Kind and namespace are case-insensitive in the catalog; the name is not,
    // and lowercasing it would break the link for a mixed-case entity.
    const entityRef = "Component:Default/My-Service";

    // when
    const parsed = parseEntityRef(entityRef);

    // then
    expect(parsed).toEqual({ kind: "component", namespace: "default", name: "My-Service" });
  });

  it.each([
    ["", "empty"],
    ["   ", "blank"],
    ["backstage-app", "no kind"],
    [":default/name", "empty kind"],
    ["component:", "no name"],
    ["component:default/", "empty name"],
    ["component:/name", "empty namespace"],
    ["component:default/extra/name", "too many segments"],
  ])("should return null for %p (%s)", (entityRef) => {
    // given / when
    const parsed = parseEntityRef(entityRef);

    // then
    // Null rather than a throw: one malformed row degrades to plain text instead
    // of taking down the table it appears in.
    expect(parsed).toBeNull();
  });
});

describe("catalogEntityPath", () => {
  it("should build the catalog path for an entity", () => {
    // given
    const entityRef = "component:default/backstage-app";

    // when
    const path = catalogEntityPath(entityRef);

    // then
    expect(path).toBe("/catalog/default/component/backstage-app");
  });

  it("should encode a name that would otherwise break the path", () => {
    // given
    // Azure DevOps repository names allow spaces, and the catalog keeps them.
    const entityRef = "user:default/first last";

    // when
    const path = catalogEntityPath(entityRef);

    // then
    expect(path).toBe("/catalog/default/user/first%20last");
  });

  it("should return null for a reference it cannot parse", () => {
    // given / when
    const path = catalogEntityPath("not-a-ref");

    // then
    expect(path).toBeNull();
  });
});
