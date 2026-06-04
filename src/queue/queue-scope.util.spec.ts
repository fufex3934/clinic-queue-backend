import { toQueueScopeKey, resolveClinicDayScope } from './utils/queue-scope.util';

describe('Queue scope / token keys', () => {
  const clinicA = '507f1f77bcf86cd799439011';
  const clinicB = '507f1f77bcf86cd799439012';
  const dateKey = '2026-06-01';

  it('generates unique scopeKey per clinic per day', () => {
    const keyA = toQueueScopeKey(clinicA, dateKey);
    const keyB = toQueueScopeKey(clinicB, dateKey);
    expect(keyA).not.toBe(keyB);
    expect(keyA).toContain(clinicA);
    expect(keyA).toContain('2026-06-01');
  });

  it('resolveClinicDayScope normalizes clinic ObjectId', () => {
    const scope = resolveClinicDayScope(clinicA, 'UTC', dateKey);
    expect(scope.clinicObjectId.toString()).toBe(clinicA);
    expect(scope.dateKey).toBe('2026-06-01');
  });
});
