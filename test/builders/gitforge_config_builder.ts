import type { GitforgeConfig } from "../../src/domain/entities/gitforge_config";
import { EMPTY_GITFORGE_CONFIG } from "../../src/domain/entities/gitforge_config";

export type GitforgeConfigOverrides = Partial<Omit<GitforgeConfig, "proxied">> & {
  proxied?: Partial<GitforgeConfig["proxied"]>;
};

/** Builds a {@link GitforgeConfig}, defaulting every unset target to "not proxied". */
export const aGitforgeConfig = (overrides: GitforgeConfigOverrides = {}): GitforgeConfig => ({
  ...EMPTY_GITFORGE_CONFIG,
  ...overrides,
  proxied: { ...EMPTY_GITFORGE_CONFIG.proxied, ...overrides.proxied },
});
