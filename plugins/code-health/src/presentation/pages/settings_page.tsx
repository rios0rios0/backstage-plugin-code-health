import { useState } from "react";
import Box from "@material-ui/core/Box";
import Button from "@material-ui/core/Button";
import TextField from "@material-ui/core/TextField";
import Typography from "@material-ui/core/Typography";
import { ContentHeader } from "@backstage/core-components";
import type { CodeHealthConfig } from "../../domain/entities/code_health_config";
import { EMPTY_CODE_HEALTH_CONFIG } from "../../domain/entities/code_health_config";
import type { Platform } from "../../domain/entities/platform";
import type { SonarType } from "../../domain/entities/sonar_type";
import { IntegrationCard } from "../components/integration_card";
import type { ToggleOption } from "../components/option_toggle";
import { OptionToggle } from "../components/option_toggle";
import type { SonarLoginInfo } from "../hooks/use_authentication";

interface SettingsPageProps {
  token: string;
  username: string;
  platform: Platform;
  sonarToken: string | null;
  sonarType: SonarType | null;
  sonarUrl: string | null;
  wakaTimeToken: string | null;
  config?: CodeHealthConfig;
  onUpdateVcs: (token: string, username: string, platform: Platform) => void;
  onUpdateSonar: (sonar: SonarLoginInfo | null) => void;
  onUpdateWakaTime: (token: string | null) => void;
  onForgetCredentials?: () => void;
}

const PLATFORM_OPTIONS: readonly ToggleOption<Platform>[] = [
  { value: "github", label: "GitHub" },
  { value: "azure-devops", label: "Azure DevOps" },
];

const SONAR_OPTIONS: readonly ToggleOption<SonarType | "none">[] = [
  { value: "none", label: "None" },
  { value: "cloud", label: "SonarCloud" },
  { value: "qube", label: "SonarQube" },
];

const MANAGED_NOTE =
  "Some values come from `codeHealth` in app-config.yaml and cannot be changed here.";
const PROXY_NOTE =
  "Requests are routed through a Backstage proxy endpoint, so no personal token is needed.";

const resolveManagedNote = (proxied: boolean, hasManagedFields: boolean): string | undefined => {
  if (proxied) return PROXY_NOTE;
  if (hasManagedFields) return MANAGED_NOTE;
  return undefined;
};

export const SettingsPage = ({
  token,
  username,
  platform,
  sonarToken,
  sonarType,
  sonarUrl,
  wakaTimeToken,
  config = EMPTY_CODE_HEALTH_CONFIG,
  onUpdateVcs,
  onUpdateSonar,
  onUpdateWakaTime,
  onForgetCredentials,
}: SettingsPageProps) => {
  const [vcsToken, setVcsToken] = useState(token);
  const [vcsUsername, setVcsUsername] = useState(username);
  const [vcsPlatform, setVcsPlatform] = useState<Platform>(platform);

  const [localSonarType, setLocalSonarType] = useState<SonarType | "none">(sonarType ?? "none");
  const [localSonarToken, setLocalSonarToken] = useState(sonarToken ?? "");
  const [localSonarUrl, setLocalSonarUrl] = useState(sonarUrl ?? "");

  const [localWakaTimeToken, setLocalWakaTimeToken] = useState(wakaTimeToken ?? "");

  const handleVcsSave = () => {
    if (vcsToken.trim() && vcsUsername.trim()) {
      onUpdateVcs(vcsToken.trim(), vcsUsername.trim(), vcsPlatform);
    }
  };

  const handleSonarSave = () => {
    const trimmedToken = localSonarToken.trim();
    const trimmedUrl = localSonarUrl.trim();

    if (localSonarType === "none" || !trimmedToken) {
      onUpdateSonar(null);
      return;
    }

    if (localSonarType === "qube" && !trimmedUrl) {
      return;
    }

    onUpdateSonar({
      type: localSonarType,
      token: trimmedToken,
      url: localSonarType === "qube" ? trimmedUrl : undefined,
    });
  };

  const handleSonarDisconnect = () => {
    onUpdateSonar(null);
    setLocalSonarType("none");
    setLocalSonarToken("");
    setLocalSonarUrl("");
  };

  const handleWakaTimeSave = () => {
    const trimmed = localWakaTimeToken.trim();
    onUpdateWakaTime(trimmed || null);
  };

  const handleVcsCancel = () => {
    setVcsToken(token);
    setVcsUsername(username);
    setVcsPlatform(platform);
  };

  const handleSonarCancel = () => {
    setLocalSonarType(sonarType ?? "none");
    setLocalSonarToken(sonarToken ?? "");
    setLocalSonarUrl(sonarUrl ?? "");
  };

  const handleWakaTimeDisconnect = () => {
    onUpdateWakaTime(null);
    setLocalWakaTimeToken("");
  };

  const handleWakaTimeCancel = () => {
    setLocalWakaTimeToken(wakaTimeToken ?? "");
  };

  const isGitHub = vcsPlatform === "github";
  const vcsProxied = config.proxied[vcsPlatform];
  const vcsHasManagedFields = Boolean(config.platform || config.organization);
  const vcsManagedNote = resolveManagedNote(vcsProxied, vcsHasManagedFields);

  return (
    <>
      <ContentHeader title="Settings">
        {onForgetCredentials && (
          <Button size="small" variant="outlined" onClick={onForgetCredentials}>
            Forget all credentials
          </Button>
        )}
      </ContentHeader>

      <Box mb={2}>
        <Typography variant="body2" color="textSecondary">
          Manage your integration tokens. Tokens are encrypted with Web Crypto AES-GCM and stored
          only in your browser.
        </Typography>
      </Box>

      <Box display="flex" flexDirection="column" gridGap={16}>
        <IntegrationCard
          title={isGitHub ? "GitHub" : "Azure DevOps"}
          description="Version control platform for repository data, CI status, and releases."
          status="connected"
          isRequired
          managedNote={vcsManagedNote}
          onSave={handleVcsSave}
          onCancel={handleVcsCancel}
        >
          {(editing) => (
            <>
              <OptionToggle
                ariaLabel="Platform"
                value={vcsPlatform}
                options={PLATFORM_OPTIONS}
                disabled={!editing || config.platform !== null}
                onChange={setVcsPlatform}
              />
              <TextField
                id="vcsUsername"
                label={isGitHub ? "GitHub Username" : "Organization Name"}
                value={vcsUsername}
                onChange={(e) => setVcsUsername(e.target.value)}
                disabled={!editing || config.organization !== null}
                variant="outlined"
                size="small"
                fullWidth
              />
              <TextField
                id="vcsToken"
                label="Personal Access Token"
                type="password"
                value={vcsToken}
                onChange={(e) => setVcsToken(e.target.value)}
                disabled={!editing || vcsProxied}
                variant="outlined"
                size="small"
                fullWidth
              />
            </>
          )}
        </IntegrationCard>

        <IntegrationCard
          title="Code Quality (Sonar)"
          description="SonarCloud or SonarQube integration for code quality and security metrics."
          status={sonarToken || config.proxied.sonar ? "connected" : "disconnected"}
          managedNote={config.proxied.sonar ? PROXY_NOTE : undefined}
          onSave={handleSonarSave}
          onCancel={handleSonarCancel}
          onDisconnect={handleSonarDisconnect}
        >
          {(editing) => (
            <>
              <OptionToggle
                ariaLabel="Code quality integration"
                value={localSonarType}
                options={SONAR_OPTIONS}
                disabled={!editing || config.sonarType !== null}
                onChange={setLocalSonarType}
              />
              {localSonarType !== "none" && (
                <>
                  {localSonarType === "qube" && (
                    <TextField
                      id="sonarUrl"
                      label="SonarQube Instance URL"
                      type="url"
                      value={localSonarUrl}
                      onChange={(e) => setLocalSonarUrl(e.target.value)}
                      disabled={!editing || config.sonarBaseUrl !== null}
                      placeholder="https://sonarqube.example.com"
                      variant="outlined"
                      size="small"
                      fullWidth
                    />
                  )}
                  <TextField
                    id="sonarToken"
                    label={localSonarType === "cloud" ? "SonarCloud Token" : "SonarQube Token"}
                    type="password"
                    value={localSonarToken}
                    onChange={(e) => setLocalSonarToken(e.target.value)}
                    disabled={!editing || config.proxied.sonar}
                    placeholder="your Sonar token"
                    variant="outlined"
                    size="small"
                    fullWidth
                  />
                </>
              )}
            </>
          )}
        </IntegrationCard>

        <IntegrationCard
          title="WakaTime"
          description="Time tracking integration for per-contributor coding time metrics."
          status={wakaTimeToken || config.proxied.wakatime ? "connected" : "disconnected"}
          managedNote={config.proxied.wakatime ? PROXY_NOTE : undefined}
          onSave={handleWakaTimeSave}
          onCancel={handleWakaTimeCancel}
          onDisconnect={handleWakaTimeDisconnect}
        >
          {(editing) => (
            <TextField
              id="wakaTimeToken"
              label="API Key"
              type="password"
              value={localWakaTimeToken}
              onChange={(e) => setLocalWakaTimeToken(e.target.value)}
              disabled={!editing || config.proxied.wakatime}
              placeholder="your WakaTime API key"
              variant="outlined"
              size="small"
              fullWidth
            />
          )}
        </IntegrationCard>
      </Box>
    </>
  );
};
