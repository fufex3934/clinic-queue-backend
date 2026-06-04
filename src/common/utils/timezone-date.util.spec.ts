import {
  getDateKeyInTimeZone,
  getDayBoundsInTimeZone,
  getTodayInTimeZone,
} from './timezone-date.util';

describe('timezone-date.util', () => {
  it('uses Addis calendar day for evening UTC instant', () => {
    // 2026-06-02 22:00 UTC = 2026-06-03 01:00 in Addis (UTC+3)
    const instant = new Date('2026-06-02T22:00:00.000Z');
    expect(getDateKeyInTimeZone(instant, 'Africa/Addis_Ababa')).toBe(
      '2026-06-03',
    );
  });

  it('day bounds span 24h in clinic timezone', () => {
    const { start, end } = getDayBoundsInTimeZone(
      '2026-06-03',
      'Africa/Addis_Ababa',
    );
    expect(end.getTime() - start.getTime()).toBe(24 * 60 * 60 * 1000);
    expect(getDateKeyInTimeZone(start, 'Africa/Addis_Ababa')).toBe('2026-06-03');
    expect(getDateKeyInTimeZone(new Date(end.getTime() - 1), 'Africa/Addis_Ababa')).toBe(
      '2026-06-03',
    );
  });

  it('getTodayInTimeZone returns YYYY-MM-DD', () => {
    expect(getTodayInTimeZone('UTC')).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
