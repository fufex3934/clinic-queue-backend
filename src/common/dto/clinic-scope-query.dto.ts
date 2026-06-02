import { IsMongoId, IsOptional } from 'class-validator';

export class ClinicScopeQueryDto {
  @IsOptional()
  @IsMongoId()
  clinicId?: string;
}
