import { UserRole } from '../../user/schemas/user.schema';

export interface AuthUserResponse {
  id: string;
  name: string;
  role: UserRole;
  clinicId: string;
}

export interface AuthResponse {
  accessToken: string;
  user: AuthUserResponse;
}
