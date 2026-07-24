import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import { PasswordInput } from "./password-input";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("PasswordInput", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("is masked by default and toggles visibility without clearing the value", () => {
    act(() => {
      root.render(<PasswordInput id="account-password" defaultValue="secret-value" />);
    });

    const input = container.querySelector<HTMLInputElement>("#account-password");
    const showButton = container.querySelector<HTMLButtonElement>('button[aria-label="Show password"]');

    expect(input?.type).toBe("password");
    expect(input?.value).toBe("secret-value");
    expect(showButton?.getAttribute("aria-controls")).toBe("account-password");

    act(() => showButton?.click());

    expect(input?.type).toBe("text");
    expect(input?.value).toBe("secret-value");
    expect(container.querySelector('button[aria-label="Hide password"]')).not.toBeNull();
  });
});
