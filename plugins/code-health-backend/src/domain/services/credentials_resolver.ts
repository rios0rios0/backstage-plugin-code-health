import type { TrackedRepository } from "../entities/tracked_repository";

/** Raised when no configured integration covers a repository's host. */
export class MissingCredentialsError extends Error {
  constructor(readonly repoUrl: string) {
    super(
      `no integration is configured for ${repoUrl}; add it under \`integrations\` in app-config`,
    );
    this.name = "MissingCredentialsError";
  }
}

/**
 * Supplies the headers a request to a repository's provider needs.
 *
 * Credentials come from the host application's existing `integrations`
 * configuration, so there is no second copy of an Azure DevOps or GitHub token
 * to configure, rotate or leak. Resolution is per repository URL rather than
 * per host, because a GitHub App mints installation tokens scoped to individual
 * repositories.
 */
export interface CredentialsResolver {
  resolve(repository: TrackedRepository): Promise<Record<string, string>>;
}
