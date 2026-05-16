import { IsString } from "class-validator";

export class SendMessageDto {
  @IsString()
  recipientPsid!: string;

  @IsString()
  text!: string;
}
