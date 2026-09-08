import { Body, Controller, Post } from "@nestjs/common";
import { IsArray, IsIn, IsNumber, IsOptional, IsString, Max, MaxLength, Min } from "class-validator";
import { AiPublicAgentService, PublicAgentFormContext, PublicAgentHistoryMessage } from "./ai-public-agent.service";

class PublicAgentItemDto {
  @IsString()
  @MaxLength(120)
  name!: string;

  @IsNumber()
  @Min(1)
  @Max(999)
  quantity!: number;
}

class PublicAgentContextDto implements PublicAgentFormContext {
  @IsOptional()
  @IsArray()
  selectedFlavors?: PublicAgentItemDto[];

  @IsOptional()
  @IsString()
  @MaxLength(30)
  deliveryMethod?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  paymentMethod?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  deliveryDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  address?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  landmark?: string;
}

class PublicAgentHistoryMessageDto implements PublicAgentHistoryMessage {
  @IsIn(["user", "assistant"])
  role!: "user" | "assistant";

  @IsString()
  @MaxLength(1200)
  content!: string;
}

class PublicAgentChatDto {
  @IsString()
  @MaxLength(80)
  sessionId!: string;

  @IsString()
  @MaxLength(600)
  message!: string;

  @IsOptional()
  @IsArray()
  history?: PublicAgentHistoryMessageDto[];

  @IsOptional()
  context?: PublicAgentContextDto;
}

@Controller("ai/public")
export class AiPublicAgentController {
  constructor(private readonly publicAgent: AiPublicAgentService) {}

  @Post("chat")
  chat(@Body() dto: PublicAgentChatDto) {
    return this.publicAgent.chat(dto.sessionId, dto.message, dto.history, dto.context);
  }
}
