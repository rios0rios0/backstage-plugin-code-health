import { NO_INTEGRATIONS } from "@rios0rios0/backstage-plugin-code-health-common";
import { fireEvent, render as renderBare, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { IdentitiesPage } from "../../../src/presentation/pages/identities_page";
import { IdentityRowBuilder } from "../../builders/identity_row_builder";
import { StubIdentityService } from "../../doubles/stub_identity_service";

const render = (ui: React.ReactElement) => renderBare(<MemoryRouter>{ui}</MemoryRouter>);

const renderPage = (
  service: StubIdentityService,
  capabilities = { ...NO_INTEGRATIONS, wakatime: true, jira: true, confluence: true },
) => render(<IdentitiesPage identityService={service} capabilities={capabilities} />);

const unlinked = IdentityRowBuilder.create()
  .from("wakatime", "jrios")
  .named("Felipe Rios")
  .withSuggestions(
    { entityRef: "user:default/felipe", displayName: "F. Rios (directory)" },
    { entityRef: "user:default/other", displayName: "Someone Else", reason: "most of the name matches" },
  )
  .build();

const linked = IdentityRowBuilder.create()
  .from("vcs", "dev@example.com")
  .named("Dev Example")
  .withEmail("dev@example.com")
  .linkedTo("user:default/dev", "catalog-email")
  .build();

describe("IdentitiesPage", () => {
  it("should list the accounts with their source and their person", async () => {
    // given
    const service = new StubIdentityService().withRows([unlinked, linked]);

    // when
    renderPage(service);

    // then
    await waitFor(() => expect(screen.getByText("Felipe Rios")).toBeInTheDocument());
    // Twice each: once as a source filter option, once as the row's chip.
    expect(screen.getAllByText("WakaTime")).toHaveLength(2);
    expect(screen.getAllByText("Version control")).toHaveLength(2);
    expect(screen.getByText("user:default/dev")).toBeInTheDocument();
    expect(screen.getByText("matched on the e-mail address")).toBeInTheDocument();
    expect(screen.getByText("2 accounts, 1 unlinked")).toBeInTheDocument();
  });

  it("should link an account from a suggestion in one click", async () => {
    // given
    // The ranked match is right the overwhelming majority of the time, and
    // linking a fleet's worth of accounts should not take an afternoon.
    const service = new StubIdentityService().withRows([unlinked]);
    renderPage(service);
    await waitFor(() => expect(screen.getByText("Felipe Rios")).toBeInTheDocument());

    // when
    fireEvent.click(screen.getByText("F. Rios (directory)"));

    // then
    await waitFor(() =>
      expect(screen.getByText("user:default/felipe")).toBeInTheDocument(),
    );
    expect(screen.getByText("linked by user:default/tester")).toBeInTheDocument();
  });

  it("should link an account to a user nobody suggested", async () => {
    // given
    // A bot with a plausible name, or somebody whose accounts share nothing.
    const service = new StubIdentityService().withRows([unlinked]);
    renderPage(service);
    await waitFor(() => expect(screen.getByText("Felipe Rios")).toBeInTheDocument());

    // when
    fireEvent.change(screen.getByLabelText("Catalog user for jrios"), {
      target: { value: "  user:default/manual  " },
    });
    fireEvent.click(screen.getByText("Link"));

    // then
    await waitFor(() =>
      // Trimmed on the way out, so a pasted reference with stray whitespace is
      // not rejected by the backend for a reason nobody can see.
      expect(screen.getByText("user:default/manual")).toBeInTheDocument(),
    );
  });

  it("should refuse to submit an empty reference", async () => {
    // given
    const service = new StubIdentityService().withRows([unlinked]);
    renderPage(service);
    await waitFor(() => expect(screen.getByText("Felipe Rios")).toBeInTheDocument());

    // when / then
    expect(screen.getByText("Link").closest("button")).toBeDisabled();
  });

  it("should remove a link", async () => {
    // given
    const service = new StubIdentityService().withRows([linked]);
    renderPage(service);
    await waitFor(() => expect(screen.getByText("user:default/dev")).toBeInTheDocument());

    // when
    fireEvent.click(screen.getByText("Unlink"));

    // then
    await waitFor(() =>
      expect(screen.queryByText("user:default/dev")).not.toBeInTheDocument(),
    );
  });

  it("should say plainly when a link was refused", async () => {
    // given
    const service = new StubIdentityService()
      .withRows([unlinked])
      .withLinkFailure(new Error("user:default/ghost is not a user in the catalog"));
    renderPage(service);
    await waitFor(() => expect(screen.getByText("Felipe Rios")).toBeInTheDocument());

    // when
    fireEvent.change(screen.getByLabelText("Catalog user for jrios"), {
      target: { value: "user:default/ghost" },
    });
    fireEvent.click(screen.getByText("Link"));

    // then
    await waitFor(() =>
      expect(screen.getByText(/That link was not saved/u)).toBeInTheDocument(),
    );
  });

  it("should narrow the listing to one source", async () => {
    // given
    const service = new StubIdentityService().withRows([unlinked, linked]);
    renderPage(service);
    await waitFor(() => expect(screen.getByText("Dev Example")).toBeInTheDocument());

    // when
    fireEvent.change(screen.getByLabelText("Filter by source"), {
      target: { value: "wakatime" },
    });

    // then
    await waitFor(() =>
      expect(screen.queryByText("Dev Example")).not.toBeInTheDocument(),
    );
    expect(screen.getByText("Felipe Rios")).toBeInTheDocument();
  });

  it("should ignore a source value it does not recognise", async () => {
    // given
    const service = new StubIdentityService().withRows([unlinked, linked]);
    renderPage(service);
    await waitFor(() => expect(screen.getByText("Dev Example")).toBeInTheDocument());

    // when
    fireEvent.change(screen.getByLabelText("Filter by source"), {
      target: { value: "" },
    });

    // then
    await waitFor(() => expect(screen.getByText("Dev Example")).toBeInTheDocument());
  });

  it("should hide an account somebody already linked when asked", async () => {
    // given
    const service = new StubIdentityService().withRows([unlinked, linked]);
    renderPage(service);
    await waitFor(() => expect(screen.getByText("Dev Example")).toBeInTheDocument());

    // when
    fireEvent.click(screen.getByRole("checkbox"));

    // then
    await waitFor(() =>
      expect(screen.queryByText("Dev Example")).not.toBeInTheDocument(),
    );
  });

  it("should only offer sources whose integration is configured", async () => {
    // given
    // A filter that can only ever return nothing is a filter that looks broken.
    const service = new StubIdentityService().withRows([linked]);

    // when
    renderPage(service, NO_INTEGRATIONS);

    // then
    await waitFor(() => expect(screen.getByText("Dev Example")).toBeInTheDocument());
    const options = screen.getByLabelText("Filter by source").querySelectorAll("option");
    expect([...options].map((option) => option.textContent)).toEqual([
      "All sources",
      "Version control",
    ]);
  });

  it("should say so when nothing resembles an account", async () => {
    // given
    const orphan = IdentityRowBuilder.create().from("vcs", "bot@ci.local").named(null).build();
    const service = new StubIdentityService().withRows([orphan]);

    // when
    renderPage(service);

    // then
    await waitFor(() =>
      expect(
        screen.getByText("Nothing in the catalog resembles this account."),
      ).toBeInTheDocument(),
    );
    // And the account still gets a row, keyed on what it is called.
    expect(screen.getAllByText("bot@ci.local").length).toBeGreaterThan(0);
  });

  it("should explain an empty screen rather than showing a bare table", async () => {
    // given
    const service = new StubIdentityService().withRows([]);

    // when
    renderPage(service);

    // then
    await waitFor(() =>
      expect(screen.getByText(/No accounts have been seen yet/u)).toBeInTheDocument(),
    );
  });

  it("should surface a listing failure", async () => {
    // given
    const service = new StubIdentityService().withListFailure(new Error("backend is down"));

    // when
    renderPage(service);

    // then
    await waitFor(() =>
      expect(screen.getByText(/Failed to load identities/u)).toBeInTheDocument(),
    );
  });

});
