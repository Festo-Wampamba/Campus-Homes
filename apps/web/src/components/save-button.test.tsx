import { act } from "react";
import { createRoot } from "react-dom/client";

import { SaveButton } from "./save-button";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// jsdom has no <dialog> modal API.
HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
  this.setAttribute("open", "");
};
HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
  this.removeAttribute("open");
};

async function pressHeartSignedOut() {
  const container = document.createElement("div");
  document.body.append(container);
  await act(async () => createRoot(container).render(<SaveButton listingId="l1" signedOut />));
  await act(async () => container.querySelector<HTMLButtonElement>('button[aria-label="Save to favourites"]')!.click());
  return container;
}

describe("SaveButton signed out", () => {
  it("asks the visitor to create an account instead of saving", async () => {
    expect((await pressHeartSignedOut()).querySelector("dialog[open]")?.textContent).toContain(
      "Create an account to save favourites",
    );
  });

  it("sends a new account back to the listing after registering", async () => {
    const link = [...(await pressHeartSignedOut()).querySelectorAll("a")].find((a) => a.textContent === "Create free account");
    expect(link?.getAttribute("href")).toBe(
      "/api/auth/logto/sign-in?portal=consumer&intent=student&next=%2Flistings%2Fl1&screen=register",
    );
  });
});
