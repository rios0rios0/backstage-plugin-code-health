import { mergeClaudeMetrics, type ClaudeMetrics } from "@rios0rios0/backstage-plugin-code-health-common";
import type { Day } from "../../domain/entities/day";
import { normalizeSourceKey } from "../../domain/entities/identity";
import type { ObservedIdentity } from "../../domain/services/identity_resolver";

const objectOf = (value: unknown): Record<string, unknown> => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Invalid Claude analytics object");
  }
  return value as Record<string, unknown>;
};

const countOf = (value: unknown): number => {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new Error("Invalid Claude token count");
  }
  return value;
};

export interface ClaudeAnalyticsPage {
  readonly records: readonly { identity: ObservedIdentity; metrics: ClaudeMetrics }[];
  readonly nextPage: string | null;
}

/** Validates the boundary instead of turning missing token fields into measured zeros. */
export const parseClaudePage = (value: unknown, day: Day): ClaudeAnalyticsPage => {
  const page = objectOf(value);
  if (!Array.isArray(page.data) || typeof page.has_more !== "boolean") {
    throw new Error("Invalid Claude analytics page");
  }
  if (page.has_more && (typeof page.next_page !== "string" || page.next_page.trim() === "")) {
    throw new Error("Missing Claude analytics cursor");
  }
  const records = page.data.map((valueOfRow) => {
    const row = objectOf(valueOfRow);
    if (typeof row.date !== "string" || row.date.slice(0, 10) !== day) {
      throw new Error("Unexpected Claude analytics date");
    }
    const actor = objectOf(row.actor);
    const user = actor.type === "user_actor";
    if (!user && actor.type !== "api_actor") throw new Error("Unknown Claude actor type");
    const name = user ? actor.email_address : actor.api_key_name;
    if (typeof name !== "string" || name.trim() === "") throw new Error("Missing Claude actor");
    // API keys can be shared. Keep them separate from humans even if named after an email.
    const sourceKey = normalizeSourceKey(user ? name : `api-key:${name}`);
    const identity: ObservedIdentity = {
      source: "claude", sourceKey, displayName: name.trim(),
      email: user ? name.trim().toLowerCase() : null, avatarUrl: null, profileUrl: null,
    };
    if (!Array.isArray(row.model_breakdown)) {
      throw new Error("Missing Claude model token breakdown");
    }
    const parts = row.model_breakdown.map((modelValue): ClaudeMetrics => {
      const tokens = objectOf(objectOf(modelValue).tokens);
      const counts = {
        inputTokens: countOf(tokens.input), outputTokens: countOf(tokens.output),
        cacheReadTokens: countOf(tokens.cache_read), cacheCreationTokens: countOf(tokens.cache_creation),
      };
      return { ...counts, daily: [{ day, ...counts }] };
    });
    const zero = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0 };
    return { identity, metrics: mergeClaudeMetrics(parts) ?? { ...zero, daily: [{ day, ...zero }] } };
  });
  return { records, nextPage: page.has_more ? page.next_page as string : null };
};
