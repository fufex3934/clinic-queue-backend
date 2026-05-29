import { UserRole } from '../../user/schemas/user.schema';

/** Attached to `request.user` after JWT validation. */
export interface AuthenticatedUser {
  id: string;
  name: string;
  role: UserRole;
  clinicId: string;
}
