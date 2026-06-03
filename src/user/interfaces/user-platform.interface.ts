import { UserPublic } from './user-public.interface';

export interface UserPlatformRow extends UserPublic {
  clinicName: string;
  clinicLocation?: string;
}
