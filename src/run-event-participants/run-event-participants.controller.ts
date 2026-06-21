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
} from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles, UserRole } from '../auth/decorators/roles.decorator';
import type { IUser } from '../users/interfaces/user.interface';
import {
  CreateOrderQueryDto,
  ListMyParticipantsDto,
  ListParticipantsDto,
  SaveParticipantDraftDto,
  SubmitParticipantDto,
  VerifyRazorpayHostedPaymentDto,
  VerifyRazorpayPaymentDto,
} from './dto/run-event-participants.dto';
import { RunEventParticipantsService } from './run-event-participants.service';

@Controller()
export class RunEventParticipantsController {
  constructor(
    private readonly participantsService: RunEventParticipantsService,
  ) {}

  @Get('run-events/:eventId/participants/my-registration')
  async getMyRegistration(
    @Param('eventId') eventId: string,
    @CurrentUser() user: IUser,
  ) {
    return this.participantsService.getMyRegistrationForEvent(
      eventId,
      user._id.toString(),
    );
  }

  @Get('run-events/:eventId/participants/draft')
  async getOrCreateDraft(
    @Param('eventId') eventId: string,
    @CurrentUser() user: IUser,
  ) {
    return this.participantsService.getOrCreateDraft(
      eventId,
      user._id.toString(),
    );
  }

  @Patch('run-events/:eventId/participants/draft')
  async updateDraft(
    @Param('eventId') eventId: string,
    @CurrentUser() user: IUser,
    @Body() dto: SaveParticipantDraftDto,
  ) {
    return this.participantsService.updateDraft(
      eventId,
      user._id.toString(),
      dto,
    );
  }

  @Post('run-events/:eventId/participants/draft/submit')
  async submit(
    @Param('eventId') eventId: string,
    @CurrentUser() user: IUser,
    @Body() dto: SubmitParticipantDto,
  ) {
    return this.participantsService.submit(eventId, user, dto);
  }

  @Post('run-events/:eventId/participants/draft/create-order')
  @HttpCode(HttpStatus.CREATED)
  async createOrder(
    @Param('eventId') eventId: string,
    @CurrentUser() user: IUser,
    @Query() query: CreateOrderQueryDto,
  ) {
    return this.participantsService.createOrder(
      eventId,
      user,
      query.paymentLink,
    );
  }

  @Post('run-events/:eventId/participants/verify-hosted-payment')
  @HttpCode(HttpStatus.OK)
  async verifyHostedPayment(
    @Param('eventId') eventId: string,
    @CurrentUser() user: IUser,
    @Body() dto: VerifyRazorpayHostedPaymentDto,
  ) {
    return this.participantsService.verifyHostedPayment(
      eventId,
      user._id.toString(),
      dto,
    );
  }

  @Post('run-events/:eventId/participants/verify-payment')
  @HttpCode(HttpStatus.OK)
  async verifyPayment(
    @Param('eventId') eventId: string,
    @CurrentUser() user: IUser,
    @Body() dto: VerifyRazorpayPaymentDto,
  ) {
    return this.participantsService.verifyPayment(
      eventId,
      user._id.toString(),
      dto,
    );
  }

  @Get('run-event-participants/me')
  async listMine(
    @CurrentUser() user: IUser,
    @Query() query: ListMyParticipantsDto,
  ) {
    return this.participantsService.listMine(
      user._id.toString(),
      query.page,
      query.limit,
      {
        segment: query.segment,
        eventDate: query.eventDate,
        city: query.city,
      },
    );
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
      {
        search: query.search,
        paymentStatus: query.paymentStatus,
        submittedAt: query.submittedAt,
      },
    );
  }

  @Get('run-event-participants/:id')
  async findById(
    @Param('id') id: string,
    @CurrentUser() user: IUser,
  ) {
    return this.participantsService.findByIdForUser(
      id,
      user._id.toString(),
      user.role === UserRole.ADMIN,
    );
  }
}
