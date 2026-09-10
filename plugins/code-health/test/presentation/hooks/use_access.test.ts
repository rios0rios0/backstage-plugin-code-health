import { renderHook, waitFor } from "@testing-library/react";
import {
  NO_ADMINISTRATION_ACCESS,
  useAccess,
} from "../../../src/presentation/hooks/use_access";
import { StubAdministrationService } from "../../doubles/stub_administration_service";

describe("useAccess", () => {
  it("should report what the backend allows this caller", async () => {
    // given
    const service = new StubAdministrationService().withAdministrator(180);

    // when
    const { result } = renderHook(() => useAccess(service));

    // then
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.access).toEqual({ canResetIngestion: true, retentionDays: 180 });
  });

  it("should report nothing beyond reading for a caller who is not an administrator", async () => {
    // given
    // A fresh install names no administrators, so this is the ordinary answer
    // rather than an edge case.
    const service = new StubAdministrationService();

    // when
    const { result } = renderHook(() => useAccess(service));

    // then
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.access.canResetIngestion).toBe(false);
  });

  it("should report nothing beyond reading when the probe fails", async () => {
    // given
    // The tabs already carry a reachability gate; a second panel in the page
    // header would say the same thing while pushing the dashboard down.
    const service = new StubAdministrationService().withAccessError(new Error("unreachable"));

    // when
    const { result } = renderHook(() => useAccess(service));

    // then
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.access).toEqual(NO_ADMINISTRATION_ACCESS);
  });

  it("should ask exactly once for a stable service", async () => {
    // given
    const service = new StubAdministrationService().withAdministrator();

    // when
    const { result, rerender } = renderHook(() => useAccess(service));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    rerender();

    // then
    expect(service.accessCalls).toBe(1);
  });
});
