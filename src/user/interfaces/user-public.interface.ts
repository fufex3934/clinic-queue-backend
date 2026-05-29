import { UserRole } from '../schemas/user.schema';

export interface UserPublic {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  role: UserRole;
  clinicId: string;
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
}
