import { fireEvent, render, screen } from "@testing-library/react";
import { ContributorRoleCell } from "../../../src/presentation/components/contributor_role_cell";
import { ContributorBuilder } from "../../builders/contributor_builder";

describe("ContributorRoleCell", () => {
  it("should show a reader the role and nothing to change it with", () => {
    // given
    const contributor = ContributorBuilder.create().withDisplayName("alice").withRole("lead").build();

    // when
    render(
      <ContributorRoleCell
        contributor={contributor}
        canAssign={false}
        isBusy={false}
        onAssign={() => undefined}
      />,
    );

    // then
    expect(screen.getByText("Lead")).toBeInTheDocument();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  });

  it("should offer an administrator both roles, opened on the current one", () => {
    // given
    const contributor = ContributorBuilder.create().withDisplayName("alice").build();

    // when
    render(
      <ContributorRoleCell
        contributor={contributor}
        canAssign
        isBusy={false}
        onAssign={() => undefined}
      />,
    );

    // then
    const select = screen.getByLabelText("Role of alice") as HTMLSelectElement;
    expect(select.value).toBe("engineer");
    expect([...select.options].map((option) => option.text)).toEqual(["Engineer", "Lead"]);
  });

  it("should hand the new role to the caller", () => {
    // given
    const contributor = ContributorBuilder.create().withDisplayName("alice").build();
    const assigned: string[] = [];
    render(
      <ContributorRoleCell
        contributor={contributor}
        canAssign
        isBusy={false}
        onAssign={(role) => assigned.push(role)}
      />,
    );

    // when
    fireEvent.change(screen.getByLabelText("Role of alice"), { target: { value: "lead" } });

    // then
    expect(assigned).toEqual(["lead"]);
  });

  it("should ignore a change to the role the person already has", () => {
    // given
    const contributor = ContributorBuilder.create().withDisplayName("alice").build();
    const assigned: string[] = [];
    render(
      <ContributorRoleCell
        contributor={contributor}
        canAssign
        isBusy={false}
        onAssign={(role) => assigned.push(role)}
      />,
    );

    // when
    fireEvent.change(screen.getByLabelText("Role of alice"), { target: { value: "engineer" } });

    // then
    // Nothing to write: the statement is already true.
    expect(assigned).toEqual([]);
  });
});
