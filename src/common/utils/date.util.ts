/** Normalize an ISO date string (or today) to UTC start-of-day. */
export function toStartOfDay(dateInput?: string): Date {
  const base = dateInput ? new Date(dateInput) : new Date();
  return new Date(
    Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate()),
  );
}

/** Stable day key for counters and queries (YYYY-MM-DD, UTC). */
export function toDateKey(date: Date = new Date()): string {
  const d = toStartOfDay(date.toISOString());
  return d.toISOString().slice(0, 10);
}
