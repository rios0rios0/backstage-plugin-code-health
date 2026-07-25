import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { AuthGate } from "../../../src/presentation/components/auth_gate";

describe("AuthGate", () => {
  const defaultProps = {
    onLogin: vi.fn(),
    error: null,
  };

  it("should render platform toggle with GitHub selected by default", () => {
    // given / when
    render(<AuthGate {...defaultProps} />);

    // then
    expect(screen.getByRole("button", { name: "GitHub" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Azure DevOps" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it("should switch to Azure DevOps platform on click", () => {
    // given
    render(<AuthGate {...defaultProps} />);

    // when
    fireEvent.click(screen.getByText("Azure DevOps"));

    // then
    expect(screen.getByRole("button", { name: "Azure DevOps" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: "GitHub" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it("should show username label as 'GitHub Username' for github platform", () => {
    // given / when
    render(<AuthGate {...defaultProps} />);

    // then
    expect(screen.getByLabelText(/GitHub Username/)).toBeInTheDocument();
  });

  it("should show username label as 'Organization Name' for azure-devops platform", () => {
    // given
    render(<AuthGate {...defaultProps} />);

    // when
    fireEvent.click(screen.getByText("Azure DevOps"));

    // then
    expect(screen.getByLabelText(/Organization Name/)).toBeInTheDocument();
  });

  it("should call onLogin with trimmed credentials on submit", () => {
    // given
    const onLogin = vi.fn();
    render(<AuthGate onLogin={onLogin} error={null} />);

    fireEvent.change(screen.getByLabelText(/GitHub Username/), {
      target: { value: "  myuser  " },
    });
    fireEvent.change(screen.getByLabelText(/Personal Access Token/), {
      target: { value: "  ghp_token123  " },
    });

    // when
    fireEvent.click(screen.getByText("Connect"));

    // then
    expect(onLogin).toHaveBeenCalledWith(
      "ghp_token123",
      "myuser",
      expect.objectContaining({ sonar: null, wakaTimeToken: null }),
      "github",
    );
  });

  it("should not call onLogin when token is empty", () => {
    // given
    const onLogin = vi.fn();
    render(<AuthGate onLogin={onLogin} error={null} />);

    fireEvent.change(screen.getByLabelText(/GitHub Username/), {
      target: { value: "myuser" },
    });

    // when
    fireEvent.click(screen.getByText("Connect"));

    // then
    expect(onLogin).not.toHaveBeenCalled();
  });

  it("should not call onLogin when username is empty", () => {
    // given
    const onLogin = vi.fn();
    render(<AuthGate onLogin={onLogin} error={null} />);

    fireEvent.change(screen.getByLabelText(/Personal Access Token/), {
      target: { value: "ghp_token123" },
    });

    // when
    fireEvent.click(screen.getByText("Connect"));

    // then
    expect(onLogin).not.toHaveBeenCalled();
  });

  it("should show Sonar token fields when SonarCloud is selected", () => {
    // given
    render(<AuthGate {...defaultProps} />);

    // when
    fireEvent.click(screen.getByText("SonarCloud"));

    // then
    expect(screen.getByLabelText("SonarCloud Token")).toBeInTheDocument();
  });

  it("should show Sonar URL field when SonarQube is selected", () => {
    // given
    render(<AuthGate {...defaultProps} />);

    // when
    fireEvent.click(screen.getByText("SonarQube"));

    // then
    expect(screen.getByLabelText(/SonarQube Instance URL/)).toBeInTheDocument();
    expect(screen.getByLabelText("SonarQube Token")).toBeInTheDocument();
  });

  it("should hide Sonar fields when None is selected", () => {
    // given
    render(<AuthGate {...defaultProps} />);
    fireEvent.click(screen.getByText("SonarCloud"));

    // when
    fireEvent.click(screen.getByText("None"));

    // then
    expect(screen.queryByLabelText("SonarCloud Token")).not.toBeInTheDocument();
  });

  it("should pass wakaTime token in credentials", () => {
    // given
    const onLogin = vi.fn();
    render(<AuthGate onLogin={onLogin} error={null} />);

    fireEvent.change(screen.getByLabelText(/GitHub Username/), {
      target: { value: "user" },
    });
    fireEvent.change(screen.getByLabelText(/Personal Access Token/), {
      target: { value: "token" },
    });
    fireEvent.change(screen.getByLabelText(/WakaTime API Key/), {
      target: { value: "waka-key" },
    });

    // when
    fireEvent.click(screen.getByText("Connect"));

    // then
    expect(onLogin).toHaveBeenCalledWith(
      "token",
      "user",
      expect.objectContaining({ wakaTimeToken: "waka-key" }),
      "github",
    );
  });

  it("should display error message when error prop is set", () => {
    // given / when
    render(<AuthGate onLogin={vi.fn()} error="Invalid token" />);

    // then
    expect(screen.getByText("Invalid token")).toBeInTheDocument();
  });

  it("should not display error when error is null", () => {
    // given / when
    render(<AuthGate {...defaultProps} />);

    // then
    expect(screen.queryByText("Invalid token")).not.toBeInTheDocument();
  });
});
