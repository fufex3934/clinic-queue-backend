import { UserRole } from '../../user/schemas/user.schema';

export interface JwtPayload {
  sub: string;
  role: UserRole;
  clinicId: string;
}
