import { IsString, MinLength } from 'class-validator';

export class LoginDto {
  /** Email address or phone number used at registration */
  @IsString()
  @MinLength(1)
  identifier: string;

  @IsString()
  @MinLength(1)
  password: string;
}
