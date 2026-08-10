import { render, screen } from "@testing-library/react";
import { BackfillProgress } from "../../../src/presentation/components/backfill_progress";
import { aCoverageInfo } from "../../doubles/stub_coverage_service";

describe("BackfillProgress", () => {
  it("should explain how far the history collection has got", () => {
    // given
    // Without this, a freshly installed plugin looks broken: the range picker
    // offers only the last day and nobody can tell whether that is a failure or
    // a backfill still running.
    const coverage = aCoverageInfo({
      backfill: { repositories: 4, complete: 1, percent: 32.5 },
    });

    // when
    render(<BackfillProgress coverage={coverage} />);

    // then
    expect(screen.getByText(/Collecting history: 32.5%/)).toBeInTheDocument();
    expect(screen.getByText(/across 4 repositories/)).toBeInTheDocument();
  });

  it("should disappear once the history is complete", () => {
    // given
    const coverage = aCoverageInfo({ backfill: { repositories: 4, percent: 100 } });

    // when
    render(<BackfillProgress coverage={coverage} />);

    // then
    expect(screen.queryByText(/Collecting history/)).not.toBeInTheDocument();
  });

  it("should show nothing when no repository is tracked", () => {
    // given
    const coverage = aCoverageInfo({ backfill: { repositories: 0, percent: 0 } });

    // when
    render(<BackfillProgress coverage={coverage} />);

    // then
    expect(screen.queryByText(/Collecting history/)).not.toBeInTheDocument();
  });

  it("should say when repositories are failing to ingest", () => {
    // given
    // A silent partial backfill would look like a slow one, and nobody would go
    // looking for the credential or permission that is actually missing.
    const coverage = aCoverageInfo({
      backfill: { repositories: 4, percent: 20, failing: 2 },
    });

    // when
    render(<BackfillProgress coverage={coverage} />);

    // then
    expect(screen.getByText(/2 repositories are failing to ingest/)).toBeInTheDocument();
  });

  it("should say it in the singular for one failing repository", () => {
    // given
    const coverage = aCoverageInfo({
      backfill: { repositories: 1, percent: 20, failing: 1 },
    });

    // when
    render(<BackfillProgress coverage={coverage} />);

    // then
    expect(screen.getByText(/1 repository is failing to ingest/)).toBeInTheDocument();
    expect(screen.getByText(/across 1 repository\./)).toBeInTheDocument();
  });
});
