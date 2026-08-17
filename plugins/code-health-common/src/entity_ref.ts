/** The three parts of a Backstage entity reference, e.g. `component:default/api`. */
export interface ParsedEntityRef {
  readonly kind: string;
  readonly namespace: string;
  readonly name: string;
}

const DEFAULT_NAMESPACE = "default";

/**
 * Splits `<kind>:[<namespace>/]<name>` into its parts, defaulting the namespace
 * to `default` when it is omitted.
 *
 * The kind is required. A bare name is rejected rather than guessed at, because
 * the same name routinely exists under several kinds and a wrong guess links to
 * an entity that is not the one on the row.
 *
 * Returns null rather than throwing: an entity reference reaches this from
 * stored data, and one row with a malformed value should degrade to plain text
 * rather than take the whole table down.
 */
export const parseEntityRef = (entityRef: string): ParsedEntityRef | null => {
  const trimmed = entityRef.trim();
  if (trimmed === "") return null;

  const colon = trimmed.indexOf(":");
  if (colon <= 0 || colon === trimmed.length - 1) return null;
  const kind = trimmed.slice(0, colon);
  const rest = trimmed.slice(colon + 1);

  const slash = rest.indexOf("/");
  const namespace = slash === -1 ? DEFAULT_NAMESPACE : rest.slice(0, slash);
  const name = slash === -1 ? rest : rest.slice(slash + 1);
  if (namespace === "" || name === "" || name.includes("/")) return null;

  return { kind: kind.toLowerCase(), namespace: namespace.toLowerCase(), name };
};

/**
 * Path of an entity's page in the catalog.
 *
 * Built from the reference rather than resolved through `entityRouteRef`, which
 * would mean depending on `@backstage/plugin-catalog-react` from a plugin whose
 * only routing peer today is `react-router-dom`. The catalog mounts entity pages
 * at this path by default; an app that remaps it would need to pass its own
 * builder, which is why this is a plain function rather than a hook.
 */
export const catalogEntityPath = (entityRef: string): string | null => {
  const parsed = parseEntityRef(entityRef);
  if (!parsed) return null;
  const { kind, namespace, name } = parsed;
  return `/catalog/${encodeURIComponent(namespace)}/${encodeURIComponent(
    kind,
  )}/${encodeURIComponent(name)}`;
};
