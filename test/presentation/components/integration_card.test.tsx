import { fireEvent, render, screen } from "@testing-library/react";
import { IntegrationCard } from "../../../src/presentation/components/integration_card";

describe("IntegrationCard", () => {
  it("should render title and Connected status when status is connected", () => {
    // given / when
    render(
      <IntegrationCard title="GitHub" description="VCS" status="connected" onSave={jest.fn()}>
        {() => <span>fields</span>}
      </IntegrationCard>,
    );

    // then
    expect(screen.getByText("GitHub")).toBeInTheDocument();
    expect(screen.getByText("Connected")).toBeInTheDocument();
  });

  it("should render title and Disconnected status when status is disconnected", () => {
    // given / when
    render(
      <IntegrationCard title="WakaTime" description="Time tracking" status="disconnected" onSave={jest.fn()}>
        {() => <span>fields</span>}
      </IntegrationCard>,
    );

    // then
    expect(screen.getByText("WakaTime")).toBeInTheDocument();
    expect(screen.getByText("Disconnected")).toBeInTheDocument();
  });

  it("should render disconnect button when not required and connected", () => {
    // given / when
    render(
      <IntegrationCard title="Sonar" description="Code quality" status="connected" onSave={jest.fn()} onDisconnect={jest.fn()}>
        {() => <span>fields</span>}
      </IntegrationCard>,
    );

    // then
    expect(screen.getByText("Disconnect")).toBeInTheDocument();
  });

  it("should not render disconnect button when isRequired is true", () => {
    // given / when
    render(
      <IntegrationCard title="GitHub" description="VCS" status="connected" isRequired onSave={jest.fn()} onDisconnect={jest.fn()}>
        {() => <span>fields</span>}
      </IntegrationCard>,
    );

    // then
    expect(screen.queryByText("Disconnect")).not.toBeInTheDocument();
  });

  it("should call onDisconnect when disconnect button is clicked", () => {
    // given
    const onDisconnect = jest.fn();
    render(
      <IntegrationCard title="Sonar" description="Code quality" status="connected" onSave={jest.fn()} onDisconnect={onDisconnect}>
        {() => <span>fields</span>}
      </IntegrationCard>,
    );

    // when
    fireEvent.click(screen.getByText("Disconnect"));

    // then
    expect(onDisconnect).toHaveBeenCalledTimes(1);
  });

  it("should show save and cancel buttons when edit is clicked", () => {
    // given
    render(
      <IntegrationCard title="GitHub" description="VCS" status="connected" onSave={jest.fn()}>
        {() => <span>fields</span>}
      </IntegrationCard>,
    );

    // when
    fireEvent.click(screen.getByText("Edit"));

    // then
    expect(screen.getByText("Save")).toBeInTheDocument();
    expect(screen.getByText("Cancel")).toBeInTheDocument();
  });

  it("should call onSave when save button is clicked", () => {
    // given
    const onSave = jest.fn();
    render(
      <IntegrationCard title="GitHub" description="VCS" status="connected" onSave={onSave}>
        {() => <span>fields</span>}
      </IntegrationCard>,
    );
    fireEvent.click(screen.getByText("Edit"));

    // when
    fireEvent.click(screen.getByText("Save"));

    // then
    expect(onSave).toHaveBeenCalledTimes(1);
  });
});
