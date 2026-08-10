export interface Release {
  readonly tagName: string;
  readonly name: string;
  readonly publishedAt: string;
  readonly url: string;
  readonly isPrerelease: boolean;
}
