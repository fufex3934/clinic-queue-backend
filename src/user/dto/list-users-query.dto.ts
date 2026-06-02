import { IsMongoId, IsOptional } from 'class-validator';

export class ListUsersQueryDto {
  @IsOptional()
  @IsMongoId()
  clinicId?: string;
}
