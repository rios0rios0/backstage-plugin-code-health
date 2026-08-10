import { fireEvent, render, screen } from "@testing-library/react";
import type { BadgeStatus } from "@rios0rios0/backstage-plugin-code-health-common";
import { BadgeStatusCell } from "../../../src/presentation/components/badge_status_cell";

const greenStatus: BadgeStatus = {
  checks: [
    { label: "Latest Release", present: true },
    { label: "License", present: true },
    { label: "Build Status", present: true },
    { label: "SonarCloud Coverage", present: true },
    { label: "SonarCloud Quality Gate", present: true },
    { label: "OpenSSF Best Practices", present: true },
  ],
  color: "green",
};

const yellowStatus: BadgeStatus = {
  checks: [
    { label: "Latest Release", present: true },
    { label: "License", present: true },
    { label: "Build Status", present: false },
    { label: "SonarCloud Coverage", present: false },
    { label: "SonarCloud Quality Gate", present: false },
    { label: "OpenSSF Best Practices", present: false },
  ],
  color: "yellow",
};

describe("BadgeStatusCell", () => {
  it("should render dash when status is null", () => {
    // given / when
    render(<BadgeStatusCell status={null} />);

    // then
    expect(screen.getByText("-")).toBeInTheDocument();
  });

  it("should render Complete for green status", () => {
    // given / when
    render(<BadgeStatusCell status={greenStatus} />);

    // then
    expect(screen.getByText("Complete")).toBeInTheDocument();
  });

  it("should render Incomplete for yellow status", () => {
    // given / when
    render(<BadgeStatusCell status={yellowStatus} />);

    // then
    expect(screen.getByText("Incomplete")).toBeInTheDocument();
  });

  it("should show popup with badge details when clicked", () => {
    // given
    render(<BadgeStatusCell status={yellowStatus} />);

    // when
    fireEvent.click(screen.getByText("Incomplete"));

    // then
    expect(screen.getByText("Latest Release")).toBeInTheDocument();
    expect(screen.getByText("License")).toBeInTheDocument();
    expect(screen.getByText("Build Status")).toBeInTheDocument();
    expect(screen.getByText("OpenSSF Best Practices")).toBeInTheDocument();
  });

  it("should close popup when overlay is clicked", () => {
    // given
    render(<BadgeStatusCell status={greenStatus} />);
    fireEvent.click(screen.getByText("Complete"));
    expect(screen.getByText("Latest Release")).toBeInTheDocument();

    // when
    fireEvent.click(screen.getByTestId("badge-overlay"));

    // then
    expect(screen.queryByText("Latest Release")).not.toBeInTheDocument();
  });

  it("should close popup when Escape key is pressed", () => {
    // given
    render(<BadgeStatusCell status={greenStatus} />);
    fireEvent.click(screen.getByText("Complete"));
    expect(screen.getByText("Latest Release")).toBeInTheDocument();

    // when
    fireEvent.keyDown(document, { key: "Escape" });

    // then
    expect(screen.queryByText("Latest Release")).not.toBeInTheDocument();
  });
});
