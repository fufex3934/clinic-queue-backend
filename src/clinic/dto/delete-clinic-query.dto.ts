import { IsIn, IsOptional } from 'class-validator';

export class DeleteClinicQueryDto {
  /** When `true`, permanently removes the clinic and all tenant data. */
  @IsOptional()
  @IsIn(['true', 'false'])
  permanent?: string;
}
