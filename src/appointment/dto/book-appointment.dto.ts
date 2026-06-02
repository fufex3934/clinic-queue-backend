import { Transform } from 'class-transformer';
import { IsDateString, IsMongoId, IsString, Matches, MinLength } from 'class-validator';

export class BookAppointmentDto {
  @IsMongoId({ message: 'patientId must be a valid MongoDB id' })
  patientId: string;

  @IsDateString({}, { message: 'date must be a valid ISO date (YYYY-MM-DD)' })
  date: string;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(1)
  @Matches(/^\d{2}:\d{2}(-\d{2}:\d{2})?$/, {
    message: 'timeSlot must be like 09:00 or 09:00-09:30',
  })
  timeSlot: string;
}
