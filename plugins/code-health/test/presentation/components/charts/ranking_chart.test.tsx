import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { RankedItem } from "../../../../src/domain/entities/insights";
import { RankingChart } from "../../../../src/presentation/components/charts/ranking_chart";

const anItem = (overrides: Partial<RankedItem> = {}): RankedItem => ({
  id: "jane",
  label: "Jane",
  value: 12,
  detail: "3 repos",
  entityRef: "user:default/jane",
  avatarUrl: null,
  ...overrides,
});

const renderChart = (items: RankedItem[], linkTo?: (item: RankedItem) => string | null) =>
  render(
    <MemoryRouter>
      <RankingChart items={items} unit="commits" emptyMessage="Nobody." linkTo={linkTo} />
    </MemoryRouter>,
  );

describe("RankingChart", () => {
  it("should link a row to its catalog entity by default", () => {
    // given / when
    renderChart([anItem()]);

    // then
    expect(screen.getByRole("link", { name: "Jane" })).toHaveAttribute(
      "href",
      "/catalog/default/user/jane",
    );
  });

  it("should link a row wherever the caller points it", () => {
    // given / when
    renderChart([anItem()], (item) => `/contributors/person?key=${encodeURIComponent(item.id)}`);

    // then
    expect(screen.getByRole("link", { name: "Jane" })).toHaveAttribute(
      "href",
      "/contributors/person?key=jane",
    );
  });

  it("should leave a row as plain text when there is nowhere to link", () => {
    // given / when
    renderChart([anItem({ entityRef: null })]);

    // then
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(screen.getByText("Jane")).toBeInTheDocument();
  });

  it("should say so when there is nothing to rank", () => {
    // given / when
    renderChart([]);

    // then
    expect(screen.getByText("Nobody.")).toBeInTheDocument();
  });
});
