import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { GapList as GapListData } from "../../../../src/domain/entities/insights";
import { GapList } from "../../../../src/presentation/components/charts/gap_list";

const renderList = (gaps: GapListData, emptyMessage = "Nothing to show.") =>
  render(
    <MemoryRouter>
      <GapList gaps={gaps} emptyMessage={emptyMessage} />
    </MemoryRouter>,
  );

describe("GapList", () => {
  it("should name each repository and the evidence that listed it", () => {
    // given
    const gaps: GapListData = {
      items: [
        {
          id: "1",
          label: "gateway",
          entityRef: "component:default/gateway",
          reason: "has a docs/ tree",
        },
      ],
      remaining: 0,
    };

    // when
    renderList(gaps);

    // then
    // "Eleven repositories have no documentation" is not actionable until a
    // reader knows the eleven.
    expect(screen.getByText("gateway")).toBeInTheDocument();
    expect(screen.getByText("has a docs/ tree")).toBeInTheDocument();
  });

  it("should link a row to its catalog entity", () => {
    // given
    const gaps: GapListData = {
      items: [
        {
          id: "1",
          label: "gateway",
          entityRef: "component:default/gateway",
          reason: "nothing found",
        },
      ],
      remaining: 0,
    };

    // when
    renderList(gaps);

    // then
    // The entity page is where the annotation that closes the gap gets written.
    expect(screen.getByRole("link", { name: "gateway" })).toHaveAttribute(
      "href",
      "/catalog/default/component/gateway",
    );
  });

  it("should degrade a malformed reference to plain text", () => {
    // given
    const gaps: GapListData = {
      items: [{ id: "1", label: "gateway", entityRef: "not-a-ref", reason: "nothing found" }],
      remaining: 0,
    };

    // when
    renderList(gaps);

    // then
    // A reference the catalog cannot address should read as text rather than as
    // a link that would 404.
    expect(screen.queryByRole("link", { name: "gateway" })).not.toBeInTheDocument();
    expect(screen.getByText("gateway")).toBeInTheDocument();
  });

  it("should render a row with no entity at all", () => {
    // given
    const gaps: GapListData = {
      items: [{ id: "1", label: "gateway", entityRef: null, reason: "nothing found" }],
      remaining: 0,
    };

    // when
    renderList(gaps);

    // then
    expect(screen.queryByRole("link", { name: "gateway" })).not.toBeInTheDocument();
  });

  it("should say how many rows it did not show", () => {
    // given
    const gaps: GapListData = {
      items: [{ id: "1", label: "gateway", entityRef: null, reason: "nothing found" }],
      remaining: 12,
    };

    // when
    renderList(gaps);

    // then
    // A truncated list that says nothing reads as a complete one.
    expect(screen.getByText("and 12 more")).toBeInTheDocument();
  });

  it("should say so when there is no gap to report", () => {
    // given / when
    renderList({ items: [], remaining: 0 }, "Everything is documented.");

    // then
    expect(screen.getByText("Everything is documented.")).toBeInTheDocument();
  });
});
