import { act } from "react";
import { createRoot } from "react-dom/client";

import { useRefreshWhile } from "./use-refresh-while";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function Probe({ active, refresh }: { active: boolean; refresh: () => void }) {
  useRefreshWhile(active, refresh, 10_000);
  return null;
}

function mount(active: boolean, refresh: () => void) {
  const root = createRoot(document.createElement("div"));
  act(() => root.render(<Probe active={active} refresh={refresh} />));
  return root;
}

describe("useRefreshWhile", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it("refreshes on an interval while waiting for a review", () => {
    const refresh = jest.fn();
    mount(true, refresh);
    act(() => { jest.advanceTimersByTime(20_000); });
    expect(refresh).toHaveBeenCalledTimes(2);
  });

  it("does nothing when nothing is under review", () => {
    const refresh = jest.fn();
    mount(false, refresh);
    act(() => { jest.advanceTimersByTime(20_000); });
    expect(refresh).not.toHaveBeenCalled();
  });

  it("refreshes as soon as a hidden tab becomes visible again", () => {
    const refresh = jest.fn();
    mount(true, refresh);
    act(() => { document.dispatchEvent(new Event("visibilitychange")); });
    expect(refresh).toHaveBeenCalledTimes(1);
  });
});
