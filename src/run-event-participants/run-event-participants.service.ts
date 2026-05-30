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
import { runEventSelectFields } from '../run-events/schemas/run-event.schema';
import { RunEventsService } from '../run-events/run-events.service';
import { userSelectFields } from '../users/schemas/user.schema';
import {
  SaveParticipantDraftDto,
  SubmitParticipantDto,
  VerifyRazorpayPaymentDto,
} from './dto/run-event-participants.dto';
import {
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
      select: runEventSelectFields,
    },
  ];

  constructor(
    @InjectModel(RunEventParticipant.name)
    private participantModel: Model<RunEventParticipant>,
    private readonly runEventsService: RunEventsService,
    private readonly rajorpayService: RajorpayService,
  ) {}

  async getOrCreateDraft(
    runEventId: string,
    userId: string,
  ): Promise<RunEventParticipantDocument> {
    await this.runEventsService.assertPublished(runEventId);
    await this.releaseExpiredPaymentHolds();

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

    const event = await this.runEventsService.findById(runEventId);
    await RunEventParticipantsValidationUtility.assertEventHasCapacity(
      this.participantModel,
      runEventId,
      event.maxParticipants,
    );

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

    const event = await this.runEventsService.assertPublished(runEventId);
    RunEventParticipantsValidationUtility.validateSubmission(
      participant,
      event.customQuestions ?? [],
    );

    await RunEventParticipantsValidationUtility.assertEventHasCapacity(
      this.participantModel,
      runEventId,
      event.maxParticipants,
    );

    if (event.price === 0) {
      await RunEventParticipantsValidationUtility.assertNoDuplicateSubmission(
        this.participantModel,
        runEventId,
        userId,
        participant.contactNumber!,
        participant._id.toString(),
      );
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

    const event = await this.runEventsService.findById(runEventId);
    await RunEventParticipantsUtility.confirmPaidParticipant(
      this.participantModel,
      participant,
      dto.razorpay_order_id,
      dto.razorpay_payment_id,
      event.maxParticipants,
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

    return {
      data: participants,
      totalDocuments: total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 1,
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
    const event = await this.runEventsService.findById(
      participant.runEventId.toString(),
    );
    await RunEventParticipantsUtility.confirmPaidParticipant(
      this.participantModel,
      participant,
      orderId,
      paymentId,
      event.maxParticipants,
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
  }
}
