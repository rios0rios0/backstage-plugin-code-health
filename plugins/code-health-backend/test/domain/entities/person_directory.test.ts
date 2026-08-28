import {
  identityKey,
  normalizeSourceKey,
  personKeyOf,
  type IdentityLinkRecord,
  type IdentityRecord,
} from "../../../src/domain/entities/identity";
import { PersonDirectory } from "../../../src/domain/entities/person_directory";

const NOW = new Date("2026-08-10T12:00:00.000Z");

const anIdentity = (overrides: Partial<IdentityRecord> = {}): IdentityRecord => ({
  source: "wakatime",
  sourceKey: "jrios",
  displayName: "J Rios",
  email: null,
  avatarUrl: null,
  profileUrl: null,
  firstSeenAt: NOW,
  lastSeenAt: NOW,
  ...overrides,
});

const aLink = (overrides: Partial<IdentityLinkRecord> = {}): IdentityLinkRecord => ({
  source: "wakatime",
  sourceKey: "jrios",
  entityRef: "user:default/felipe",
  origin: "manual",
  linkedBy: "user:default/admin",
  linkedAt: NOW,
  ...overrides,
});

const noFallback = { displayName: null, avatarUrl: null, profileUrl: null };

describe("normalizeSourceKey", () => {
  it("should trim and lowercase, so two spellings are one account", () => {
    // given / when / then
    expect(normalizeSourceKey("  Dev@Example.COM ")).toBe("dev@example.com");
  });
});

describe("identityKey and personKeyOf", () => {
  it("should key an unlinked account under itself", () => {
    // given
    // Hiding an unlinked account would hide every bot, every service account,
    // and everybody nobody has got round to linking.
    const identity = { source: "vcs" as const, sourceKey: "bot@ci.local" };

    // when / then
    expect(identityKey(identity)).toBe("vcs:bot@ci.local");
    expect(personKeyOf(identity, undefined)).toBe("vcs:bot@ci.local");
  });

  it("should key a linked account under its catalog user", () => {
    // given
    const identity = { source: "wakatime" as const, sourceKey: "jrios" };

    // when / then
    expect(personKeyOf(identity, aLink())).toBe("user:default/felipe");
  });
});

describe("PersonDirectory", () => {
  it("should put two linked accounts under one key", () => {
    // given
    const directory = new PersonDirectory({
      links: [aLink(), aLink({ source: "vcs", sourceKey: "dev@example.com" })],
      identities: [],
    });

    // when
    const wakatime = directory.keyOf({ source: "wakatime", sourceKey: "jrios" });
    const vcs = directory.keyOf({ source: "vcs", sourceKey: "dev@example.com" });

    // then
    expect(wakatime).toBe(vcs);
  });

  it("should report the catalog user only for a linked person", () => {
    // given
    const directory = new PersonDirectory({ links: [aLink()], identities: [] });

    // when / then
    expect(directory.entityRefOf("user:default/felipe")).toBe("user:default/felipe");
    expect(directory.entityRefOf("vcs:bot@ci.local")).toBeNull();
  });

  it("should merge the profile fields of every account on the row", () => {
    // given
    const directory = new PersonDirectory({
      links: [aLink(), aLink({ source: "vcs", sourceKey: "dev@example.com" })],
      identities: [
        anIdentity({ displayName: null, avatarUrl: "https://example.com/wt.png" }),
        anIdentity({
          source: "vcs",
          sourceKey: "dev@example.com",
          displayName: "Felipe Rios",
          profileUrl: "https://github.com/felipe",
        }),
      ],
    });

    // when
    const profile = directory.profileOf("user:default/felipe", noFallback);

    // then
    expect(profile.displayName).toBe("Felipe Rios");
    expect(profile.avatarUrl).toBe("https://example.com/wt.png");
    expect(profile.profileUrl).toBe("https://github.com/felipe");
    expect(profile.identities).toHaveLength(2);
  });

  it("should prefer the name the most recently seen account reported", () => {
    // given
    // A name changes, and the newest one is the one the person would recognise.
    const older = anIdentity({
      sourceKey: "old",
      displayName: "Old Name",
      lastSeenAt: new Date("2026-01-01T00:00:00.000Z"),
    });
    const newer = anIdentity({ sourceKey: "new", displayName: "New Name", lastSeenAt: NOW });
    const directory = new PersonDirectory({
      links: [aLink({ sourceKey: "old" }), aLink({ sourceKey: "new" })],
      identities: [older, newer],
    });

    // when
    const profile = directory.profileOf("user:default/felipe", noFallback);

    // then
    expect(profile.displayName).toBe("New Name");
  });

  it("should fall back to what the caller knows for an account it has never seen", () => {
    // given
    // An event carries the name the provider stamped on the commit, and it is
    // better than the key.
    const directory = new PersonDirectory({ links: [], identities: [] });

    // when
    const profile = directory.profileOf("vcs:dev@example.com", {
      displayName: "Dev Example",
      avatarUrl: "https://example.com/a.png",
      profileUrl: null,
    });

    // then
    expect(profile.displayName).toBe("Dev Example");
    expect(profile.avatarUrl).toBe("https://example.com/a.png");
    expect(profile.identities).toEqual([]);
  });

  it("should ignore an empty string as though the field were absent", () => {
    // given
    const directory = new PersonDirectory({
      links: [aLink()],
      identities: [anIdentity({ displayName: "" })],
    });

    // when
    const profile = directory.profileOf("user:default/felipe", {
      ...noFallback,
      displayName: "From the commit",
    });

    // then
    expect(profile.displayName).toBe("From the commit");
  });
});
