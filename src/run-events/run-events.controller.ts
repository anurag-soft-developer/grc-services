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
import {
  CreateRunEventDto,
  ListPublishedRunEventsDto,
  ListRunEventsDto,
  UpdateRunEventDto,
} from './dto/run-events.dto';
import { RunEventParticipantsService } from '../run-event-participants/run-event-participants.service';
import { RunEventsService } from './run-events.service';

@Controller('run-events')
export class RunEventsController {
  constructor(
    private readonly runEventsService: RunEventsService,
    private readonly participantsService: RunEventParticipantsService,
  ) {}

  @Roles(UserRole.ADMIN)
  @Post()
  async create(@CurrentUser() user: IUser, @Body() dto: CreateRunEventDto) {
    return this.runEventsService.create(dto, user._id.toString());
  }

  @Roles(UserRole.ADMIN)
  @Get()
  async findAll(@Query() query: ListRunEventsDto) {
    return this.runEventsService.findAll(query);
  }

  @Public()
  @Get('public')
  async findPublic(@Query() query: ListPublishedRunEventsDto) {
    return this.runEventsService.findPublic(query);
  }

  @Public()
  @Get('public/:slug')
  async findPublishedBySlug(@Param('slug') slug: string) {
    const event = await this.runEventsService.findPublishedBySlug(slug);
    return event.toJSON();
  }

  @Get(':eventId/registration-context')
  async getRegistrationContext(@Param('eventId') eventId: string) {
    const event = await this.runEventsService.getRegistrationContext(eventId);
    return {
      event: event.toJSON(),
    };
  }

  @Roles(UserRole.ADMIN)
  @Get(':id/analytics')
  async getAnalytics(@Param('id') id: string) {
    return this.participantsService.getEventAnalytics(id);
  }

  @Roles(UserRole.ADMIN)
  @Get(':id')
  async findById(@Param('id') id: string) {
    return this.runEventsService.findById(id);
  }

  @Roles(UserRole.ADMIN)
  @Patch(':id')
  async update(@Param('id') id: string, @Body() dto: UpdateRunEventDto) {
    return this.runEventsService.update(id, dto);
  }

  @Roles(UserRole.ADMIN)
  @Patch(':id/publish')
  async publish(@Param('id') id: string) {
    return this.runEventsService.publish(id);
  }

  @Roles(UserRole.ADMIN)
  @Patch(':id/close')
  async close(@Param('id') id: string) {
    return this.runEventsService.close(id);
  }

  @Roles(UserRole.ADMIN)
  @Patch(':id/archive')
  async archive(@Param('id') id: string) {
    return this.runEventsService.archive(id);
  }

  @Roles(UserRole.ADMIN)
  @Patch(':id/pause-registrations')
  async pauseRegistrations(@Param('id') id: string) {
    return this.runEventsService.pauseRegistrations(id);
  }

  @Roles(UserRole.ADMIN)
  @Patch(':id/resume-registrations')
  async resumeRegistrations(@Param('id') id: string) {
    return this.runEventsService.resumeRegistrations(id);
  }

  @Roles(UserRole.ADMIN)
  @Delete(':id')
  async remove(@Param('id') id: string) {
    await this.runEventsService.remove(id);
    return { success: true };
  }
}
