import { render, screen } from "@testing-library/react";
import type { ComplianceStatus } from "../../../src/domain/entities/compliance_status";
import { ComplianceBadge } from "../../../src/presentation/components/compliance_badge";

describe("ComplianceBadge", () => {
  it("should render dash when status is null", () => {
    // given / when
    render(<ComplianceBadge status={null} />);

    // then
    expect(screen.getByText("-")).toBeInTheDocument();
  });

  it("should render Compliant for green status", () => {
    // given
    const status: ComplianceStatus = {
      pipelineExists: true,
      buildPolicyOnPRs: true,
      buildPolicyExpiration: true,
      branchProtection: true,
      color: "green",
    };

    // when
    render(<ComplianceBadge status={status} />);

    // then
    expect(screen.getByText("Compliant")).toBeInTheDocument();
  });

  it("should render Partial for yellow status", () => {
    // given
    const status: ComplianceStatus = {
      pipelineExists: false,
      buildPolicyOnPRs: true,
      buildPolicyExpiration: true,
      branchProtection: true,
      color: "yellow",
    };

    // when
    render(<ComplianceBadge status={status} />);

    // then
    expect(screen.getByText("Partial")).toBeInTheDocument();
  });

  it("should render Non-compliant for red status", () => {
    // given
    const status: ComplianceStatus = {
      pipelineExists: false,
      buildPolicyOnPRs: false,
      buildPolicyExpiration: false,
      branchProtection: false,
      color: "red",
    };

    // when
    render(<ComplianceBadge status={status} />);

    // then
    expect(screen.getByText("Non-compliant")).toBeInTheDocument();
  });

  it("should include check details in title tooltip", () => {
    // given
    const status: ComplianceStatus = {
      pipelineExists: true,
      buildPolicyOnPRs: false,
      buildPolicyExpiration: true,
      branchProtection: true,
      color: "yellow",
    };

    // when
    render(<ComplianceBadge status={status} />);

    // then
    const badge = screen.getByText("Partial").closest("[title]");
    expect(badge?.getAttribute("title")).toContain("\u2713 Pipeline exists");
    expect(badge?.getAttribute("title")).toContain("\u2717 Build policy on PRs");
    expect(badge?.getAttribute("title")).toContain("\u2713 Build policy expiration");
    expect(badge?.getAttribute("title")).toContain("\u2713 Branch protection");
  });
});
