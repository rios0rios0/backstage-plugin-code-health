import {
  EMPTY_CATALOG_FACTS,
  type DiscoveredRepository,
} from "../../src/domain/entities/tracked_repository";
import { repositoryIdFor } from "../../src/infrastructure/services/annotation_repository_resolver";

let counter = 0;

export class DiscoveredRepositoryBuilder {
  private props: DiscoveredRepository;

  private constructor() {
    counter += 1;
    const entityRef = `component:default/repo-${counter}`;
    this.props = {
      id: repositoryIdFor(entityRef),
      entityRef,
      platform: "github",
      host: "github.com",
      owner: "rios0rios0",
      project: null,
      name: `repo-${counter}`,
      repoUrl: `https://github.com/rios0rios0/repo-${counter}`,
      defaultBranch: null,
      externalId: null,
      sonarProjectKey: null,
      catalogFacts: EMPTY_CATALOG_FACTS,
      archived: false,
    };
  }

  static create(): DiscoveredRepositoryBuilder {
    return new DiscoveredRepositoryBuilder();
  }

  withEntityRef(entityRef: string): DiscoveredRepositoryBuilder {
    this.props = { ...this.props, entityRef, id: repositoryIdFor(entityRef) };
    return this;
  }

  withName(name: string): DiscoveredRepositoryBuilder {
    this.props = { ...this.props, name };
    return this;
  }

  asAzureDevOps(owner: string, project: string): DiscoveredRepositoryBuilder {
    this.props = {
      ...this.props,
      platform: "azure-devops",
      host: "dev.azure.com",
      owner,
      project,
      repoUrl: `https://dev.azure.com/${owner}/${project}/_git/${this.props.name}`,
    };
    return this;
  }

  withSonarProjectKey(sonarProjectKey: string): DiscoveredRepositoryBuilder {
    this.props = { ...this.props, sonarProjectKey };
    return this;
  }

  withCatalogFacts(
    facts: Partial<DiscoveredRepository["catalogFacts"]>,
  ): DiscoveredRepositoryBuilder {
    this.props = {
      ...this.props,
      catalogFacts: { ...this.props.catalogFacts, ...facts },
    };
    return this;
  }

  build(): DiscoveredRepository {
    return { ...this.props };
  }
}
