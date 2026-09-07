import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { IsEmail, IsEnum, IsOptional, IsString, MinLength } from "class-validator";
import { UserRole } from "@prisma/client";
import { AdminGuard } from "../ai-instructions/admin.guard";
import { AdminUsersService } from "./admin-users.service";

class CreateUserDto {
  @IsEmail() email!: string;
  @IsString() @MinLength(2) name!: string;
  @IsString() @MinLength(8) password!: string;
  @IsEnum(UserRole) role!: UserRole;
}

class UpdateUserDto {
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() @MinLength(2) name?: string;
  @IsOptional() @IsString() @MinLength(8) password?: string;
  @IsOptional() @IsEnum(UserRole) role?: UserRole;
}

@Controller("admin")
@UseGuards(AuthGuard("jwt"), AdminGuard)
export class AdminUsersController {
  constructor(private readonly service: AdminUsersService) {}

  @Get("users") listUsers() { return this.service.listUsers(); }
  @Post("users") createUser(@Body() dto: CreateUserDto) { return this.service.createUser(dto); }
  @Patch("users/:id") updateUser(@Param("id") id: string, @Body() dto: UpdateUserDto) { return this.service.updateUser(id, dto); }
  @Delete("users/:id") removeUser(@Param("id") id: string) { return this.service.removeUser(id); }
  @Get("roles") roles() { return this.service.roles(); }
  @Get("permissions") permissions() { return this.service.permissions(); }
}
