import { useCallback, useEffect, useMemo, useState } from "react";
import type { CodeHealthConfig } from "../../domain/entities/code_health_config";
import type { Platform } from "../../domain/entities/platform";
import { isPlatform } from "../../domain/entities/platform";
import type { SonarType } from "../../domain/entities/sonar_type";
import { isSonarType } from "../../domain/entities/sonar_type";
import type { AsyncAuthenticationService } from "../../domain/services/authentication_service";

export type { SonarType };

export interface SonarLoginInfo {
  type: SonarType;
  token: string;
  url?: string;
}

export interface LoginCredentials {
  sonar: SonarLoginInfo | null;
  wakaTimeToken: string | null;
}

export interface UseAuthenticationResult {
  /** False until the encrypted credential store finished unwrapping its key. */
  isReady: boolean;
  token: string | null;
  username: string | null;
  sonarToken: string | null;
  sonarType: SonarType | null;
  sonarUrl: string | null;
  wakaTimeToken: string | null;
  platform: Platform | null;
  /** Platform after applying the value pinned in `app-config.yaml`. */
  effectivePlatform: Platform | null;
  /** Organization after applying the value pinned in `app-config.yaml`. */
  effectiveOrganization: string | null;
  /** True when the plugin has everything it needs to call the platform. */
  isConfigured: boolean;
  login: (
    token: string,
    username: string,
    credentials: LoginCredentials,
    platform: Platform,
  ) => void;
  logout: () => void;
  updateVcsCredentials: (token: string, username: string, platform: Platform) => void;
  updateSonarConfig: (sonar: SonarLoginInfo | null) => void;
  updateWakaTimeToken: (token: string | null) => void;
}

interface StoredCredentials {
  token: string | null;
  username: string | null;
  sonarToken: string | null;
  sonarType: SonarType | null;
  sonarUrl: string | null;
  wakaTimeToken: string | null;
  platform: Platform | null;
}

const EMPTY_CREDENTIALS: StoredCredentials = {
  token: null,
  username: null,
  sonarToken: null,
  sonarType: null,
  sonarUrl: null,
  wakaTimeToken: null,
  platform: null,
};

const readCredentials = (authService: AsyncAuthenticationService): StoredCredentials => {
  const storedSonarType = authService.getSonarType();
  const storedPlatform = authService.getPlatform();

  return {
    token: authService.getToken(),
    username: authService.getUsername(),
    sonarToken: authService.getSonarToken(),
    sonarType: isSonarType(storedSonarType) ? storedSonarType : null,
    sonarUrl: authService.getSonarUrl(),
    wakaTimeToken: authService.getWakaTimeToken(),
    platform: isPlatform(storedPlatform) ? storedPlatform : null,
  };
};

const applySonar = (
  authService: AsyncAuthenticationService,
  sonar: SonarLoginInfo | null,
): Pick<StoredCredentials, "sonarToken" | "sonarType" | "sonarUrl"> => {
  if (!sonar) {
    authService.clearSonar();
    return { sonarToken: null, sonarType: null, sonarUrl: null };
  }

  if (sonar.url) {
    authService.setSonarUrl(sonar.url);
  } else {
    authService.clearSonar();
  }
  authService.setSonarToken(sonar.token);
  authService.setSonarType(sonar.type);

  return { sonarToken: sonar.token, sonarType: sonar.type, sonarUrl: sonar.url ?? null };
};

export const useAuthentication = (
  authService: AsyncAuthenticationService,
  config: CodeHealthConfig,
): UseAuthenticationResult => {
  const [isReady, setIsReady] = useState(() => authService.isReady());
  const [credentials, setCredentials] = useState<StoredCredentials>(() =>
    authService.isReady() ? readCredentials(authService) : EMPTY_CREDENTIALS,
  );

  useEffect(() => {
    let cancelled = false;
    authService.whenReady().then(() => {
      if (cancelled) return;
      setCredentials(readCredentials(authService));
      setIsReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [authService]);

  const updateVcsCredentials = useCallback(
    (newToken: string, newUsername: string, newPlatform: Platform) => {
      authService.setToken(newToken);
      authService.setUsername(newUsername);
      authService.setPlatform(newPlatform);
      setCredentials((prev) => ({
        ...prev,
        token: newToken,
        username: newUsername,
        platform: newPlatform,
      }));
    },
    [authService],
  );

  const updateSonarConfig = useCallback(
    (sonar: SonarLoginInfo | null) => {
      const applied = applySonar(authService, sonar);
      setCredentials((prev) => ({ ...prev, ...applied }));
    },
    [authService],
  );

  const updateWakaTimeToken = useCallback(
    (newToken: string | null) => {
      if (newToken) {
        authService.setWakaTimeToken(newToken);
      } else {
        authService.clearWakaTimeToken();
      }
      setCredentials((prev) => ({ ...prev, wakaTimeToken: newToken }));
    },
    [authService],
  );

  const login = useCallback(
    (
      newToken: string,
      newUsername: string,
      loginCredentials: LoginCredentials,
      newPlatform: Platform,
    ) => {
      updateVcsCredentials(newToken, newUsername, newPlatform);
      updateSonarConfig(loginCredentials.sonar);
      updateWakaTimeToken(loginCredentials.wakaTimeToken);
    },
    [updateVcsCredentials, updateSonarConfig, updateWakaTimeToken],
  );

  const logout = useCallback(() => {
    authService.clearToken();
    setCredentials(EMPTY_CREDENTIALS);
  }, [authService]);

  const effectivePlatform = config.platform ?? credentials.platform;
  const effectiveOrganization = config.organization ?? credentials.username;

  const isConfigured = useMemo(() => {
    if (!effectivePlatform || !effectiveOrganization) return false;
    return config.proxied[effectivePlatform] || Boolean(credentials.token);
  }, [config, credentials.token, effectiveOrganization, effectivePlatform]);

  return {
    isReady,
    ...credentials,
    effectivePlatform,
    effectiveOrganization,
    isConfigured,
    login,
    logout,
    updateVcsCredentials,
    updateSonarConfig,
    updateWakaTimeToken,
  };
};
