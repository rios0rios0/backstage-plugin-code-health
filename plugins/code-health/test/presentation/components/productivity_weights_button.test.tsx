import type {
  GetAccessResponse,
  IntegrationCapabilities,
} from "@rios0rios0/backstage-plugin-code-health-common";
import {
  DEFAULT_PRODUCTIVITY_WEIGHTS,
  NO_INTEGRATIONS,
} from "@rios0rios0/backstage-plugin-code-health-common";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { ProductivityWeightsButton } from "../../../src/presentation/components/productivity_weights_button";
import { NO_ADMINISTRATION_ACCESS } from "../../../src/presentation/hooks/use_access";
import { StubScoringService } from "../../doubles/stub_scoring_service";

/** What the backend answers somebody who may change the scoring. */
const MANAGER: GetAccessResponse = { ...NO_ADMINISTRATION_ACCESS, canManageScoring: true };

const renderButton = (
  service: StubScoringService,
  options: {
    access?: GetAccessResponse;
    capabilities?: IntegrationCapabilities;
    onSaved?: () => void;
  } = {},
) =>
  render(
    <ProductivityWeightsButton
      access={options.access ?? MANAGER}
      scoringService={service}
      weights={DEFAULT_PRODUCTIVITY_WEIGHTS}
      capabilities={options.capabilities ?? NO_INTEGRATIONS}
      onSaved={options.onSaved ?? (() => undefined)}
    />,
  );

/** Opens the editor and waits for it to be on screen. */
const openDialog = async () => {
  fireEvent.click(await screen.findByRole("button", { name: "Productivity score weights" }));
  return screen.findByRole("dialog");
};

const weightInput = (role: "Engineer" | "Lead", component: string): HTMLInputElement =>
  screen.getByLabelText(`${role} weight for ${component}`) as HTMLInputElement;

/** The row of the editor's table naming `component`, header row left out. */
const rowOf = (component: string): HTMLElement => {
  const table = screen.getByRole("table", { name: "Productivity score weights" });
  const row = within(table)
    .getAllByRole("row")
    .slice(1)
    .find((candidate) => within(candidate).queryByText(component) !== null);
  if (!row) throw new Error(`no row for ${component}`);
  return row;
};

describe("ProductivityWeightsButton", () => {
  it("should draw nothing for a reader who may not change the scoring", () => {
    // given / when
    renderButton(new StubScoringService(), { access: NO_ADMINISTRATION_ACCESS });

    // then
    expect(
      screen.queryByRole("button", { name: "Productivity score weights" }),
    ).not.toBeInTheDocument();
  });

  it("should draw nothing for somebody who may reset but not change the scoring", () => {
    // given
    // Its own flag: a policy can hand the reset to the platform team and the
    // scoring to nobody.
    renderButton(new StubScoringService(), {
      access: { ...NO_ADMINISTRATION_ACCESS, canResetIngestion: true },
    });

    // then
    expect(
      screen.queryByRole("button", { name: "Productivity score weights" }),
    ).not.toBeInTheDocument();
  });

  it("should lay every component out with a weight and a share per role", async () => {
    // given
    renderButton(new StubScoringService());

    // when
    await openDialog();

    // then
    // Eleven components, each with an engineer and a lead weight, opened on
    // the weights in force.
    expect(weightInput("Engineer", "Commits").value).toBe("0.2");
    expect(weightInput("Lead", "Reviews given").value).toBe("0.4");
    expect(screen.getAllByRole("spinbutton")).toHaveLength(22);
  });

  it("should show what a weight comes to on this install, beside it", async () => {
    // given
    // A weight is what is edited and a share is what is read, and they are not
    // the same number once the weights are spread over what is configured.
    renderButton(new StubScoringService());
    await openDialog();

    // then
    // Commits: a fifth of an engineer's base score, a tenth of a lead's.
    expect(rowOf("Commits")).toHaveTextContent("20%");
    expect(rowOf("Commits")).toHaveTextContent("10%");
    // An integration nobody configured carries nothing, and the row says so.
    expect(rowOf("Coding time")).toHaveTextContent("not configured");
    expect(rowOf("Coding time")).toHaveTextContent("—");
  });

  it("should move the share as the weight is typed", async () => {
    // given
    renderButton(new StubScoringService(), {
      capabilities: { ...NO_INTEGRATIONS, wakatime: true },
    });
    await openDialog();
    expect(rowOf("Coding time")).not.toHaveTextContent("not configured");

    // when
    // Commits are everything for an engineer now.
    fireEvent.change(weightInput("Engineer", "Commits"), { target: { value: "8" } });

    // then
    // 8 over 8 + the other seven enabled weights (0.9): about 90 percent.
    expect(rowOf("Commits")).toHaveTextContent("90%");
  });

  it("should save only the roles that changed, and tell the caller", async () => {
    // given
    const service = new StubScoringService();
    let saved = 0;
    renderButton(service, {
      onSaved: () => {
        saved += 1;
      },
    });
    await openDialog();
    expect(screen.getByRole("button", { name: "Save weights" })).toBeDisabled();

    // when
    fireEvent.change(weightInput("Lead", "Reviews given"), { target: { value: "0.6" } });
    fireEvent.click(screen.getByRole("button", { name: "Save weights" }));

    // then
    await waitFor(() => expect(service.updates).toHaveLength(1));
    expect(service.updates[0].role).toBe("lead");
    expect(service.updates[0].weights).toEqual({
      ...DEFAULT_PRODUCTIVITY_WEIGHTS.lead,
      reviewsGiven: 0.6,
    });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(saved).toBe(1);
    expect(await screen.findByText(/Productivity weights saved for lead\./u)).toBeInTheDocument();
  });

  it("should refuse a set that scores on nothing, and say why", async () => {
    // given
    renderButton(new StubScoringService());
    await openDialog();

    // when
    for (const component of [
      "Commits",
      "Pull requests merged",
      "Code churn",
      "Reviews given",
      "Pipeline success",
      "Quality gate of code touched",
      "Test coverage of code touched",
      "Coding time",
      "Tickets resolved",
      "Tickets that stayed done",
      "Documentation written",
    ]) {
      fireEvent.change(weightInput("Engineer", component), { target: { value: "0" } });
    }

    // then
    expect(screen.getByText(/at least one has to be above zero/u)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save weights" })).toBeDisabled();
    // A set that cannot be scored on has no shares to show either.
    expect(rowOf("Commits")).toHaveTextContent("—");
  });

  it("should refuse a negative weight and a cleared field", async () => {
    // given
    renderButton(new StubScoringService());
    await openDialog();

    // when
    fireEvent.change(weightInput("Engineer", "Commits"), { target: { value: "-1" } });

    // then
    expect(screen.getByRole("button", { name: "Save weights" })).toBeDisabled();

    // when
    // Cleared to type into, not set to zero.
    fireEvent.change(weightInput("Engineer", "Commits"), { target: { value: "" } });

    // then
    expect(screen.getByRole("button", { name: "Save weights" })).toBeDisabled();
  });

  it("should send a role back to its defaults", async () => {
    // given
    const service = new StubScoringService().withWeights({
      ...DEFAULT_PRODUCTIVITY_WEIGHTS,
      lead: { ...DEFAULT_PRODUCTIVITY_WEIGHTS.lead, reviewsGiven: 0.6 },
    });
    let saved = 0;
    render(
      <ProductivityWeightsButton
        access={MANAGER}
        scoringService={service}
        weights={{
          ...DEFAULT_PRODUCTIVITY_WEIGHTS,
          lead: { ...DEFAULT_PRODUCTIVITY_WEIGHTS.lead, reviewsGiven: 0.6 },
        }}
        capabilities={NO_INTEGRATIONS}
        onSaved={() => {
          saved += 1;
        }}
      />,
    );
    await openDialog();
    // The engineer's are the defaults already, so there is nothing to restore.
    expect(screen.getByRole("button", { name: "Restore engineer defaults" })).toBeDisabled();

    // when
    fireEvent.click(screen.getByRole("button", { name: "Restore lead defaults" }));

    // then
    await waitFor(() => expect(service.resets).toEqual(["lead"]));
    expect(saved).toBe(1);
    // The editor stays open, with the lead's column back on the defaults, so
    // an edit typed into the engineer's column is not thrown away with it.
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    await waitFor(() => expect(weightInput("Lead", "Reviews given").value).toBe("0.4"));
    expect(
      await screen.findByText(/Lead weights restored to the defaults\./u),
    ).toBeInTheDocument();
  });

  it("should keep an edit to the other role when one is restored", async () => {
    // given
    const service = new StubScoringService().withWeights({
      ...DEFAULT_PRODUCTIVITY_WEIGHTS,
      lead: { ...DEFAULT_PRODUCTIVITY_WEIGHTS.lead, reviewsGiven: 0.6 },
    });
    render(
      <ProductivityWeightsButton
        access={MANAGER}
        scoringService={service}
        weights={{
          ...DEFAULT_PRODUCTIVITY_WEIGHTS,
          lead: { ...DEFAULT_PRODUCTIVITY_WEIGHTS.lead, reviewsGiven: 0.6 },
        }}
        capabilities={NO_INTEGRATIONS}
        onSaved={() => undefined}
      />,
    );
    await openDialog();
    fireEvent.change(weightInput("Engineer", "Commits"), { target: { value: "0.5" } });

    // when
    fireEvent.click(screen.getByRole("button", { name: "Restore lead defaults" }));

    // then
    await waitFor(() => expect(service.resets).toEqual(["lead"]));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Save weights" })).toBeEnabled(),
    );
    expect(weightInput("Engineer", "Commits").value).toBe("0.5");
  });

  it("should show the backend's refusal without closing the editor", async () => {
    // given
    const service = new StubScoringService().withWriteFailure(new Error("403 Forbidden"));
    let saved = 0;
    renderButton(service, {
      onSaved: () => {
        saved += 1;
      },
    });
    await openDialog();

    // when
    fireEvent.change(weightInput("Lead", "Reviews given"), { target: { value: "0.6" } });
    fireEvent.click(screen.getByRole("button", { name: "Save weights" }));

    // then
    // Kept where the reader is: the two answers to a refusal — correct the
    // numbers, or give up — are both in this dialog.
    expect(await screen.findByText("403 Forbidden")).toBeInTheDocument();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(saved).toBe(0);
  });

  it("should report a refusal that arrives as something other than an error", async () => {
    // given
    const service = new StubScoringService().withWriteFailure("gateway said no");
    renderButton(service);
    await openDialog();

    // when
    fireEvent.click(screen.getByRole("button", { name: "Restore engineer defaults" }));

    // then
    // The engineer's weights are the defaults, so the button is disabled and
    // nothing was sent; the lead's restore is what carries the failure.
    expect(service.resets).toEqual([]);
  });

  it("should ask for nothing when the reader cancels", async () => {
    // given
    const service = new StubScoringService();
    renderButton(service);
    await openDialog();
    fireEvent.change(weightInput("Lead", "Reviews given"), { target: { value: "0.6" } });

    // when
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    // then
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(service.updates).toEqual([]);
  });
});
