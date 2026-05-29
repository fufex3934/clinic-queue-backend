import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { AuthenticatedUser } from '../../auth/interfaces/authenticated-user.interface';
import {
  assertClinicAccess,
  getClinicIdFromUser,
  isPlatformAdmin,
} from './clinic-tenant.util';

/**
 * Resolves clinic scope for operational APIs (patients, queue, appointments).
 * Platform admins must pass clinicId; clinic staff use their own tenant.
 */
export function resolveOperationalClinicId(
  user: AuthenticatedUser,
  clinicIdQuery?: string,
): string {
  if (isPlatformAdmin(user)) {
    const id = clinicIdQuery?.trim();
    if (!id) {
      throw new BadRequestException(
        'clinicId query parameter is required for platform administrators',
      );
    }
    assertClinicAccess(user, id);
    return id;
  }

  const ownClinicId = getClinicIdFromUser(user);
  if (clinicIdQuery?.trim() && clinicIdQuery.trim() !== ownClinicId) {
    throw new ForbiddenException('Access denied for this clinic');
  }
  return ownClinicId;
}
