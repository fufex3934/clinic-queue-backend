import { ArrayMinSize, IsArray, IsMongoId } from 'class-validator';

export class ReorderQueueDto {
  @IsArray()
  @ArrayMinSize(1)
  @IsMongoId({ each: true })
  orderedEntryIds: string[];
}
