import { render, screen } from "@testing-library/react";
import { StatusBadge } from "../../../src/presentation/components/status_badge";

describe("StatusBadge", () => {
  it("should render 'Passing' when CI state is SUCCESS", () => {
    // given / when
    render(<StatusBadge state="SUCCESS" />);

    // then
    expect(screen.getByText("Passing")).toBeInTheDocument();
  });

  it("should render 'Failing' when CI state is FAILURE", () => {
    // given / when
    render(<StatusBadge state="FAILURE" />);

    // then
    expect(screen.getByText("Failing")).toBeInTheDocument();
  });

  it("should render 'Error' when CI state is ERROR", () => {
    // given / when
    render(<StatusBadge state="ERROR" />);

    // then
    expect(screen.getByText("Error")).toBeInTheDocument();
  });

  it("should render 'Pending' when CI state is PENDING", () => {
    // given / when
    render(<StatusBadge state="PENDING" />);

    // then
    expect(screen.getByText("Pending")).toBeInTheDocument();
  });

  it("should render 'No CI' when state is null", () => {
    // given / when
    render(<StatusBadge state={null} />);

    // then
    expect(screen.getByText("No CI")).toBeInTheDocument();
  });
});
