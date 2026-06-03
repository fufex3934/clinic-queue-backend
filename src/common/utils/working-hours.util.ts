import { BadRequestException } from '@nestjs/common';

/** Parses HH:mm to minutes since midnight. */
export function timeSlotToMinutes(timeSlot: string): number {
  const normalized = timeSlot.trim();
  const match = /^(\d{2}):(\d{2})$/.exec(normalized);
  if (!match) {
    throw new BadRequestException(`Invalid time slot format: ${timeSlot}`);
  }
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) {
    throw new BadRequestException(`Invalid time slot: ${timeSlot}`);
  }
  return hours * 60 + minutes;
}

export function assertTimeSlotWithinWorkingHours(
  timeSlot: string,
  workingHoursStart: string,
  workingHoursEnd: string,
): void {
  const slotMinutes = timeSlotToMinutes(timeSlot);
  const startMinutes = timeSlotToMinutes(workingHoursStart);
  const endMinutes = timeSlotToMinutes(workingHoursEnd);

  if (slotMinutes < startMinutes || slotMinutes > endMinutes) {
    throw new BadRequestException(
      `Time slot ${timeSlot} is outside clinic working hours (${workingHoursStart}–${workingHoursEnd})`,
    );
  }
}

/** Generates 30-minute slots from start through end (inclusive of end if on half-hour). */
export function generateTimeSlots(
  workingHoursStart: string,
  workingHoursEnd: string,
  intervalMinutes = 30,
): string[] {
  const start = timeSlotToMinutes(workingHoursStart);
  const end = timeSlotToMinutes(workingHoursEnd);
  const slots: string[] = [];

  for (let m = start; m <= end; m += intervalMinutes) {
    const hours = Math.floor(m / 60);
    const mins = m % 60;
    slots.push(
      `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`,
    );
  }

  return slots;
}
