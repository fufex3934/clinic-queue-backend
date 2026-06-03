import { Transform } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';
import { PatientGender } from '../schemas/patient.schema';

const emptyToUndefined = ({ value }: { value: unknown }) => {
  if (typeof value === 'string' && value.trim() === '') {
    return undefined;
  }
  return value;
};

export class PatientProfileFieldsDto {
  @Transform(emptyToUndefined)
  @IsOptional()
  @IsDateString({}, { message: 'dateOfBirth must be YYYY-MM-DD' })
  dateOfBirth?: string;

  @Transform(emptyToUndefined)
  @IsOptional()
  @IsEnum(PatientGender)
  gender?: PatientGender;

  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim() || undefined : value,
  )
  @IsOptional()
  @IsString()
  @Matches(/^\+?[\d\s\-()]{7,20}$/, {
    message: 'secondaryPhone must be a valid phone number (7–20 digits)',
  })
  secondaryPhone?: string;

  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim() || undefined : value,
  )
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}
