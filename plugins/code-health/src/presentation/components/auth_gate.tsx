import { useState } from "react";
import Box from "@material-ui/core/Box";
import Button from "@material-ui/core/Button";
import Card from "@material-ui/core/Card";
import CardContent from "@material-ui/core/CardContent";
import TextField from "@material-ui/core/TextField";
import Typography from "@material-ui/core/Typography";
import { WarningPanel } from "@backstage/core-components";
import type { Platform } from "@rios0rios0/backstage-plugin-code-health-common";
import type { SonarType } from "../../domain/entities/sonar_type";
import type { LoginCredentials, SonarLoginInfo } from "../hooks/use_authentication";
import type { ToggleOption } from "./option_toggle";
import { OptionToggle } from "./option_toggle";

interface AuthGateProps {
  onLogin: (
    token: string,
    username: string,
    credentials: LoginCredentials,
    platform: Platform,
  ) => void;
  error: string | null;
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

export const AuthGate = ({ onLogin, error }: AuthGateProps) => {
  const [platform, setPlatform] = useState<Platform>("github");
  const [token, setToken] = useState("");
  const [username, setUsername] = useState("");
  const [sonarType, setSonarType] = useState<SonarType | "none">("none");
  const [sonarToken, setSonarToken] = useState("");
  const [sonarUrl, setSonarUrl] = useState("");
  const [wakaTimeToken, setWakaTimeToken] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!token.trim() || !username.trim()) return;

    const sonar: SonarLoginInfo | null =
      sonarType !== "none" && sonarToken.trim()
        ? {
            type: sonarType,
            token: sonarToken.trim(),
            url: sonarType === "qube" ? sonarUrl.trim() || undefined : undefined,
          }
        : null;

    const credentials: LoginCredentials = {
      sonar,
      wakaTimeToken: wakaTimeToken.trim() || null,
    };

    onLogin(token.trim(), username.trim(), credentials, platform);
  };

  const isGitHub = platform === "github";

  return (
    <Box display="flex" justifyContent="center" pt={2}>
      <Card style={{ width: "100%", maxWidth: 560 }}>
        <CardContent>
          <Typography variant="h5" gutterBottom>
            Connect Code Health
          </Typography>
          <Typography variant="body2" color="textSecondary" paragraph>
            Connect to your repositories to view CI status, releases, compliance and contributor
            metrics. An administrator can also configure this centrally through a Backstage proxy
            endpoint, in which case no token is required here.
          </Typography>

          <Box mb={3}>
            <OptionToggle
              ariaLabel="Platform"
              value={platform}
              options={PLATFORM_OPTIONS}
              onChange={setPlatform}
            />
          </Box>

          <form onSubmit={handleSubmit}>
            <Box display="flex" flexDirection="column" gridGap={16}>
              <TextField
                id="username"
                label={isGitHub ? "GitHub Username" : "Organization Name"}
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder={isGitHub ? "your-username" : "your-organization"}
                variant="outlined"
                size="small"
                fullWidth
                required
              />

              <TextField
                id="token"
                label="Personal Access Token"
                type="password"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder={isGitHub ? "ghp_... or github_pat_..." : "your ADO PAT"}
                variant="outlined"
                size="small"
                fullWidth
                required
              />

              <Box>
                <Typography variant="subtitle2" gutterBottom>
                  Code Quality Integration{" "}
                  <Typography variant="caption" color="textSecondary" component="span">
                    (optional)
                  </Typography>
                </Typography>
                <OptionToggle
                  ariaLabel="Code quality integration"
                  value={sonarType}
                  options={SONAR_OPTIONS}
                  onChange={setSonarType}
                />
              </Box>

              {sonarType !== "none" && (
                <>
                  {sonarType === "qube" && (
                    <TextField
                      id="sonarUrl"
                      label="SonarQube Instance URL"
                      type="url"
                      value={sonarUrl}
                      onChange={(e) => setSonarUrl(e.target.value)}
                      placeholder="https://sonarqube.example.com"
                      variant="outlined"
                      size="small"
                      fullWidth
                      required
                    />
                  )}
                  <TextField
                    id="sonarToken"
                    label={sonarType === "cloud" ? "SonarCloud Token" : "SonarQube Token"}
                    type="password"
                    value={sonarToken}
                    onChange={(e) => setSonarToken(e.target.value)}
                    placeholder="your Sonar token"
                    variant="outlined"
                    size="small"
                    fullWidth
                  />
                </>
              )}

              <TextField
                id="wakaTimeToken"
                label="WakaTime API Key (optional)"
                type="password"
                value={wakaTimeToken}
                onChange={(e) => setWakaTimeToken(e.target.value)}
                placeholder="skip or paste your WakaTime API key"
                helperText="Leave blank to skip. Time tracking columns will be hidden."
                variant="outlined"
                size="small"
                fullWidth
              />

              {error && (
                <WarningPanel
                  severity="error"
                  title="Connection failed"
                  message={error}
                  defaultExpanded
                />
              )}

              <Button type="submit" color="primary" variant="contained" fullWidth>
                Connect
              </Button>
            </Box>
          </form>

          <Box mt={3}>
            <Typography variant="caption" color="textSecondary">
              Tokens are encrypted with Web Crypto AES-GCM and stored only in your browser. They are
              sent exclusively to the APIs they belong to, never to the Backstage backend, unless
              your administrator configured a proxy endpoint.
            </Typography>
          </Box>
        </CardContent>
      </Card>
    </Box>
  );
};
