import { Transform } from 'class-transformer';
import { IsString, MinLength } from 'class-validator';
import { ClinicContactFieldsDto } from './clinic-contact.dto';

export class CreateClinicDto extends ClinicContactFieldsDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(1)
  name: string;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(1)
  location: string;
}
