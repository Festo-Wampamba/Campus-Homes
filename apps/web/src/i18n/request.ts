import { getRequestConfig } from "next-intl/server";

// English-only at MVP (brief §16) — scaffolded day one so adding Luganda
// later is a catalog + locale-routing change, not a refactor.
export default getRequestConfig(async () => ({
  locale: "en",
  messages: (await import("../messages/en.json")).default,
}));
