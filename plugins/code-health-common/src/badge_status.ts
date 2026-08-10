export type BadgeColor = "green" | "yellow";

export interface BadgeCheck {
  readonly label: string;
  readonly present: boolean;
}

export interface BadgeStatus {
  readonly checks: readonly BadgeCheck[];
  readonly color: BadgeColor;
}

interface BadgeDefinition {
  readonly label: string;
  readonly patterns: readonly string[];
}

const REQUIRED_BADGES: readonly BadgeDefinition[] = [
  { label: "Latest Release", patterns: ["img.shields.io/github/release/"] },
  { label: "License", patterns: ["img.shields.io/github/license/"] },
  { label: "Build Status", patterns: ["img.shields.io/github/actions/workflow/status/"] },
  { label: "SonarCloud Coverage", patterns: ["img.shields.io/sonar/coverage/"] },
  { label: "SonarCloud Quality Gate", patterns: ["img.shields.io/sonar/quality_gate/"] },
  { label: "OpenSSF Best Practices", patterns: ["img.shields.io/cii/level/", "bestpractices.dev/projects/"] },
];

export const computeBadgeColor = (checks: readonly BadgeCheck[]): BadgeColor =>
  checks.every((c) => c.present) ? "green" : "yellow";

export const parseBadgesFromReadme = (content: string): BadgeStatus => {
  const checks: BadgeCheck[] = REQUIRED_BADGES.map((badge) => ({
    label: badge.label,
    present: badge.patterns.some((pattern) => content.includes(pattern)),
  }));

  return { checks, color: computeBadgeColor(checks) };
};
