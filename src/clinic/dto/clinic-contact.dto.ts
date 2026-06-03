import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

const emptyToUndefined = ({ value }: { value: unknown }) => {
  if (typeof value === 'string' && value.trim() === '') {
    return undefined;
  }
  return value;
};

export class ClinicContactFieldsDto {
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim() || undefined : value,
  )
  @IsOptional()
  @IsString()
  @Matches(/^\+?[\d\s\-()]{7,20}$/, {
    message: 'phone must be a valid phone number (7–20 digits)',
  })
  phone?: string;

  @Transform(emptyToUndefined)
  @IsOptional()
  @IsEmail()
  email?: string;

  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim() || undefined : value,
  )
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  timezone?: string;

  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim() || undefined : value,
  )
  @IsOptional()
  @IsString()
  @MaxLength(200)
  addressLine?: string;

  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim() || undefined : value,
  )
  @IsOptional()
  @IsString()
  @MaxLength(100)
  city?: string;

  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim() || undefined : value,
  )
  @IsOptional()
  @IsString()
  @MaxLength(100)
  country?: string;
}
