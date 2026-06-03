import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
  MinLength,
} from 'class-validator';
import { ClinicContactFieldsDto } from './clinic-contact.dto';

export class UpdateClinicDto extends ClinicContactFieldsDto {
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsOptional()
  @IsString()
  @MinLength(1)
  location?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, {
    message: 'workingHoursStart must be HH:mm',
  })
  workingHoursStart?: string;

  @IsOptional()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, {
    message: 'workingHoursEnd must be HH:mm',
  })
  workingHoursEnd?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(20)
  maxAppointmentsPerSlot?: number;
}
