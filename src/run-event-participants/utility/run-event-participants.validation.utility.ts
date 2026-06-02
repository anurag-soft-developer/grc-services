import { BadRequestException, ConflictException } from '@nestjs/common';
import { Model } from 'mongoose';
import {
  CustomQuestionType,
  ICustomQuestion,
} from '../../run-events/interfaces/run-event.interface';
import { HEAR_ABOUT_US_OPTIONS, GENDERS } from '../constants/common-fields';
import {
  CustomQuestionResponseValue,
  ParticipantStatus,
} from '../interfaces/run-event-participant.interface';
import {
  RunEventParticipant,
  RunEventParticipantDocument,
} from '../schemas/run-event-participant.schema';

export class RunEventParticipantsValidationUtility {
  static isPaymentHoldExpired(
    participant: RunEventParticipantDocument,
  ): boolean {
    return (
      !!participant.paymentExpiresAt &&
      new Date(participant.paymentExpiresAt) <= new Date()
    );
  }

  static validateSubmission(
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

    RunEventParticipantsValidationUtility.validateCustomQuestionResponses(
      customQuestions,
      RunEventParticipantsValidationUtility.getResponsesRecord(participant),
    );
  }

  static validateCustomQuestionResponses(
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

  static async assertNoDuplicateSubmission(
    participantModel: Model<RunEventParticipant>,
    runEventId: string,
    userId: string,
    contactNumber: string,
    excludeParticipantId: string,
  ): Promise<void> {
    const duplicate = await participantModel
      .findOne({
        runEventId,
        status: ParticipantStatus.SUBMITTED,
        _id: { $ne: excludeParticipantId },
        $or: [{ userId }, { contactNumber }],
      })
      .exec();

    if (duplicate) {
      throw new ConflictException(
        duplicate.userId?.toString() === userId
          ? 'You have already registered for this event'
          : 'A submission with this contact number already exists for this event',
      );
    }
  }

  private static getResponsesRecord(
    participant: RunEventParticipantDocument,
  ): Record<string, CustomQuestionResponseValue> {
    return participant.customQuestionResponses ?? {};
  }
}
