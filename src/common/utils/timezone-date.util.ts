export const DEFAULT_CLINIC_TIMEZONE = 'Africa/Addis_Ababa';

type ZonedParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

function getZonedParts(date: Date, timeZone: string): ZonedParts {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  const parts = fmt.formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parseInt(parts.find((p) => p.type === type)?.value ?? '0', 10);

  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    hour: get('hour') % 24,
    minute: get('minute'),
    second: get('second'),
  };
}

/** Calendar date YYYY-MM-DD for an instant in the given IANA timezone. */
export function getDateKeyInTimeZone(
  instant: Date = new Date(),
  timeZone: string = DEFAULT_CLINIC_TIMEZONE,
): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(instant);
}

export function getTodayInTimeZone(
  timeZone: string = DEFAULT_CLINIC_TIMEZONE,
): string {
  return getDateKeyInTimeZone(new Date(), timeZone);
}

/** Stored queue/appointment `date` field: UTC midnight for calendar day key. */
export function dateKeyToStorageDate(dateKey: string): Date {
  return new Date(`${dateKey}T00:00:00.000Z`);
}

export function shiftDateKey(dateKey: string, days: number): string {
  const d = dateKeyToStorageDate(dateKey);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** UTC instant for wall-clock time on a calendar day in a timezone. */
export function getUtcForZonedWallTime(
  dateKey: string,
  time: { hour?: number; minute?: number; second?: number },
  timeZone: string,
): Date {
  const [y, m, d] = dateKey.split('-').map((x) => parseInt(x, 10));
  const hour = time.hour ?? 0;
  const minute = time.minute ?? 0;
  const second = time.second ?? 0;

  let utc = Date.UTC(y, m - 1, d, hour, minute, second);
  for (let i = 0; i < 4; i += 1) {
    const z = getZonedParts(new Date(utc), timeZone);
    const desired = Date.UTC(y, m - 1, d, hour, minute, second);
    const actual = Date.UTC(
      z.year,
      z.month - 1,
      z.day,
      z.hour,
      z.minute,
      z.second,
    );
    utc += desired - actual;
  }
  return new Date(utc);
}

/** Inclusive start, exclusive end for a clinic-local calendar day. */
export function getDayBoundsInTimeZone(
  dateKey: string,
  timeZone: string = DEFAULT_CLINIC_TIMEZONE,
): { start: Date; end: Date } {
  const start = getUtcForZonedWallTime(
    dateKey,
    { hour: 0, minute: 0, second: 0 },
    timeZone,
  );
  const end = getUtcForZonedWallTime(
    shiftDateKey(dateKey, 1),
    { hour: 0, minute: 0, second: 0 },
    timeZone,
  );
  return { start, end };
}

export function formatShortWeekdayInTimeZone(
  dateKey: string,
  timeZone: string,
): string {
  const instant = dateKeyToStorageDate(dateKey);
  return instant.toLocaleDateString('en-US', {
    weekday: 'short',
    timeZone,
  });
}
