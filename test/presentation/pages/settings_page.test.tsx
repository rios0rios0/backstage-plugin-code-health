import { fireEvent, render, screen } from "@testing-library/react";
import { SettingsPage } from "../../../src/presentation/pages/settings_page";
import { aGitforgeConfig } from "../../builders/gitforge_config_builder";

const defaultProps = {
  token: "ghp_test123",
  username: "testuser",
  platform: "github" as const,
  sonarToken: "squ_sonar123",
  sonarType: "cloud" as const,
  sonarUrl: null,
  wakaTimeToken: "wk_test123",
  onUpdateVcs: jest.fn(),
  onUpdateSonar: jest.fn(),
  onUpdateWakaTime: jest.fn(),
};

describe("SettingsPage", () => {
  it("should render three integration cards when all integrations are configured", () => {
    // given / when
    render(<SettingsPage {...defaultProps} />);

    // then
    expect(screen.getByRole("heading", { name: "GitHub" })).toBeInTheDocument();
    expect(screen.getByText("Code Quality (Sonar)")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "WakaTime" })).toBeInTheDocument();
    expect(screen.getAllByText("Connected")).toHaveLength(3);
  });

  it("should render Sonar card as disconnected when no Sonar token exists", () => {
    // given
    const props = { ...defaultProps, sonarToken: null, sonarType: null, onUpdateSonar: jest.fn() };

    // when
    render(<SettingsPage {...props} />);

    // then
    expect(screen.getAllByText("Connected")).toHaveLength(2);
    expect(screen.getByText("Disconnected")).toBeInTheDocument();
  });

  it("should call onUpdateSonar with null when Sonar disconnect button is clicked", () => {
    // given
    const onUpdateSonar = jest.fn();
    render(<SettingsPage {...defaultProps} onUpdateSonar={onUpdateSonar} />);

    // when
    const disconnectButtons = screen.getAllByText("Disconnect");
    fireEvent.click(disconnectButtons[0]);

    // then
    expect(onUpdateSonar).toHaveBeenCalledWith(null);
  });

  it("should call onUpdateWakaTime with null when WakaTime disconnect button is clicked", () => {
    // given
    const onUpdateWakaTime = jest.fn();
    render(<SettingsPage {...defaultProps} onUpdateWakaTime={onUpdateWakaTime} />);

    // when
    const disconnectButtons = screen.getAllByText("Disconnect");
    fireEvent.click(disconnectButtons[1]);

    // then
    expect(onUpdateWakaTime).toHaveBeenCalledWith(null);
  });

  it("should not show disconnect button for VCS card", () => {
    // given / when
    render(<SettingsPage {...defaultProps} />);

    // then
    // VCS card has Edit only, Sonar and WakaTime have Edit + Disconnect = 2 Disconnect buttons total
    expect(screen.getAllByText("Disconnect")).toHaveLength(2);
    expect(screen.getAllByText("Edit")).toHaveLength(3);
  });

  it("should call onUpdateVcs with trimmed values when VCS save is clicked", () => {
    // given
    const onUpdateVcs = jest.fn();
    render(<SettingsPage {...defaultProps} onUpdateVcs={onUpdateVcs} />);

    // enter edit mode for VCS card
    fireEvent.click(screen.getAllByText("Edit")[0]);

    fireEvent.change(screen.getByLabelText("GitHub Username"), {
      target: { value: "  newuser  " },
    });
    fireEvent.change(screen.getByLabelText("Personal Access Token"), {
      target: { value: "  newtoken  " },
    });

    // when
    fireEvent.click(screen.getByText("Save"));

    // then
    expect(onUpdateVcs).toHaveBeenCalledWith("newtoken", "newuser", "github");
  });

  it("should call onUpdateSonar with sonar info when Sonar save is clicked", () => {
    // given
    const onUpdateSonar = jest.fn();
    render(<SettingsPage {...defaultProps} onUpdateSonar={onUpdateSonar} />);

    // enter edit mode for Sonar card (second Edit button)
    fireEvent.click(screen.getAllByText("Edit")[1]);

    // when
    fireEvent.click(screen.getByText("Save"));

    // then
    expect(onUpdateSonar).toHaveBeenCalledWith(
      expect.objectContaining({ type: "cloud", token: "squ_sonar123" }),
    );
  });

  it("should call onUpdateWakaTime with token when WakaTime save is clicked", () => {
    // given
    const onUpdateWakaTime = jest.fn();
    render(<SettingsPage {...defaultProps} onUpdateWakaTime={onUpdateWakaTime} />);

    // enter edit mode for WakaTime card (third Edit button)
    fireEvent.click(screen.getAllByText("Edit")[2]);

    // when
    fireEvent.click(screen.getByText("Save"));

    // then
    expect(onUpdateWakaTime).toHaveBeenCalledWith("wk_test123");
  });

  it("should reset VCS fields when cancel is clicked", () => {
    // given
    render(<SettingsPage {...defaultProps} />);
    fireEvent.click(screen.getAllByText("Edit")[0]);

    fireEvent.change(screen.getByLabelText("GitHub Username"), {
      target: { value: "changed" },
    });

    // when
    fireEvent.click(screen.getByText("Cancel"));

    // then
    fireEvent.click(screen.getAllByText("Edit")[0]);
    expect(screen.getByLabelText("GitHub Username")).toHaveValue("testuser");
  });

  it("should render Azure DevOps label when platform is azure-devops", () => {
    // given
    const props = { ...defaultProps, platform: "azure-devops" as const };

    // when
    render(<SettingsPage {...props} />);

    // then
    expect(screen.getByRole("heading", { name: "Azure DevOps" })).toBeInTheDocument();
  });

  it("should show SonarQube URL field when sonarType is qube", () => {
    // given
    const props = {
      ...defaultProps,
      sonarType: "qube" as const,
      sonarUrl: "https://sonar.local",
    };

    // when
    render(<SettingsPage {...props} />);

    // then
    fireEvent.click(screen.getAllByText("Edit")[1]);
    expect(screen.getByLabelText("SonarQube Instance URL")).toBeInTheDocument();
  });

  it("should call onUpdateSonar with null when sonar type is set to none and saved", () => {
    // given
    const onUpdateSonar = jest.fn();
    render(<SettingsPage {...defaultProps} onUpdateSonar={onUpdateSonar} />);

    // enter edit mode
    fireEvent.click(screen.getAllByText("Edit")[1]);

    // set to None
    fireEvent.click(screen.getByText("None"));

    // when
    fireEvent.click(screen.getByText("Save"));

    // then
    expect(onUpdateSonar).toHaveBeenCalledWith(null);
  });

  it("should call onUpdateWakaTime with null when empty and saved", () => {
    // given
    const onUpdateWakaTime = jest.fn();
    render(<SettingsPage {...defaultProps} onUpdateWakaTime={onUpdateWakaTime} />);

    // enter edit mode
    fireEvent.click(screen.getAllByText("Edit")[2]);

    // clear token
    fireEvent.change(screen.getByLabelText("API Key"), {
      target: { value: "" },
    });

    // when
    fireEvent.click(screen.getByText("Save"));

    // then
    expect(onUpdateWakaTime).toHaveBeenCalledWith(null);
  });

  it("should lock the fields an administrator pinned in app-config", () => {
    // given
    const config = aGitforgeConfig({ platform: "github", organization: "acme" });

    // when
    render(<SettingsPage {...defaultProps} config={config} />);
    fireEvent.click(screen.getAllByText("Edit")[0]);

    // then
    expect(screen.getByText(/cannot be changed here/)).toBeInTheDocument();
    expect(screen.getByLabelText("GitHub Username")).toBeDisabled();
    expect(screen.getByLabelText("Personal Access Token")).not.toBeDisabled();
  });

  it("should explain that a proxied platform needs no personal token", () => {
    // given
    const config = aGitforgeConfig({ proxied: { github: true } });

    // when
    render(<SettingsPage {...defaultProps} config={config} />);
    fireEvent.click(screen.getAllByText("Edit")[0]);

    // then
    expect(screen.getByText(/no personal token is needed/)).toBeInTheDocument();
    expect(screen.getByLabelText("Personal Access Token")).toBeDisabled();
  });

  it("should report Sonar as connected when it is reached through a proxy", () => {
    // given
    const config = aGitforgeConfig({ proxied: { sonar: true } });
    const props = { ...defaultProps, sonarToken: null, sonarType: null };

    // when
    render(<SettingsPage {...props} config={config} />);

    // then
    expect(screen.getAllByText("Connected")).toHaveLength(3);
  });

  it("should call onForgetCredentials when the user clears everything", () => {
    // given
    const onForgetCredentials = jest.fn();
    render(<SettingsPage {...defaultProps} onForgetCredentials={onForgetCredentials} />);

    // when
    fireEvent.click(screen.getByText("Forget all credentials"));

    // then
    expect(onForgetCredentials).toHaveBeenCalled();
  });
});
