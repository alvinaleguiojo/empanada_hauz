import { Module } from "@nestjs/common";
import { FraudController } from "./fraud.controller";
import { FraudOrderInterceptor } from "./fraud-order.interceptor";
import { FraudRiderInterceptor } from "./fraud-rider.interceptor";
import { FraudService } from "./fraud.service";

@Module({
  controllers: [FraudController],
  providers: [FraudService, FraudOrderInterceptor, FraudRiderInterceptor],
  exports: [FraudService, FraudOrderInterceptor, FraudRiderInterceptor]
})
export class FraudModule {}
