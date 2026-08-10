import type { Entity } from "@backstage/catalog-model";

let counter = 0;

/**
 * Builds a catalog Component with the annotations under test.
 *
 * `metadata.name` is unique per call unless overridden, because the resolver
 * derives a repository id from the entity reference and two entities sharing a
 * name would silently collapse into one.
 */
export class EntityBuilder {
  private annotations: Record<string, string> = {};
  private name: string;
  private kind = "Component";
  private namespace = "default";

  private constructor() {
    counter += 1;
    this.name = `component-${counter}`;
  }

  static create(): EntityBuilder {
    return new EntityBuilder();
  }

  withName(name: string): EntityBuilder {
    this.name = name;
    return this;
  }

  withKind(kind: string): EntityBuilder {
    this.kind = kind;
    return this;
  }

  withNamespace(namespace: string): EntityBuilder {
    this.namespace = namespace;
    return this;
  }

  withAnnotation(name: string, value: string): EntityBuilder {
    this.annotations = { ...this.annotations, [name]: value };
    return this;
  }

  withGithubSlug(slug: string): EntityBuilder {
    return this.withAnnotation("github.com/project-slug", slug);
  }

  withAzureRepo(projectRepo: string, hostOrg?: string): EntityBuilder {
    const withRepo = this.withAnnotation("dev.azure.com/project-repo", projectRepo);
    return hostOrg === undefined
      ? withRepo
      : withRepo.withAnnotation("dev.azure.com/host-org", hostOrg);
  }

  withSourceLocation(url: string): EntityBuilder {
    return this.withAnnotation("backstage.io/source-location", `url:${url}`);
  }

  withSonarProjectKey(key: string): EntityBuilder {
    return this.withAnnotation("sonarqube.org/project-key", key);
  }

  build(): Entity {
    return {
      apiVersion: "backstage.io/v1alpha1",
      kind: this.kind,
      metadata: {
        name: this.name,
        namespace: this.namespace,
        ...(Object.keys(this.annotations).length > 0
          ? { annotations: this.annotations }
          : {}),
      },
      spec: { type: "service", owner: "team-a" },
    };
  }
}
