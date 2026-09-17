import { Controller, Delete, Get, Param, Post, Query, Res, UseGuards } from "@nestjs/common";
import type { Response } from "express";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { GoogleWorkspaceService } from "./google-workspace.service";

@Controller("google-workspace")
export class GoogleWorkspaceController {
  constructor(private readonly google: GoogleWorkspaceService) {}

  @UseGuards(JwtAuthGuard)
  @Get("oauth/start")
  startOAuth(@Res() response: Response) {
    response.redirect(this.google.getOAuthUrl());
  }

  @Get("oauth/callback")
  async oauthCallback(@Query("code") code: string, @Query("state") state: string, @Res() response: Response) {
    if (!code || !state) {
      response.status(400).send("Google OAuth authorization was not completed.");
      return;
    }
    const result = await this.google.handleOAuthCallback(code, state);
    const frontend = process.env.WEB_PUBLIC_URL ?? process.env.FRONTEND_URL ?? "http://localhost:3000";
    response.redirect(`${frontend}/settings?google=connected&email=${encodeURIComponent(result.email ?? "")}`);
  }

  @UseGuards(JwtAuthGuard)
  @Get("status")
  status() {
    return this.google.status();
  }

  @UseGuards(JwtAuthGuard)
  @Post("orders/:id/sync")
  syncOrder(@Param("id") id: string) {
    return this.google.syncOrder(id);
  }

  @UseGuards(JwtAuthGuard)
  @Delete("orders/:id/event")
  deleteOrderEvent(@Param("id") id: string) {
    return this.google.deleteOrderEvent(id);
  }

  @UseGuards(JwtAuthGuard)
  @Delete("connection")
  disconnect() {
    return this.google.disconnect();
  }
}
