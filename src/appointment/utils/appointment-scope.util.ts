import { FilterQuery, Types } from 'mongoose';
import { toStartOfDay } from '../../common/utils/date.util';
import { toObjectId } from '../../common/utils/mongo.util';
import { Appointment } from '../schemas/appointment.schema';

export interface AppointmentSlotScope {
  clinicId: string;
  clinicObjectId: Types.ObjectId;
  date: Date;
  timeSlot: string;
}

export function normalizeTimeSlot(timeSlot: string): string {
  return timeSlot.trim();
}

export function resolveAppointmentDayScope(
  clinicId: string,
  dateInput: string,
): Omit<AppointmentSlotScope, 'timeSlot'> & { timeSlot?: undefined } {
  return {
    clinicId,
    clinicObjectId: toObjectId(clinicId),
    date: toStartOfDay(dateInput),
  };
}

export function resolveAppointmentSlotScope(
  clinicId: string,
  dateInput: string,
  timeSlot: string,
): AppointmentSlotScope {
  return {
    clinicId,
    clinicObjectId: toObjectId(clinicId),
    date: toStartOfDay(dateInput),
    timeSlot: normalizeTimeSlot(timeSlot),
  };
}

export function buildDayFilter(
  scope: Pick<AppointmentSlotScope, 'clinicObjectId' | 'date'> & {
    timeSlot?: string;
  },
): FilterQuery<Appointment> {
  const filter: FilterQuery<Appointment> = {
    clinicId: scope.clinicObjectId,
    date: scope.date,
  };
  if (scope.timeSlot) {
    filter.timeSlot = scope.timeSlot;
  }
  return filter;
}

export function buildSlotFilter(
  scope: AppointmentSlotScope,
): FilterQuery<Appointment> {
  return {
    clinicId: scope.clinicObjectId,
    date: scope.date,
    timeSlot: scope.timeSlot,
  };
}
