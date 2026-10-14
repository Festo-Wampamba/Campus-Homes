import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { SearchClient } from "./search-client";

const mockApi = jest.fn();
jest.mock("../../../lib/api", () => ({
  ...jest.requireActual("../../../lib/api"),
  api: (...args: unknown[]) => mockApi(...args),
}));
jest.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams() }));
// MapLibre needs WebGL; the map isn't what these tests are about.
jest.mock("../../../components/map/listings-map", () => ({ ListingsMap: () => null }));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

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
  mockApi.mockReset();
});

async function settle() {
  for (let i = 0; i < 5; i++) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
}

async function renderSearch() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  await act(async () =>
    root.render(
      <QueryClientProvider client={client}>
        <SearchClient />
      </QueryClientProvider>,
    ),
  );
  await settle();
}

function genderSelect() {
  return container.querySelector<HTMLSelectElement>('select[aria-label="Gender"]')!;
}

async function chooseGender(value: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")!.set!.call(genderSelect(), value);
    genderSelect().dispatchEvent(new Event("change", { bubbles: true }));
  });
  await settle();
}

function clearFiltersButtons() {
  return [...container.querySelectorAll("button")].filter((b) => b.textContent === "Clear filters");
}

describe("SearchClient", () => {
  it("hides Clear filters until a filter is set", async () => {
    mockApi.mockResolvedValue([]);

    await renderSearch();

    expect(clearFiltersButtons()).toHaveLength(0);
  });

  it("says no hostels match the filters when a filter empties the results", async () => {
    mockApi.mockResolvedValue([]);
    await renderSearch();

    await chooseGender("female_only");

    expect(container.textContent).toContain("No hostels match your filters");
  });

  it("resets the filters when Clear filters is pressed", async () => {
    mockApi.mockResolvedValue([]);
    await renderSearch();
    await chooseGender("female_only");

    await act(async () => clearFiltersButtons()[0].click());
    await settle();

    expect(genderSelect().value).toBe("");
  });

  it("does not claim an area is empty when the search failed", async () => {
    mockApi.mockRejectedValue(new Error("network down"));

    await renderSearch();

    expect(container.textContent).not.toContain("No verified places");
  });
});
