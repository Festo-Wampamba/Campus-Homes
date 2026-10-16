// Same clock as the rest of the app (lib/format.ts): Kampala time.
const TIME_ZONE = "Africa/Kampala";

const dayKey = (date: Date) => date.toLocaleDateString("en-CA", { timeZone: TIME_ZONE });
const time = (date: Date) =>
  date.toLocaleTimeString("en-GB", { timeZone: TIME_ZONE, hour: "numeric", minute: "2-digit", hour12: true });

/** WhatsApp-style "last seen today at 2:14 pm" / "yesterday at 9:02 am" / "12 Oct". */
export function formatLastSeen(iso: string, now = new Date()): string {
  const seen = new Date(iso);
  if (dayKey(seen) === dayKey(now)) return `last seen today at ${time(seen)}`;
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  if (dayKey(seen) === dayKey(yesterday)) return `last seen yesterday at ${time(seen)}`;
  const sameYear = seen.toLocaleDateString("en-GB", { timeZone: TIME_ZONE, year: "numeric" }) ===
    now.toLocaleDateString("en-GB", { timeZone: TIME_ZONE, year: "numeric" });
  return `last seen ${seen.toLocaleDateString("en-GB", {
    timeZone: TIME_ZONE,
    day: "numeric",
    month: "short",
    ...(sameYear ? {} : { year: "numeric" }),
  })}`;
}
