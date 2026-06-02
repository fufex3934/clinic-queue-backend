import { IsOptional, IsString, MinLength } from 'class-validator';
import { ClinicScopeQueryDto } from '../../common/dto/clinic-scope-query.dto';

export class ListPatientsQueryDto extends ClinicScopeQueryDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  search?: string;
}
