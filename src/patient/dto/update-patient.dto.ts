import { Transform } from 'class-transformer';
import {
  IsNotEmpty,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { PatientProfileFieldsDto } from './patient-profile.dto';

export class UpdatePatientDto extends PatientProfileFieldsDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  @MaxLength(100)
  name: string;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  @Matches(/^\+?[\d\s\-()]{7,20}$/, {
    message: 'phone must be a valid phone number (7–20 digits)',
  })
  phone: string;
}
