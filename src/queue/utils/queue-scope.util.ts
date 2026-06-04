import {
  dateKeyToStorageDate,
  getTodayInTimeZone,
} from '../../common/utils/timezone-date.util';
import { toObjectId } from '../../common/utils/mongo.util';

/** Composite counter key: one sequence per clinic per calendar day. */
export function toQueueScopeKey(clinicId: string, dateKey: string): string {
  return `${clinicId}:${dateKey}`;
}

export function resolveClinicDayScope(
  clinicId: string,
  timeZone: string,
  dateKeyInput?: string,
) {
  const dateKey = dateKeyInput ?? getTodayInTimeZone(timeZone);
  const date = dateKeyToStorageDate(dateKey);
  const clinicObjectId = toObjectId(clinicId);

  return {
    clinicId,
    clinicObjectId,
    date,
    dateKey,
    timeZone,
    scopeKey: toQueueScopeKey(clinicId, dateKey),
  };
}

export type ClinicDayScope = ReturnType<typeof resolveClinicDayScope>;
