import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Public } from '../auth/decorators/public.decorator';
import { Roles, UserRole } from '../auth/decorators/roles.decorator';
import type { IUser } from '../users/interfaces/user.interface';
import { COMMON_FIELDS } from '../run-event-participants/constants/common-fields';
import {
  CreateRunEventDto,
  ListPublishedRunEventsDto,
  ListRunEventsDto,
  UpdateRunEventDto,
} from './dto/run-events.dto';
import { RunEventsService } from './run-events.service';

@Controller('run-events')
export class RunEventsController {
  constructor(private readonly runEventsService: RunEventsService) {}

  @Roles(UserRole.ADMIN)
  @Post()
  async create(@CurrentUser() user: IUser, @Body() dto: CreateRunEventDto) {
    const event = await this.runEventsService.create(dto, user._id.toString());
    return this.runEventsService.toResponse(event);
  }

  @Roles(UserRole.ADMIN)
  @Get()
  async findAll(@Query() query: ListRunEventsDto) {
    return this.runEventsService.findAll(
      query.status,
      query.page,
      query.limit,
      query.lat,
      query.long,
      query.maxDistanceMeters,
    );
  }

  @Public()
  @Get('public')
  async findPublished(@Query() query: ListPublishedRunEventsDto) {
    return this.runEventsService.findPublished(
      query.page,
      query.limit,
      query.lat,
      query.long,
      query.maxDistanceMeters,
    );
  }

  @Public()
  @Get('public/:slug')
  async findPublishedBySlug(@Param('slug') slug: string) {
    const event = await this.runEventsService.findPublishedBySlug(slug);
    return {
      ...this.runEventsService.toResponse(event),
      commonFields: COMMON_FIELDS,
    };
  }

  @Roles(UserRole.ADMIN)
  @Get(':id')
  async findById(@Param('id') id: string) {
    const event = await this.runEventsService.findById(id);
    return this.runEventsService.toResponse(event);
  }

  @Roles(UserRole.ADMIN)
  @Patch(':id')
  async update(@Param('id') id: string, @Body() dto: UpdateRunEventDto) {
    const event = await this.runEventsService.update(id, dto);
    return this.runEventsService.toResponse(event);
  }

  @Roles(UserRole.ADMIN)
  @Patch(':id/publish')
  async publish(@Param('id') id: string) {
    const event = await this.runEventsService.publish(id);
    return this.runEventsService.toResponse(event);
  }

  @Roles(UserRole.ADMIN)
  @Patch(':id/close')
  async close(@Param('id') id: string) {
    const event = await this.runEventsService.close(id);
    return this.runEventsService.toResponse(event);
  }

  @Roles(UserRole.ADMIN)
  @Delete(':id')
  async remove(@Param('id') id: string) {
    await this.runEventsService.remove(id);
    return { success: true };
  }
}
