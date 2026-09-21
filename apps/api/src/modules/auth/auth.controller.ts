import { Body, Controller, Post } from "@nestjs/common";
import { RateLimit } from "../../common/rate-limit/rate-limit.decorator";
import { AuthService } from "./auth.service";
import { LoginDto } from "./dto";

@Controller("auth")
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @RateLimit({ limit: 5, windowSeconds: 15 * 60, key: "ip" })
  @Post("login")
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }
}
