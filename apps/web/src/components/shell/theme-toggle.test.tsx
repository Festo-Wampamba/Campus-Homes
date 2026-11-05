import { act } from "react";
import { createRoot } from "react-dom/client";
import { ThemeToggle } from "./theme-toggle";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
it("still changes the theme when browser storage is unavailable", async () => {
  const container = document.createElement("div");
  const root = createRoot(container);
  const storage = jest.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new DOMException("Blocked", "SecurityError"); });
  document.documentElement.classList.remove("dark");
  try {
    await act(async () => root.render(<ThemeToggle />));
    await act(async () => container.querySelector("button")!.click());
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    await act(async () => container.querySelector("button")!.click());
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  } finally { act(() => root.unmount()); storage.mockRestore(); document.documentElement.classList.remove("dark"); }
});
