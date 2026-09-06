import { Injectable, OnModuleInit } from "@nestjs/common";
import { MessengerService } from "./messenger.service";

@Injectable()
export class MessengerOrderRoutingGuardService implements OnModuleInit {
  constructor(private readonly messengerService: MessengerService) {}

  onModuleInit() {
    const service = this.messengerService as MessengerService & {
      shouldUpdateCustomerOrder?: (...args: unknown[]) => boolean;
    };

    // Legacy implicit updates are unsafe: a normal new-order message must never
    // mutate the customer's previous open order just because the customer has one.
    // Explicit existing-order edits are handled by AiOrderStatusContextService.
    service.shouldUpdateCustomerOrder = () => false;
  }
}
