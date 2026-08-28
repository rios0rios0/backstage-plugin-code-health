import { NO_INTEGRATIONS } from "@rios0rios0/backstage-plugin-code-health-common";
import { renderHook, waitFor } from "@testing-library/react";
import { useCapabilities } from "../../../src/presentation/hooks/use_capabilities";
import { StubIntegrationsService } from "../../doubles/stub_integrations_service";

describe("useCapabilities", () => {
  it("should report what the backend was configured with", async () => {
    // given
    const service = new StubIntegrationsService().withEnabled("wakatime", "jira");

    // when
    const { result } = renderHook(() => useCapabilities(service));

    // then
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.capabilities).toEqual({
      wakatime: true,
      jira: true,
      confluence: false,
    });
  });

  it("should report nothing enabled when the backend cannot be reached", async () => {
    // given
    // The tabs already carry a reachability gate; a second error panel saying
    // the same thing would push the dashboard off the screen.
    const service = new StubIntegrationsService().withFailure(new Error("unreachable"));

    // when
    const { result } = renderHook(() => useCapabilities(service));

    // then
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.capabilities).toEqual(NO_INTEGRATIONS);
  });

  it("should ask exactly once for a stable service", async () => {
    // given
    const service = new StubIntegrationsService();

    // when
    const { result, rerender } = renderHook(() => useCapabilities(service));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    rerender();

    // then
    expect(service.calls).toBe(1);
  });
});
