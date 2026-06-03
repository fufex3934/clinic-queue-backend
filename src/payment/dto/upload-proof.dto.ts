import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class UploadProofDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(2_000_000)
  proofImage: string;
}
