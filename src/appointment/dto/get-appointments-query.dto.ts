import { Transform } from 'class-transformer';
import { IsDateString, IsOptional, IsString, Matches, MinLength } from 'class-validator';
import { ClinicScopeQueryDto } from '../../common/dto/clinic-scope-query.dto';

export class GetAppointmentsQueryDto extends ClinicScopeQueryDto {
  @IsDateString({}, { message: 'date query param is required (YYYY-MM-DD)' })
  date: string;

  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(1)
  @Matches(/^\d{2}:\d{2}(-\d{2}:\d{2})?$/, {
    message: 'timeSlot must be like 09:00 or 09:00-09:30',
  })
  timeSlot?: string;
}
