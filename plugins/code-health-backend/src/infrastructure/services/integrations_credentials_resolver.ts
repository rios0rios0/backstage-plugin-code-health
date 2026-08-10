import {
  DefaultAzureDevOpsCredentialsProvider,
  DefaultGithubCredentialsProvider,
  type ScmIntegrationRegistry,
} from "@backstage/integration";
import type { TrackedRepository } from "../../domain/entities/tracked_repository";
import {
  MissingCredentialsError,
  type CredentialsResolver,
} from "../../domain/services/credentials_resolver";

/**
 * Resolves provider credentials from the host application's `integrations`
 * configuration.
 *
 * Both providers are asked per repository URL rather than per host, and neither
 * result is cached here: a GitHub App issues installation tokens scoped to a
 * repository and valid for as little as ten minutes, and the upstream providers
 * already cache what is safe to cache. Holding a token past that would trade a
 * negligible saving for intermittent 401s that look like a permissions problem.
 */
export class IntegrationsCredentialsResolver implements CredentialsResolver {
  private readonly github: DefaultGithubCredentialsProvider;
  private readonly azure: DefaultAzureDevOpsCredentialsProvider;

  constructor(integrations: ScmIntegrationRegistry) {
    this.github = DefaultGithubCredentialsProvider.fromIntegrations(integrations);
    this.azure = DefaultAzureDevOpsCredentialsProvider.fromIntegrations(integrations);
  }

  async resolve(repository: TrackedRepository): Promise<Record<string, string>> {
    if (repository.platform === "github") {
      const credentials = await this.github.getCredentials({ url: repository.repoUrl });
      if (!credentials.token && !credentials.headers) {
        throw new MissingCredentialsError(repository.repoUrl);
      }
      return credentials.headers ?? { Authorization: `Bearer ${credentials.token}` };
    }

    const credentials = await this.azure.getCredentials({ url: repository.repoUrl });
    if (!credentials) throw new MissingCredentialsError(repository.repoUrl);
    // `headers` already encodes `Basic base64(:pat)` or `Bearer <token>`
    // depending on the credential type, so it is used verbatim rather than
    // rebuilt from `token`.
    return credentials.headers;
  }
}
