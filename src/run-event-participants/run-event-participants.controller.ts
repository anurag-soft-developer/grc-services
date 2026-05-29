import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { Public } from '../auth/decorators/public.decorator';
import { Roles, UserRole } from '../auth/decorators/roles.decorator';
import {
  ListParticipantsDto,
  ResumeDraftDto,
  SaveParticipantDraftDto,
  SubmitParticipantDto,
} from './dto/run-event-participants.dto';
import { RunEventParticipantsService } from './run-event-participants.service';

@Controller()
export class RunEventParticipantsController {
  constructor(
    private readonly participantsService: RunEventParticipantsService,
  ) {}

  @Public()
  @Post('run-events/:eventId/participants/draft')
  async createDraft(@Param('eventId') eventId: string) {
    return this.participantsService.createDraft(eventId);
  }

  @Public()
  @Get('run-event-participants/draft')
  async resumeDraft(@Query() query: ResumeDraftDto) {
    return this.participantsService.resumeDraft(query.token);
  }

  @Public()
  @Patch('run-event-participants/:id')
  async updateDraft(
    @Param('id') id: string,
    @Headers('x-draft-token') draftToken: string,
    @Body() dto: SaveParticipantDraftDto,
  ) {
    return this.participantsService.updateDraft(id, draftToken, dto);
  }

  @Public()
  @Post('run-event-participants/:id/submit')
  async submit(
    @Param('id') id: string,
    @Headers('x-draft-token') draftToken: string,
    @Body() dto: SubmitParticipantDto,
  ) {
    return this.participantsService.submit(id, draftToken, dto);
  }

  @Roles(UserRole.ADMIN)
  @Get('run-events/:eventId/participants')
  async listByEvent(
    @Param('eventId') eventId: string,
    @Query() query: ListParticipantsDto,
  ) {
    return this.participantsService.findAllByEvent(
      eventId,
      query.page,
      query.limit,
    );
  }

  @Roles(UserRole.ADMIN)
  @Get('run-event-participants/:id')
  async findById(@Param('id') id: string) {
    return this.participantsService.findById(id);
  }
}
