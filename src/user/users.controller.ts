import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { UserRole } from './schemas/user.schema';
import { CreateUserDto } from './dto/create-user.dto';
import { ListUsersQueryDto } from './dto/list-users-query.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UsersService } from './users.service';

@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.PLATFORM_ADMIN)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListUsersQueryDto,
  ) {
    return this.usersService.list(user, query.clinicId);
  }

  @Get(':id')
  findOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.usersService.findOne(user, id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() createUserDto: CreateUserDto,
  ) {
    return this.usersService.create(user, createUserDto);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() updateUserDto: UpdateUserDto,
  ) {
    return this.usersService.update(user, id, updateUserDto);
  }
}
