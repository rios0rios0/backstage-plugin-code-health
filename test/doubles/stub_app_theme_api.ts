import type { AppTheme, AppThemeApi } from "@backstage/core-plugin-api";

type Observer = { next?: (value: string | undefined) => void };

/** In-memory {@link AppThemeApi} that notifies subscribers when the theme changes. */
export class StubAppThemeApi implements AppThemeApi {
  private activeThemeId: string | undefined;
  private readonly observers = new Set<Observer>();

  constructor(initialThemeId?: string) {
    this.activeThemeId = initialThemeId;
  }

  getInstalledThemes(): AppTheme[] {
    return [];
  }

  getActiveThemeId(): string | undefined {
    return this.activeThemeId;
  }

  setActiveThemeId(themeId?: string): void {
    this.activeThemeId = themeId;
    for (const observer of this.observers) {
      observer.next?.(themeId);
    }
  }

  activeThemeId$() {
    return {
      subscribe: (observer: Observer) => {
        this.observers.add(observer);
        return {
          unsubscribe: () => this.observers.delete(observer),
          closed: false,
        };
      },
      [Symbol.observable ?? "@@observable"]() {
        return this;
      },
    } as unknown as ReturnType<AppThemeApi["activeThemeId$"]>;
  }
}
