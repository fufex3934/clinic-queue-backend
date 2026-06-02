import { toDateKey, toStartOfDay } from '../../common/utils/date.util';
import { toObjectId } from '../../common/utils/mongo.util';

/** Composite counter key: one sequence per clinic per calendar day. */
export function toQueueScopeKey(clinicId: string, date: Date = new Date()): string {
  return `${clinicId}:${toDateKey(date)}`;
}

export function resolveClinicDayScope(clinicId: string, dateInput?: Date) {
  const date = dateInput ?? toStartOfDay();
  const clinicObjectId = toObjectId(clinicId);
  const dateKey = toDateKey(date);

  return {
    clinicId,
    clinicObjectId,
    date,
    dateKey,
    scopeKey: toQueueScopeKey(clinicId, date),
  };
}

export type ClinicDayScope = ReturnType<typeof resolveClinicDayScope>;
