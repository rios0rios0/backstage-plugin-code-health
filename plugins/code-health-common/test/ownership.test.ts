import { ownerEntityRef } from "../src/ownership";

describe("ownerEntityRef", () => {
  it("should default a bare name to a group in the default namespace", () => {
    // given / when / then
    // That is how the catalog itself reads `spec.owner: team-a`.
    expect(ownerEntityRef("team-a")).toBe("group:default/team-a");
  });

  it("should fill in the namespace of a kind-qualified reference", () => {
    // given / when / then
    expect(ownerEntityRef("group:team-a")).toBe("group:default/team-a");
    expect(ownerEntityRef("user:jane")).toBe("user:default/jane");
  });

  it("should keep a full reference, folding kind and namespace to lower case", () => {
    // given / when / then
    expect(ownerEntityRef("User:Default/Jane")).toBe("user:default/Jane");
  });

  it("should read a namespace without a kind as a group", () => {
    // given / when / then
    expect(ownerEntityRef("platform/team-a")).toBe("group:platform/team-a");
  });

  it("should reject an empty or malformed owner", () => {
    // given / when / then
    expect(ownerEntityRef("   ")).toBeNull();
    expect(ownerEntityRef("group:")).toBeNull();
  });
});
