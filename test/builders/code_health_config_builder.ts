import type { CodeHealthConfig } from "../../src/domain/entities/code_health_config";
import { EMPTY_CODE_HEALTH_CONFIG } from "../../src/domain/entities/code_health_config";

export type CodeHealthConfigOverrides = Partial<Omit<CodeHealthConfig, "proxied">> & {
  proxied?: Partial<CodeHealthConfig["proxied"]>;
};

/** Builds a {@link CodeHealthConfig}, defaulting every unset target to "not proxied". */
export const aCodeHealthConfig = (overrides: CodeHealthConfigOverrides = {}): CodeHealthConfig => ({
  ...EMPTY_CODE_HEALTH_CONFIG,
  ...overrides,
  proxied: { ...EMPTY_CODE_HEALTH_CONFIG.proxied, ...overrides.proxied },
});
