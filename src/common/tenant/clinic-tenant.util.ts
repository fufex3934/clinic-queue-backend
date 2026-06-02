import { ForbiddenException } from '@nestjs/common';
import { AuthenticatedUser } from '../../auth/interfaces/authenticated-user.interface';
import { UserRole } from '../../user/schemas/user.schema';

export function getClinicIdFromUser(user: AuthenticatedUser): string {
  return user.clinicId;
}

export function isPlatformAdmin(user: AuthenticatedUser): boolean {
  return user.role === UserRole.PLATFORM_ADMIN;
}

/** Clinic-scoped staff (admin or receptionist) — not platform-wide. */
export function isClinicStaff(user: AuthenticatedUser): boolean {
  return (
    user.role === UserRole.ADMIN || user.role === UserRole.RECEPTIONIST
  );
}

/**
 * Ensures the user may access the given clinic.
 * Platform admins may access any clinic; all other roles only their own.
 */
export function assertClinicAccess(
  user: AuthenticatedUser,
  clinicId: string,
): void {
  if (isPlatformAdmin(user)) {
    return;
  }

  if (user.clinicId !== clinicId) {
    throw new ForbiddenException('Access denied for this clinic');
  }
}
