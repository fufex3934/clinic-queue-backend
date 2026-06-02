import { IsMongoId } from 'class-validator';

export class AddToQueueDto {
  @IsMongoId({ message: 'patientId must be a valid MongoDB id' })
  patientId: string;
}
