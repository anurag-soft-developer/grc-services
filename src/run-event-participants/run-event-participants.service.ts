import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, PopulateOptions, Types } from 'mongoose';
import type { IRajorpayOrder } from '../core/interfaces/rajorpay.interface';
import { config } from '../core/config/env.config';
import {
  BookingCounterService,
  RUN_EVENT_PARTICIPANT_BOOKING_COUNTER_KEY,
} from '../core/services/booking-counter.service';
import { RajorpayService } from '../core/services/rajorpay/rajorpay.service';
import type { PaginatedResult } from '../core/interfaces/common';
import { buildPaginatedResult } from '../core/utils/pagination.util';
import type { IRunEventAnalytics } from '../run-events/interfaces/run-event-analytics.interface';
import { runEventRegistrationSelectFields } from '../run-events/schemas/run-event.schema';
import { RunEventsService } from '../run-events/run-events.service';
import { userSelectFields } from '../users/schemas/user.schema';
import type { IUser } from '../users/interfaces/user.interface';
import {
  SaveParticipantDraftDto,
  SubmitParticipantDto,
  VerifyRazorpayHostedPaymentDto,
  VerifyRazorpayPaymentDto,
} from './dto/run-event-participants.dto';
import {
  IMyEventRegistrationStatus,
  ParticipantStatus,
  PaymentStatus,
} from './interfaces/run-event-participant.interface';
import {
  RunEventParticipant,
  RunEventParticipantDocument,
} from './schemas/run-event-participant.schema';
import {
  RunEventParticipantsUtility,
  buildEventMatchForMyRegistrations,
  needsEventJoinForMyRegistrations,
  sortForMyRegistrations,
  type MyRegistrationsListFilters,
} from './utility/run-event-participants.utility';
import { RunEventParticipantsValidationUtility } from './utility/run-event-participants.validation.utility';
import {
  buildEventParticipantsBaseMatch,
  type EventParticipantsListFilters,
} from './utility/run-event-participants-list-filter.util';

@Injectable()
export class RunEventParticipantsService {
  static populateOptions: PopulateOptions[] = [
    {
      path: 'userId',
      select: `${userSelectFields} phone`,
    },
    {
      path: 'runEventId',
      select: runEventRegistrationSelectFields,
    },
  ];

  constructor(
    @InjectModel(RunEventParticipant.name)
    private participantModel: Model<RunEventParticipant>,
    private readonly runEventsService: RunEventsService,
    private readonly rajorpayService: RajorpayService,
    private readonly bookingCounterService: BookingCounterService,
  ) {}

  private allocateBookingId(): Promise<number> {
    return this.bookingCounterService.nextSequence(
      RUN_EVENT_PARTICIPANT_BOOKING_COUNTER_KEY,
    );
  }

  async getMyRegistrationForEvent(
    runEventId: string,
    userId: string,
  ): Promise<IMyEventRegistrationStatus> {
    await this.releaseExpiredPaymentHolds();

    const priorityStatuses = [
      ParticipantStatus.SUBMITTED,
      ParticipantStatus.PENDING_PAYMENT,
      ParticipantStatus.DRAFT,
    ] as const;

    for (const status of priorityStatuses) {
      const participant = await this.participantModel
        .findOne({ runEventId, userId, status })
        .select('_id status paymentExpiresAt paymentStatus')
        .lean()
        .exec();

      if (!participant) {
        continue;
      }

      const paymentHoldExpired =
        status === ParticipantStatus.PENDING_PAYMENT &&
        !!participant.paymentExpiresAt &&
        new Date(participant.paymentExpiresAt) <= new Date();

      return {
        status: participant.status,
        participantId: participant._id.toString(),
        paymentExpiresAt: participant.paymentExpiresAt?.toISOString(),
        ...(status === ParticipantStatus.PENDING_PAYMENT
          ? { paymentHoldExpired }
          : {}),
      };
    }

    return { status: 'none' };
  }

  async getOrCreateDraft(
    runEventId: string,
    userId: string,
  ): Promise<RunEventParticipantDocument> {
    await this.releaseExpiredPaymentHolds();
    await this.runEventsService.assertRegistration(runEventId);

    const existingSubmitted = await this.participantModel
      .findOne({
        runEventId,
        userId,
        status: ParticipantStatus.SUBMITTED,
      })
      .exec();

    if (existingSubmitted) {
      throw new ConflictException(
        'You have already registered for this event',
      );
    }

    const existingActive = await this.participantModel
      .findOne({
        runEventId,
        userId,
        status: {
          $in: [ParticipantStatus.DRAFT, ParticipantStatus.PENDING_PAYMENT],
        },
      })
      .populate(RunEventParticipantsService.populateOptions)
      .exec();

    if (existingActive) {
      return existingActive;
    }

    const participant = await this.participantModel.create({
      runEventId,
      userId,
      status: ParticipantStatus.DRAFT,
      customQuestionResponses: {},
    });

    return participant.populate(RunEventParticipantsService.populateOptions);
  }

  async updateDraft(
    runEventId: string,
    userId: string,
    dto: SaveParticipantDraftDto,
  ): Promise<RunEventParticipantDocument> {
    const participant =
      await RunEventParticipantsUtility.findDraftByEventAndUser(
        this.participantModel,
        runEventId,
        userId,
      );
    RunEventParticipantsUtility.applyDraftUpdate(participant, dto);
    return (await participant.save()).populate(
      RunEventParticipantsService.populateOptions,
    );
  }

  async submit(
    runEventId: string,
    user: IUser,
    dto: SubmitParticipantDto,
  ): Promise<RunEventParticipantDocument> {
    const userId = user._id.toString();
    const participant =
      await RunEventParticipantsUtility.findDraftByEventAndUser(
        this.participantModel,
        runEventId,
        userId,
      );
    RunEventParticipantsUtility.applyDraftUpdate(participant, dto);

    const event = await this.runEventsService.assertRegistration(runEventId);
    RunEventParticipantsValidationUtility.validateSubmission(
      participant,
      event.customQuestions ?? [],
    );

    if (event.price === 0) {
      await RunEventParticipantsValidationUtility.assertNoDuplicateSubmission(
        this.participantModel,
        runEventId,
        userId,
        participant._id.toString(),
      );
    }

    await this.runEventsService.reserveRegistrationSlot(runEventId);

    try {
      RunEventParticipantsUtility.applyUserSnapshot(participant, user);

      if (event.price === 0) {
        await RunEventParticipantsUtility.applyFreeSubmissionFields(
          participant,
          () => this.allocateBookingId(),
        );
      } else {
        RunEventParticipantsUtility.applyPendingPaymentFields(
          participant,
          event.price,
        );
      }

      return (await participant.save()).populate(
        RunEventParticipantsService.populateOptions,
      );
    } catch (error) {
      await this.runEventsService.releaseRegistrationSlot(runEventId);
      throw error;
    }
  }

  async createOrder(
    runEventId: string,
    user: IUser,
    paymentLink = false,
  ): Promise<{
    participant: RunEventParticipantDocument;
    order: IRajorpayOrder;
    paymentLink?: {
      id: string;
      shortUrl: string;
      callbackUrl: string;
    };
  }> {
    const userId = user._id.toString();
    await this.releaseExpiredPaymentHolds();

    const participant =
      await RunEventParticipantsUtility.findPendingPaymentByEventAndUser(
        this.participantModel,
        runEventId,
        userId,
      );

    if (RunEventParticipantsValidationUtility.isPaymentHoldExpired(participant)) {
      throw new BadRequestException(
        'Payment hold expired. Please submit your registration again.',
      );
    }

    if (!participant.totalAmount || participant.totalAmount <= 0) {
      throw new BadRequestException('This registration does not require payment');
    }

    const participantId = participant._id.toString();
    const order = await RunEventParticipantsUtility.resolveOrCreateRazorpayOrder(
      this.rajorpayService,
      participant,
      participantId,
    );

    const populatedParticipant = (await participant.populate(
      RunEventParticipantsService.populateOptions,
    )) as RunEventParticipantDocument;

    if (!paymentLink) {
      return {
        participant: populatedParticipant,
        order,
      };
    }

    const callbackUrl = `${config.FRONTEND_URL}/payments/razorpay/callback?eventId=${encodeURIComponent(runEventId)}&participantId=${encodeURIComponent(participantId)}`;
    const minExpireBy =
      Math.floor(Date.now() / 1000) +
      RajorpayService.PAYMENT_LINK_MIN_EXPIRY_SECONDS;
    const expireBy = Math.max(
      participant.paymentExpiresAt
        ? Math.floor(participant.paymentExpiresAt.getTime() / 1000)
        : minExpireBy,
      minExpireBy,
    );

    const resolvedPaymentLink =
      await RunEventParticipantsUtility.resolveOrCreateRazorpayPaymentLink(
        this.rajorpayService,
        participant,
        user,
        runEventId,
        participantId,
        order,
        callbackUrl,
        expireBy,
      );

    const participantWithLink = (await participant.populate(
      RunEventParticipantsService.populateOptions,
    )) as RunEventParticipantDocument;

    return {
      participant: participantWithLink,
      order,
      paymentLink: resolvedPaymentLink,
    };
  }

  async verifyHostedPayment(
    runEventId: string,
    userId: string,
    dto: VerifyRazorpayHostedPaymentDto,
  ): Promise<RunEventParticipantDocument> {
    await this.releaseExpiredPaymentHolds();

    const participant = await this.participantModel.findById(dto.participantId);
    if (!participant) {
      throw new NotFoundException('Participant not found');
    }

    if (participant.runEventId.toString() !== runEventId) {
      throw new BadRequestException('Participant does not belong to this event');
    }

    if (participant.userId.toString() !== userId) {
      throw new ForbiddenException(
        'You can only verify your own registration payment',
      );
    }

    if (participant.paymentStatus === PaymentStatus.PAID) {
      return (await participant.populate(
        RunEventParticipantsService.populateOptions,
      )) as RunEventParticipantDocument;
    }

    if (participant.status !== ParticipantStatus.PENDING_PAYMENT) {
      throw new BadRequestException(
        'Only pending payment registrations can be paid',
      );
    }

    if (RunEventParticipantsValidationUtility.isPaymentHoldExpired(participant)) {
      throw new BadRequestException(
        'Payment hold expired. Please submit your registration again.',
      );
    }

    if (dto.razorpay_payment_link_status !== 'paid') {
      throw new BadRequestException('Payment was not completed');
    }

    if (
      participant.razorpayPaymentLinkId &&
      participant.razorpayPaymentLinkId !== dto.razorpay_payment_link_id
    ) {
      throw new BadRequestException(
        'Payment link does not match this registration',
      );
    }

    const isValidSignature = this.rajorpayService.verifyPaymentLinkSignature({
      paymentLinkId: dto.razorpay_payment_link_id,
      referenceId: dto.razorpay_payment_link_reference_id,
      status: dto.razorpay_payment_link_status,
      paymentId: dto.razorpay_payment_id,
      signature: dto.razorpay_signature,
    });
    if (!isValidSignature) {
      throw new BadRequestException('Invalid payment signature');
    }

    const orderId = participant.razorpayOrderId;
    if (!orderId) {
      throw new BadRequestException('Payment order not found for this registration');
    }

    await RunEventParticipantsUtility.confirmPaidParticipant(
      this.participantModel,
      participant,
      orderId,
      dto.razorpay_payment_id,
      () => this.allocateBookingId(),
    );

    return (await participant.populate(
      RunEventParticipantsService.populateOptions,
    )) as RunEventParticipantDocument;
  }

  async verifyPayment(
    runEventId: string,
    userId: string,
    dto: VerifyRazorpayPaymentDto,
  ): Promise<RunEventParticipantDocument> {
    await this.releaseExpiredPaymentHolds();

    const participant = await this.participantModel.findById(dto.participantId);
    if (!participant) {
      throw new NotFoundException('Participant not found');
    }

    if (participant.runEventId.toString() !== runEventId) {
      throw new BadRequestException('Participant does not belong to this event');
    }

    if (participant.userId.toString() !== userId) {
      throw new ForbiddenException(
        'You can only verify your own registration payment',
      );
    }

    if (participant.paymentStatus === PaymentStatus.PAID) {
      return (await participant.populate(
        RunEventParticipantsService.populateOptions,
      )) as RunEventParticipantDocument;
    }

    if (participant.status !== ParticipantStatus.PENDING_PAYMENT) {
      throw new BadRequestException(
        'Only pending payment registrations can be paid',
      );
    }

    if (RunEventParticipantsValidationUtility.isPaymentHoldExpired(participant)) {
      throw new BadRequestException(
        'Payment hold expired. Please submit your registration again.',
      );
    }

    if (
      participant.razorpayOrderId &&
      participant.razorpayOrderId !== dto.razorpay_order_id
    ) {
      throw new BadRequestException(
        'Payment order does not match this registration',
      );
    }

    const isValidSignature = this.rajorpayService.verifyPaymentSignature({
      razorpayOrderId: dto.razorpay_order_id,
      razorpayPaymentId: dto.razorpay_payment_id,
      razorpaySignature: dto.razorpay_signature,
    });
    if (!isValidSignature) {
      throw new BadRequestException('Invalid payment signature');
    }

    await RunEventParticipantsUtility.confirmPaidParticipant(
      this.participantModel,
      participant,
      dto.razorpay_order_id,
      dto.razorpay_payment_id,
      () => this.allocateBookingId(),
    );

    return (await participant.populate(
      RunEventParticipantsService.populateOptions,
    )) as RunEventParticipantDocument;
  }

  async findAllByEvent(
    runEventId: string,
    page = 1,
    limit = 10,
    filters: EventParticipantsListFilters = {},
  ): Promise<PaginatedResult<RunEventParticipantDocument>> {
    await this.runEventsService.findById(runEventId);

    const filter = buildEventParticipantsBaseMatch(runEventId, filters);
    const skip = (page - 1) * limit;

    const [participants, total] = await Promise.all([
      this.participantModel
        .find(filter)
        .sort({ submittedAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate(RunEventParticipantsService.populateOptions)
        .exec(),
      this.participantModel.countDocuments(filter).exec(),
    ]);

    return buildPaginatedResult(participants, total, page, limit);
  }

  async getEventAnalytics(runEventId: string): Promise<IRunEventAnalytics> {
    const event = await this.runEventsService.findById(runEventId);
    const runEventObjectId = new Types.ObjectId(runEventId);

    const [statusAgg, paymentAgg, revenueAgg] = await Promise.all([
      this.participantModel.aggregate<{ _id: string; count: number }>([
        { $match: { runEventId: runEventObjectId } },
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]),
      this.participantModel.aggregate<{ _id: string; count: number }>([
        { $match: { runEventId: runEventObjectId } },
        { $group: { _id: '$paymentStatus', count: { $sum: 1 } } },
      ]),
      this.participantModel.aggregate<{
        totalCollected: number;
        paidRegistrations: number;
      }>([
        {
          $match: {
            runEventId: runEventObjectId,
            paymentStatus: PaymentStatus.PAID,
          },
        },
        {
          $group: {
            _id: null,
            totalCollected: { $sum: { $ifNull: ['$totalAmount', 0] } },
            paidRegistrations: { $sum: 1 },
          },
        },
      ]),
    ]);

    const byStatus = {
      submitted: 0,
      pending_payment: 0,
      draft: 0,
      cancelled: 0,
    };
    for (const row of statusAgg) {
      const key = row._id as keyof typeof byStatus;
      if (key in byStatus) {
        byStatus[key] = row.count;
      }
    }

    const byPaymentStatus = {
      paid: 0,
      pending: 0,
      failed: 0,
      refunded: 0,
    };
    for (const row of paymentAgg) {
      const key = row._id as keyof typeof byPaymentStatus;
      if (key in byPaymentStatus) {
        byPaymentStatus[key] = row.count;
      }
    }

    const revenueRow = revenueAgg[0];
    const registeredCount = event.registeredCount ?? 0;
    const maxParticipants = event.maxParticipants ?? null;
    const capacityPercent =
      maxParticipants != null && maxParticipants > 0
        ? Math.round((registeredCount / maxParticipants) * 100)
        : null;

    return {
      eventId: runEventId,
      title: event.title,
      currency: event.currency ?? 'INR',
      price: event.price ?? null,
      maxParticipants,
      registeredCount,
      byStatus,
      byPaymentStatus,
      revenue: {
        totalCollected: revenueRow?.totalCollected ?? 0,
        paidRegistrations: revenueRow?.paidRegistrations ?? 0,
      },
      capacityPercent,
    };
  }

  async findById(id: string): Promise<RunEventParticipantDocument> {
    const participant = await this.participantModel
      .findById(id)
      .populate(RunEventParticipantsService.populateOptions)
      .exec();
    if (!participant) {
      throw new NotFoundException('Participant not found');
    }
    return participant;
  }

  async findByIdForUser(
    id: string,
    userId: string,
    isAdmin: boolean,
  ): Promise<RunEventParticipantDocument> {
    const participant = await this.findById(id);
    if (
      !isAdmin &&
      participant.userId.toString() !== userId
    ) {
      throw new ForbiddenException(
        'You can only view your own registrations',
      );
    }
    return participant;
  }

  async listMine(
    userId: string,
    page = 1,
    limit = 10,
    filters: MyRegistrationsListFilters = {},
  ): Promise<PaginatedResult<RunEventParticipantDocument>> {
    if (!needsEventJoinForMyRegistrations(filters)) {
      const filter = {
        userId,
        status: {
          $in: [
            ParticipantStatus.SUBMITTED,
            ParticipantStatus.PENDING_PAYMENT,
          ],
        },
      };

      const skip = (page - 1) * limit;
      const [participants, total] = await Promise.all([
        this.participantModel
          .find(filter)
          .sort({ updatedAt: -1 })
          .skip(skip)
          .limit(limit)
          .populate(RunEventParticipantsService.populateOptions)
          .exec(),
        this.participantModel.countDocuments(filter).exec(),
      ]);

      return buildPaginatedResult(participants, total, page, limit);
    }

    return this.listMineWithEventFilters(userId, page, limit, filters);
  }

  private async listMineWithEventFilters(
    userId: string,
    page: number,
    limit: number,
    filters: MyRegistrationsListFilters,
  ): Promise<PaginatedResult<RunEventParticipantDocument>> {
    const skip = (page - 1) * limit;
    const eventsCollection =
      this.runEventsService.getEventsCollectionName();
    const eventMatch = buildEventMatchForMyRegistrations(filters);
    const sort = sortForMyRegistrations(filters);

    const [aggregateResult] = await this.participantModel.aggregate<{
      data: Array<{ _id: Types.ObjectId }>;
      total: Array<{ count: number }>;
    }>([
      {
        $match: {
          userId: new Types.ObjectId(userId),
          status: {
            $in: [
              ParticipantStatus.SUBMITTED,
              ParticipantStatus.PENDING_PAYMENT,
            ],
          },
        },
      },
      {
        $lookup: {
          from: eventsCollection,
          let: { runEventId: '$runEventId' },
          pipeline: [
            {
              $match: {
                $expr: { $eq: ['$_id', '$$runEventId'] },
                ...eventMatch,
              },
            },
          ],
          as: 'event',
        },
      },
      { $match: { 'event.0': { $exists: true } } },
      { $set: { event: { $first: '$event' } } },
      { $sort: sort },
      {
        $facet: {
          data: [{ $skip: skip }, { $limit: limit }],
          total: [{ $count: 'count' }],
        },
      },
    ]);

    const rows = aggregateResult?.data ?? [];
    const total = aggregateResult?.total?.[0]?.count ?? 0;
    const ids = rows.map((row) => row._id);

    if (ids.length === 0) {
      return buildPaginatedResult([], total, page, limit);
    }

    const participants = await this.participantModel
      .find({ _id: { $in: ids } })
      .populate(RunEventParticipantsService.populateOptions)
      .exec();

    const order = new Map(
      ids.map((id, index) => [id.toString(), index]),
    );
    participants.sort(
      (a, b) =>
        (order.get(a._id.toString()) ?? 0) -
        (order.get(b._id.toString()) ?? 0),
    );

    return buildPaginatedResult(participants, total, page, limit);
  }

  async confirmPaidParticipantByOrderId(
    orderId: string,
    razorpayPaymentId: string,
  ): Promise<void> {
    const participant = await this.participantModel
      .findOne({ razorpayOrderId: orderId })
      .exec();
    if (!participant || participant.paymentStatus === PaymentStatus.PAID) {
      return;
    }
    if (participant.status !== ParticipantStatus.PENDING_PAYMENT) {
      return;
    }
    await RunEventParticipantsUtility.confirmPaidParticipant(
      this.participantModel,
      participant,
      orderId,
      razorpayPaymentId,
      () => this.allocateBookingId(),
    );
  }

  async applyFailedPaymentByOrderId(orderId: string): Promise<void> {
    const participant = await this.participantModel
      .findOne({ razorpayOrderId: orderId })
      .exec();
    if (!participant || participant.status !== ParticipantStatus.PENDING_PAYMENT) {
      return;
    }

    RunEventParticipantsUtility.applyFailedPaymentFields(
      participant,
      'Payment failed via Razorpay webhook',
    );
    await participant.save();
    await this.runEventsService.releaseRegistrationSlot(
      participant.runEventId.toString(),
    );
  }

  async applyRefundWebhook(params: {
    razorpayPaymentId: string;
    event: string;
    refundId?: string;
    refundAmount?: number;
  }): Promise<void> {
    const participant = await this.participantModel
      .findOne({ razorpayPaymentId: params.razorpayPaymentId })
      .exec();
    if (!participant) {
      return;
    }

    RunEventParticipantsUtility.applyRefundFields(participant, params);
    await participant.save();
  }

  async releaseExpiredPaymentHolds(): Promise<void> {
    const now = new Date();
    const expired = await this.participantModel
      .find({
        status: ParticipantStatus.PENDING_PAYMENT,
        paymentExpiresAt: { $lte: now },
      })
      .select('runEventId')
      .exec();

    if (expired.length === 0) {
      return;
    }

    await this.participantModel.updateMany(
      {
        status: ParticipantStatus.PENDING_PAYMENT,
        paymentExpiresAt: { $lte: now },
      },
      {
        $set: {
          status: ParticipantStatus.CANCELLED,
          paymentStatus: PaymentStatus.FAILED,
          cancelledAt: now,
          cancelReason: 'Payment was not confirmed in time',
        },
        $unset: {
          paymentExpiresAt: '',
          razorpayOrderId: '',
          razorpayPaymentLinkId: '',
          razorpayPaymentLinkShortUrl: '',
          razorpayPaymentLinkCallbackUrl: '',
        },
      },
    );

    const releaseCounts = new Map<string, number>();
    for (const participant of expired) {
      const eventId = participant.runEventId.toString();
      releaseCounts.set(eventId, (releaseCounts.get(eventId) ?? 0) + 1);
    }

    for (const [eventId, count] of releaseCounts) {
      await this.runEventsService.releaseRegistrationSlots(eventId, count);
    }
  }
}
