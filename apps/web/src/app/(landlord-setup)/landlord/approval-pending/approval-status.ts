export type ApprovalStatus = "pending" | "verified" | "rejected";

export const POLL_MS = 5_000;
export const SLOW_POLL_MS = 15_000;
export const FAILURES_BEFORE_SLOWDOWN = 3;

export function isFinal(status: ApprovalStatus): boolean {
  return status !== "pending";
}

// Back off when the API keeps failing so a dropped connection doesn't turn
// every open review tab into a tight retry loop.
export function pollDelay(consecutiveFailures: number): number {
  return consecutiveFailures >= FAILURES_BEFORE_SLOWDOWN ? SLOW_POLL_MS : POLL_MS;
}
