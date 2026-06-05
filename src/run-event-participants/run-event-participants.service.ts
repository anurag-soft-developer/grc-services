import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, PopulateOptions } from 'mongoose';
import type { IRajorpayOrder } from '../core/interfaces/rajorpay.interface';
import { RajorpayService } from '../core/services/rajorpay/rajorpay.service';
import type { PaginatedResult } from '../core/interfaces/common';
import { buildPaginatedResult } from '../core/utils/pagination.util';
import { runEventRegistrationSelectFields } from '../run-events/schemas/run-event.schema';
import { RunEventsService } from '../run-events/run-events.service';
import { userSelectFields } from '../users/schemas/user.schema';
import {
  SaveParticipantDraftDto,
  SubmitParticipantDto,
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
import { RunEventParticipantsUtility } from './utility/run-event-participants.utility';
import { RunEventParticipantsValidationUtility } from './utility/run-event-participants.validation.utility';

@Injectable()
export class RunEventParticipantsService {
  static populateOptions: PopulateOptions[] = [
    {
      path: 'userId',
      select: userSelectFields,
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
  ) {}

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
    userId: string,
    dto: SubmitParticipantDto,
  ): Promise<RunEventParticipantDocument> {
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
      if (event.price === 0) {
        RunEventParticipantsUtility.applyFreeSubmissionFields(participant);
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
    userId: string,
  ): Promise<{
    participant: RunEventParticipantDocument;
    order: IRajorpayOrder;
  }> {
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

    const order = await this.rajorpayService.createOrder(
      participant.totalAmount,
      `participant_${participant._id.toString()}`,
    );

    participant.razorpayOrderId = order.id;
    await participant.save();

    return {
      participant: (await participant.populate(
        RunEventParticipantsService.populateOptions,
      )) as RunEventParticipantDocument,
      order,
    };
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
    );

    return (await participant.populate(
      RunEventParticipantsService.populateOptions,
    )) as RunEventParticipantDocument;
  }

  async findAllByEvent(
    runEventId: string,
    page = 1,
    limit = 10,
  ): Promise<PaginatedResult<RunEventParticipantDocument>> {
    await this.runEventsService.findById(runEventId);

    const filter = {
      runEventId,
      status: ParticipantStatus.SUBMITTED,
    };

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
  ): Promise<PaginatedResult<RunEventParticipantDocument>> {
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

  async confirmPaidParticipantByOrderId(
    orderId: string,
    paymentId: string,
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
      paymentId,
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
    paymentId: string;
    event: string;
    refundId?: string;
    refundAmount?: number;
  }): Promise<void> {
    const participant = await this.participantModel
      .findOne({ paymentId: params.paymentId })
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
        $unset: { paymentExpiresAt: '' },
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
