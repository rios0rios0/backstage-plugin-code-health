import type {
  BackstageCredentials,
  PermissionsService,
  UserInfoService,
} from "@backstage/backend-plugin-api";
import { AuthorizeResult } from "@backstage/plugin-permission-common";
import { codeHealthIngestionResetPermission } from "../entities/permissions";

/**
 * Entity references compare by kind, namespace and name, and the catalog folds
 * the first two to lower case while leaving the name as it was typed. Folding
 * the whole reference is the only comparison that treats
 * `Group:Default/platform` and `group:default/platform` as one group without
 * also having to parse both.
 */
const fold = (entityRef: string): string => entityRef.toLowerCase();

export interface AuthorizeAdministratorOptions {
  readonly userInfo: UserInfoService;
  readonly permissions: PermissionsService;
  /** Catalog references of the users and groups allowed to reset ingestion. */
  readonly administrators: readonly string[];
}

/**
 * Whether a caller may start the history collection over.
 *
 * Two gates, and both have to open.
 *
 * The **list** is what makes the restriction real on a stock install. Backstage
 * ships a permission policy that allows everything, so a plugin relying only on
 * the framework would let any signed-in user drop a year of collected history
 * and start a day of rate-limited requests. With no list configured nobody
 * qualifies, which is the only safe thing for an install that acquires this
 * route by upgrading.
 *
 * The **permission** is what lets an organisation that has a policy — or the
 * RBAC plugin — refuse the reset by name, including for somebody on the list.
 * It only ever narrows: a policy cannot grant the reset to a person the list
 * does not name.
 *
 * A service principal is never an administrator. The whole point of the route
 * is that a person chose to pay for the re-walk, and a token cannot choose.
 */
export class AuthorizeAdministrator {
  constructor(private readonly options: AuthorizeAdministratorOptions) {}

  async isAdministrator(credentials: BackstageCredentials): Promise<boolean> {
    if (this.options.administrators.length === 0) return false;

    // `getUserInfo` throws for anything that is not a user principal, which is
    // exactly the answer wanted — a service token is not an administrator — but
    // it is an answer, not a failure, so it is caught rather than surfaced.
    const info = await this.options.userInfo.getUserInfo(credentials).catch(() => null);
    if (info === null) return false;

    // `ownershipEntityRefs` already includes the user's own reference and every
    // group they own things as, so naming a group in the list works without
    // this having to walk the catalog itself.
    const allowed = new Set(this.options.administrators.map(fold));
    if (!info.ownershipEntityRefs.some((ref) => allowed.has(fold(ref)))) return false;

    const [decision] = await this.options.permissions.authorize(
      [{ permission: codeHealthIngestionResetPermission }],
      { credentials },
    );
    return decision?.result === AuthorizeResult.ALLOW;
  }
}
