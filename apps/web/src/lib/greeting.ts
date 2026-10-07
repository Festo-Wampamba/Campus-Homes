// ponytail: one fixed timezone; every pilot user is in Uganda. Switch to the
// viewer's own zone (client-rendered) if staff ever work across zones.
const TIME_ZONE = "Africa/Kampala";

/** "Good morning" / "Good afternoon" / "Good evening" for the hour in Uganda. */
export function timeOfDayGreeting(now: Date = new Date()): string {
  const hour = Number(new Intl.DateTimeFormat("en-GB", { hour: "numeric", hourCycle: "h23", timeZone: TIME_ZONE }).format(now));
  if (hour >= 5 && hour < 12) return "Good morning";
  if (hour >= 12 && hour < 17) return "Good afternoon";
  return "Good evening";
}
