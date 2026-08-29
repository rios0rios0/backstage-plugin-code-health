import type {
  ConfluenceContributorMetrics,
  ConfluenceSpaceMetrics,
  ContributorSummary,
  RepositorySummary,
} from "@rios0rios0/backstage-plugin-code-health-common";
import { render, screen } from "@testing-library/react";
import type { ColumnDef } from "@tanstack/react-table";
import { flexRender, getCoreRowModel, useReactTable } from "@tanstack/react-table";
import {
  confluenceContributorColumns,
  confluenceRepositoryColumns,
} from "../../../../src/presentation/components/columns/confluence_columns";
import { ContributorBuilder } from "../../../builders/contributor_builder";
import { RepositoryBuilder } from "../../../builders/repository_builder";

const WINDOW = { from: "2026-05-30T00:00:00.000Z", to: "2026-08-28T00:00:00.000Z" };

const confluence = (
  overrides: Partial<ConfluenceContributorMetrics> = {},
): ConfluenceContributorMetrics => ({
  window: WINDOW,
  pagesCreated: 0,
  pagesEdited: 0,
  pageVersionsAuthored: 0,
  blogPostsCreated: 0,
  commentsWritten: 0,
  attachmentsAdded: 0,
  spaceKeys: [],
  wordsAdded: null,
  wordsRemoved: null,
  volumeUnit: "none",
  pagesMeasuredForVolume: 0,
  pageViews: null,
  pagesMeasuredForViews: 0,
  analytics: "not-measured",
  ...overrides,
});

const space = (
  overrides: Partial<ConfluenceSpaceMetrics> = {},
): ConfluenceSpaceMetrics => ({
  space: { key: "ENG", name: "Engineering", url: "https://acme.atlassian.net/wiki/spaces/ENG" },
  window: WINDOW,
  totalPages: 100,
  pagesCreated: 0,
  pagesEdited: 0,
  blogPostsCreated: 0,
  commentsWritten: 0,
  attachmentsAdded: 0,
  contributors: null,
  lastActivityAt: null,
  stalePages: null,
  staleAfterDays: 180,
  stalestPage: null,
  parentlessPages: null,
  pageViews: null,
  pagesMeasuredForViews: 0,
  analytics: "not-measured",
  ...overrides,
});

const aContributor = (
  metrics: ConfluenceContributorMetrics | null,
): ContributorSummary =>
  ({
    ...ContributorBuilder.create().withDisplayName("Ada Wiki").build(),
    confluenceMetrics: metrics,
  }) as ContributorSummary;

const aRepository = (metrics: ConfluenceSpaceMetrics | null): RepositorySummary =>
  ({
    ...RepositoryBuilder.create().withName("gateway").build(),
    confluenceMetrics: metrics,
  }) as RepositorySummary;

/**
 * Renders a column group the way the real tables do.
 *
 * Through `flexRender` rather than by calling each `cell` directly, so the
 * cells are mounted as React elements and anything they do with hooks or
 * context behaves as it will in the table.
 */
const Harness = <TRow,>({
  columns,
  data,
}: {
  columns: ColumnDef<TRow>[];
  data: TRow[];
}) => {
  const table = useReactTable({ data, columns, getCoreRowModel: getCoreRowModel() });

  return (
    <table>
      <thead>
        {table.getHeaderGroups().map((group) => (
          <tr key={group.id}>
            {group.headers.map((header) => (
              <th key={header.id}>
                {flexRender(header.column.columnDef.header, header.getContext())}
              </th>
            ))}
          </tr>
        ))}
      </thead>
      <tbody>
        {table.getRowModel().rows.map((row) => (
          <tr key={row.id}>
            {row.getVisibleCells().map((cell) => (
              // `data-value` is what forces the column's `accessorFn` to run:
              // the cells read `row.original` directly, so nothing else in a
              // render would ever exercise the value the table sorts on.
              <td
                key={cell.id}
                data-testid={cell.column.id}
                data-value={String(cell.getValue())}
              >
                {flexRender(cell.column.columnDef.cell, cell.getContext())}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
};

const cell = (id: string): string => screen.getByTestId(id).textContent ?? "";

/** What the column sorts on, which is not always what it renders. */
const sortValue = (id: string): string | null =>
  screen.getByTestId(id).getAttribute("data-value");

describe("confluenceContributorColumns", () => {
  it("should show pages created with the pages they touched beside it", () => {
    // given
    const contributors = [aContributor(confluence({ pagesCreated: 4, pagesEdited: 11 }))];

    // when
    render(<Harness columns={confluenceContributorColumns()} data={contributors} />);

    // then
    expect(cell("confluencePages")).toContain("4");
    expect(cell("confluencePages")).toContain("11 edited");
  });

  it("should show words added with what was pruned beside it", () => {
    // given
    const contributors = [
      aContributor(
        confluence({ wordsAdded: 1200, wordsRemoved: 300, volumeUnit: "words" }),
      ),
    ];

    // when
    render(<Harness columns={confluenceContributorColumns()} data={contributors} />);

    // then
    expect(cell("confluenceWords")).toContain("1,200");
    expect(cell("confluenceWords")).toContain("-300");
  });

  it("should render an em dash rather than a zero when no volume was measured", () => {
    // given
    // A zero would read as "this person wrote nothing" rather than "nobody
    // counted", which are completely different findings.
    const contributors = [aContributor(confluence({ pagesCreated: 5 }))];

    // when
    render(<Harness columns={confluenceContributorColumns()} data={contributors} />);

    // then
    expect(cell("confluenceWords")).toBe("-");
  });

  it("should sort on the figure each column reports, not on its caption", () => {
    // given
    const contributors = [
      aContributor(
        confluence({
          pagesCreated: 4,
          pagesEdited: 11,
          wordsAdded: 1200,
          volumeUnit: "words",
          commentsWritten: 7,
          spaceKeys: ["eng", "ops"],
          pageViews: 240,
          pagesMeasuredForViews: 4,
          analytics: "measured",
        }),
      ),
    ];

    // when
    render(<Harness columns={confluenceContributorColumns()} data={contributors} />);

    // then
    expect(sortValue("confluencePages")).toBe("4");
    expect(sortValue("confluenceWords")).toBe("1200");
    expect(sortValue("confluenceComments")).toBe("7");
    expect(sortValue("confluenceSpaces")).toBe("2");
    expect(sortValue("confluenceViews")).toBe("240");
  });

  it("should sort an unmeasured row on null rather than on a zero", () => {
    // given
    // Sorting an unmeasured person as zero would rank them below somebody who
    // deleted a paragraph, which is a claim the data does not support.
    const contributors = [aContributor(null)];

    // when
    render(<Harness columns={confluenceContributorColumns()} data={contributors} />);

    // then
    expect(sortValue("confluenceWords")).toBe("null");
    expect(sortValue("confluenceViews")).toBe("null");
  });

  it("should list the spaces a person touched under the count", () => {
    // given
    const contributors = [aContributor(confluence({ spaceKeys: ["eng", "ops"] }))];

    // when
    render(<Harness columns={confluenceContributorColumns()} data={contributors} />);

    // then
    expect(cell("confluenceSpaces")).toContain("2");
    expect(cell("confluenceSpaces")).toContain("eng, ops");
  });

  it("should show views when the site actually served them", () => {
    // given
    const contributors = [
      aContributor(
        confluence({ pageViews: 240, pagesMeasuredForViews: 4, analytics: "measured" }),
      ),
    ];

    // when
    render(<Harness columns={confluenceContributorColumns()} data={contributors} />);

    // then
    expect(cell("confluenceViews")).toContain("240");
    expect(cell("confluenceViews")).toContain("across 4 pages");
  });

  it("should leave views empty and say why in the heading when analytics is refused", () => {
    // given
    // Page views are a Confluence Cloud Premium feature, so an empty column on
    // a Standard site is about the plan and not about the readership.
    const contributors = [aContributor(confluence({ analytics: "unavailable" }))];

    // when
    render(<Harness columns={confluenceContributorColumns()} data={contributors} />);

    // then
    expect(cell("confluenceViews")).toBe("-");
    // The heading carries the explanation on both the icon's title attribute
    // and the `<title>` element `titleAccess` renders inside the SVG, which is
    // what makes it reachable to a screen reader.
    expect(screen.getAllByTitle(/Premium/).length).toBeGreaterThan(0);
  });

  it("should render every cell empty for a row with no Confluence payload", () => {
    // given
    const contributors = [aContributor(null)];

    // when
    render(<Harness columns={confluenceContributorColumns()} data={contributors} />);

    // then
    for (const id of [
      "confluencePages",
      "confluenceWords",
      "confluenceComments",
      "confluenceSpaces",
      "confluenceViews",
    ]) {
      expect(cell(id)).toBe("-");
    }
  });

  it("should explain that the window is not the one the range picker chose", () => {
    // given
    // Confluence reports no per-day history, so the figures do not move with
    // the picker and a reader has to be told.
    const contributors = [aContributor(confluence())];

    // when
    render(<Harness columns={confluenceContributorColumns()} data={contributors} />);

    // then
    expect(screen.getAllByTitle(/does not move with the range picker/).length).toBeGreaterThan(
      0,
    );
  });
});

describe("confluenceRepositoryColumns", () => {
  it("should link the space out to Confluence", () => {
    // given
    const repositories = [aRepository(space())];

    // when
    render(<Harness columns={confluenceRepositoryColumns()} data={repositories} />);

    // then
    expect(screen.getByText("Engineering").closest("a")).toHaveAttribute(
      "href",
      "https://acme.atlassian.net/wiki/spaces/ENG",
    );
  });

  it("should fall back to plain text when the site reported no link", () => {
    // given
    const repositories = [
      aRepository(space({ space: { key: "ENG", name: null, url: null } })),
    ];

    // when
    render(<Harness columns={confluenceRepositoryColumns()} data={repositories} />);

    // then
    expect(screen.getByText("ENG").closest("a")).toBeNull();
  });

  it("should show stale pages as a count and as a share of the space", () => {
    // given
    const repositories = [aRepository(space({ totalPages: 200, stalePages: 80 }))];

    // when
    render(<Harness columns={confluenceRepositoryColumns()} data={repositories} />);

    // then
    expect(cell("confluenceStale")).toContain("80");
    expect(cell("confluenceStale")).toContain("40% of the space");
  });

  it("should mark a space that has mostly rotted as critical", () => {
    // given
    // A third is where a reader arriving in a space is more likely than not to
    // hit something out of date, which is when a team stops trusting it.
    const repositories = [aRepository(space({ totalPages: 100, stalePages: 50 }))];

    // when
    render(<Harness columns={confluenceRepositoryColumns()} data={repositories} />);

    // then
    expect(screen.getByText("50")).toHaveAttribute("data-tone", "critical");
  });

  it("should leave a space nobody measured for staleness empty", () => {
    // given
    const repositories = [aRepository(space({ stalePages: null }))];

    // when
    render(<Harness columns={confluenceRepositoryColumns()} data={repositories} />);

    // then
    expect(cell("confluenceStale")).toBe("-");
  });

  it("should sort the repository columns on the space's own figures", () => {
    // given
    const repositories = [
      aRepository(
        space({ totalPages: 200, stalePages: 80, lastActivityAt: "2026-08-20T09:00:00.000Z" }),
      ),
    ];

    // when
    render(<Harness columns={confluenceRepositoryColumns()} data={repositories} />);

    // then
    expect(sortValue("confluenceSpace")).toBe("ENG");
    expect(sortValue("confluencePagesTotal")).toBe("200");
    expect(sortValue("confluenceStale")).toBe("80");
    expect(sortValue("confluenceLastEdit")).toBe("2026-08-20T09:00:00.000Z");
  });

  it("should show the last edit as a plain date", () => {
    // given
    const repositories = [aRepository(space({ lastActivityAt: "2026-08-20T09:00:00.000Z" }))];

    // when
    render(<Harness columns={confluenceRepositoryColumns()} data={repositories} />);

    // then
    expect(cell("confluenceLastEdit")).toBe("2026-08-20");
  });

  it("should render every cell empty for a repository with no space", () => {
    // given
    // Nothing is guessed from a repository name: an entity with no annotation
    // has no space, and inventing one would attribute another team's wiki.
    const repositories = [aRepository(null)];

    // when
    render(<Harness columns={confluenceRepositoryColumns()} data={repositories} />);

    // then
    for (const id of [
      "confluenceSpace",
      "confluencePagesTotal",
      "confluenceStale",
      "confluenceLastEdit",
    ]) {
      expect(cell(id)).toBe("-");
    }
  });
});
