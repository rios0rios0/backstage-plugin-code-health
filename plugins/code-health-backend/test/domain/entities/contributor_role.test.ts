import { accountOfPersonKey } from "../../../src/domain/entities/contributor_role";

describe("accountOfPersonKey", () => {
  it("should read an unlinked account's key back into the account", () => {
    // given / when / then
    // The key a contributors row carries for an account nobody has linked is
    // the same composite the identity table is keyed by.
    expect(accountOfPersonKey("vcs:jane@acme.com")).toEqual({
      source: "vcs",
      sourceKey: "jane@acme.com",
    });
  });

  it("should not read a catalog reference as an account", () => {
    // given / when / then
    // `user` is not a source, so a linked person's key names no account and
    // is stored as the person it already is.
    expect(accountOfPersonKey("user:default/jane")).toBeNull();
  });

  it("should refuse a source with nothing after it", () => {
    // given / when / then
    expect(accountOfPersonKey("vcs:")).toBeNull();
  });

  it("should refuse a key with no separator at all", () => {
    // given / when / then
    expect(accountOfPersonKey("bogus")).toBeNull();
    expect(accountOfPersonKey(":jane")).toBeNull();
  });

  it("should split on the first colon only", () => {
    // given
    // A source never contains a colon; nothing guarantees an account
    // identifier never will, so everything after the first one is the key.
    const key = "jira:5b10a2844c20165700ede21g:extra";

    // when / then
    expect(accountOfPersonKey(key)).toEqual({
      source: "jira",
      sourceKey: "5b10a2844c20165700ede21g:extra",
    });
  });
});
