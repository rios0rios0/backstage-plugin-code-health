import type { RepositoryFileFacts } from "../../../domain/entities/repository_snapshot";

/**
 * The directories both collectors list, besides the repository root.
 *
 * Shallow on purpose. A full tree walk is a different cost on every platform and
 * unbounded on a large repository, whereas these three places hold the files
 * anybody would actually look for, and cost one listing each.
 */
export const SCANNED_DIRECTORIES: readonly string[] = ["docs", "api"];

const README = /^readme(\.[a-z0-9]+)?$/i;

/** TechDocs' own generator, and the file its `dir:` reference points at. */
const DOCS_CONFIG = /^mkdocs\.ya?ml$/i;

/**
 * Names that describe a service interface.
 *
 * Ordered by how unambiguous they are: an `openapi.yaml` says exactly what it
 * is, whereas a stray `.proto` might be a message definition shared between two
 * services. The first pattern that matches wins, so the reported path is the
 * strongest evidence found rather than whichever file sorted first.
 */
const API_DEFINITIONS: readonly RegExp[] = [
  /^openapi\.(ya?ml|json)$/i,
  /^swagger\.(ya?ml|json)$/i,
  /^asyncapi\.(ya?ml|json)$/i,
  /^api\.(ya?ml|json)$/i,
  /^(schema|api)\.graphqls?$/i,
  /\.proto$/i,
];

const basenameOf = (path: string): string => path.slice(path.lastIndexOf("/") + 1);

const isAtRoot = (path: string): boolean => !path.includes("/");

/**
 * Grades a list of repository-relative file paths.
 *
 * Paths are files, never directories: an empty `docs/` is not documentation, and
 * a caller that could only see the directory would otherwise report one.
 *
 * The list is sorted before the API scan so two repositories with the same files
 * always report the same path, whatever order their provider listed them in.
 */
export const detectRepositoryFiles = (
  paths: readonly string[],
): RepositoryFileFacts => {
  const normalised = paths
    .map((path) => path.replace(/^\/+/, ""))
    .filter((path) => path !== "");
  const sorted = [...normalised].sort((left, right) => left.localeCompare(right));

  const hasReadme = sorted.some(
    (path) => isAtRoot(path) && README.test(basenameOf(path)),
  );

  const hasDocsSource =
    sorted.some((path) => path.startsWith("docs/")) ||
    sorted.some((path) => isAtRoot(path) && DOCS_CONFIG.test(basenameOf(path)));

  let apiDefinitionPath: string | null = null;
  for (const pattern of API_DEFINITIONS) {
    const match = sorted.find((path) => pattern.test(basenameOf(path)));
    if (match !== undefined) {
      apiDefinitionPath = match;
      break;
    }
  }

  return { hasReadme, hasDocsSource, apiDefinitionPath };
};
