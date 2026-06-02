import { IsString, MinLength } from 'class-validator';

export class UpdatePatientDto {
  @IsString()
  @MinLength(2)
  name: string;

  @IsString()
  @MinLength(7)
  phone: string;
}
