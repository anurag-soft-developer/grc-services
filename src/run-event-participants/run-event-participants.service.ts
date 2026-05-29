import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { randomUUID } from 'crypto';
import type { PaginatedResult } from '../core/interfaces/common';
import {
  CustomQuestionType,
  ICustomQuestion,
} from '../run-events/interfaces/run-event.interface';
import { RunEventsService } from '../run-events/run-events.service';
import {
  HEAR_ABOUT_US_OPTIONS,
  GENDERS,
} from './constants/common-fields';
import {
  SaveParticipantDraftDto,
  SubmitParticipantDto,
} from './dto/run-event-participants.dto';
import {
  CustomQuestionResponseValue,
  Gender,
  IRunEventParticipant,
  ParticipantStatus,
} from './interfaces/run-event-participant.interface';
import {
  RunEventParticipant,
  RunEventParticipantDocument,
} from './schemas/run-event-participant.schema';

@Injectable()
export class RunEventParticipantsService {
  constructor(
    @InjectModel(RunEventParticipant.name)
    private participantModel: Model<RunEventParticipant>,
    private readonly runEventsService: RunEventsService,
  ) {}

  async createDraft(
    runEventId: string,
  ): Promise<{ _id: string; draftToken: string }> {
    await this.runEventsService.assertPublished(runEventId);

    const draftToken = randomUUID();
    const participant = await this.participantModel.create({
      runEventId,
      draftToken,
      status: ParticipantStatus.DRAFT,
      customQuestionResponses: {},
    });

    return {
      _id: participant._id.toString(),
      draftToken,
    };
  }

  async resumeDraft(token: string): Promise<IRunEventParticipant> {
    const participant = await this.participantModel
      .findOne({ draftToken: token, status: ParticipantStatus.DRAFT })
      .exec();

    if (!participant) {
      throw new NotFoundException('Draft not found');
    }

    return this.toResponse(participant);
  }

  async updateDraft(
    id: string,
    draftToken: string,
    dto: SaveParticipantDraftDto,
  ): Promise<IRunEventParticipant> {
    const participant = await this.findDraftByIdAndToken(id, draftToken);
    this.applyDraftUpdate(participant, dto);
    await participant.save();
    return this.toResponse(participant);
  }

  async submit(
    id: string,
    draftToken: string,
    dto: SubmitParticipantDto,
  ): Promise<IRunEventParticipant> {
    const participant = await this.findDraftByIdAndToken(id, draftToken);
    this.applyDraftUpdate(participant, dto);

    const event = await this.runEventsService.assertPublished(
      participant.runEventId.toString(),
    );

    this.validateSubmission(participant, event.customQuestions ?? []);

    const duplicate = await this.participantModel
      .findOne({
        runEventId: participant.runEventId,
        contactNumber: participant.contactNumber,
        status: ParticipantStatus.SUBMITTED,
        _id: { $ne: participant._id },
      })
      .exec();

    if (duplicate) {
      throw new ConflictException(
        'A submission with this contact number already exists for this event',
      );
    }

    participant.status = ParticipantStatus.SUBMITTED;
    participant.submittedAt = new Date();
    await participant.save();

    return this.toResponse(participant);
  }

  async findAllByEvent(
    runEventId: string,
    page = 1,
    limit = 10,
  ): Promise<PaginatedResult<IRunEventParticipant>> {
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
        .exec(),
      this.participantModel.countDocuments(filter).exec(),
    ]);

    return {
      data: participants.map((p) => this.toResponse(p)),
      totalDocuments: total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 1,
    };
  }

  async findById(id: string): Promise<IRunEventParticipant> {
    const participant = await this.participantModel.findById(id).exec();
    if (!participant) {
      throw new NotFoundException('Participant not found');
    }
    return this.toResponse(participant);
  }

  private async findDraftByIdAndToken(
    id: string,
    draftToken: string,
  ): Promise<RunEventParticipantDocument> {
    const participant = await this.participantModel.findById(id).exec();

    if (!participant) {
      throw new NotFoundException('Participant not found');
    }

    if (participant.status !== ParticipantStatus.DRAFT) {
      throw new BadRequestException(
        'This registration has already been submitted',
      );
    }

    if (participant.draftToken !== draftToken) {
      throw new ForbiddenException('Invalid draft token');
    }

    return participant;
  }

  private applyDraftUpdate(
    participant: RunEventParticipantDocument,
    dto: SaveParticipantDraftDto,
  ): void {
    if (dto.fullName !== undefined) participant.fullName = dto.fullName;
    if (dto.contactNumber !== undefined) {
      participant.contactNumber = dto.contactNumber;
    }
    if (dto.gender !== undefined) {
      participant.gender = dto.gender as Gender;
    }
    if (dto.instagramHandle !== undefined) {
      participant.instagramHandle = dto.instagramHandle;
    }
    if (dto.city !== undefined) participant.city = dto.city;
    if (dto.howDidYouHearAboutUs !== undefined) {
      participant.howDidYouHearAboutUs = dto.howDidYouHearAboutUs;
    }
    if (dto.guidelinesAgreed !== undefined) {
      participant.guidelinesAgreed = dto.guidelinesAgreed;
    }

    if (dto.customQuestionResponses) {
      participant.customQuestionResponses = {
        ...participant.customQuestionResponses,
        ...dto.customQuestionResponses,
      };
      participant.markModified('customQuestionResponses');
    }
  }

  private validateSubmission(
    participant: RunEventParticipantDocument,
    customQuestions: ICustomQuestion[],
  ): void {
    if (!participant.fullName?.trim()) {
      throw new BadRequestException('Full name is required');
    }
    if (!participant.contactNumber?.trim()) {
      throw new BadRequestException('Contact number is required');
    }
    if (!participant.gender || !GENDERS.includes(participant.gender)) {
      throw new BadRequestException('Valid gender is required');
    }
    if (!participant.instagramHandle?.trim()) {
      throw new BadRequestException('Instagram handle is required');
    }
    if (!participant.city?.trim()) {
      throw new BadRequestException('City is required');
    }
    if (
      !participant.howDidYouHearAboutUs?.length ||
      !participant.howDidYouHearAboutUs.every((v) =>
        (HEAR_ABOUT_US_OPTIONS as readonly string[]).includes(v),
      )
    ) {
      throw new BadRequestException(
        'At least one valid "how did you hear about us" option is required',
      );
    }
    if (participant.guidelinesAgreed !== true) {
      throw new BadRequestException('You must agree to the guidelines');
    }

    this.validateCustomQuestionResponses(
      customQuestions,
      this.getResponsesRecord(participant),
    );
  }

  private validateCustomQuestionResponses(
    customQuestions: ICustomQuestion[],
    responses: Record<string, CustomQuestionResponseValue>,
  ): void {
    for (const question of customQuestions) {
      const value = responses[question.key];

      if (
        question.required &&
        (value === undefined || value === null || value === '')
      ) {
        throw new BadRequestException(
          `Response required for question: ${question.label}`,
        );
      }

      if (value === undefined || value === null || value === '') {
        continue;
      }

      switch (question.type) {
        case CustomQuestionType.TEXT:
        case CustomQuestionType.TEXTAREA:
          if (typeof value !== 'string' || !value.trim()) {
            throw new BadRequestException(
              `Invalid response for question: ${question.label}`,
            );
          }
          break;

        case CustomQuestionType.SELECT:
        case CustomQuestionType.RADIO:
          if (typeof value !== 'string' || !question.options?.includes(value)) {
            throw new BadRequestException(
              `Invalid response for question: ${question.label}`,
            );
          }
          break;

        case CustomQuestionType.CHECKBOX:
          if (
            !Array.isArray(value) ||
            !value.length ||
            !value.every((v) => question.options?.includes(v))
          ) {
            throw new BadRequestException(
              `Invalid response for question: ${question.label}`,
            );
          }
          break;
      }
    }
  }

  private getResponsesRecord(
    participant: RunEventParticipantDocument,
  ): Record<string, CustomQuestionResponseValue> {
    return participant.customQuestionResponses ?? {};
  }

  toResponse(participant: RunEventParticipantDocument): IRunEventParticipant {
    return {
      _id: participant._id.toString(),
      runEventId: participant.runEventId.toString(),
      fullName: participant.fullName,
      contactNumber: participant.contactNumber,
      gender: participant.gender,
      instagramHandle: participant.instagramHandle,
      city: participant.city,
      howDidYouHearAboutUs: participant.howDidYouHearAboutUs ?? [],
      guidelinesAgreed: participant.guidelinesAgreed,
      customQuestionResponses: this.getResponsesRecord(participant),
      status: participant.status,
      draftToken: participant.draftToken,
      submittedAt: participant.submittedAt,
      userId: participant.userId?.toString(),
      createdAt: participant.createdAt,
      updatedAt: participant.updatedAt,
    };
  }
}
