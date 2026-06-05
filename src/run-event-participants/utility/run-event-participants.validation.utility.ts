import { BadRequestException, ConflictException } from '@nestjs/common';
import { Model } from 'mongoose';
import {
  CustomQuestionType,
  ICustomQuestion,
} from '../../run-events/interfaces/run-event.interface';
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
    excludeParticipantId: string,
  ): Promise<void> {
    const duplicate = await participantModel
      .findOne({
        runEventId,
        userId,
        status: ParticipantStatus.SUBMITTED,
        _id: { $ne: excludeParticipantId },
      })
      .exec();

    if (duplicate) {
      throw new ConflictException(
        'You have already registered for this event',
      );
    }
  }

  private static getResponsesRecord(
    participant: RunEventParticipantDocument,
  ): Record<string, CustomQuestionResponseValue> {
    return participant.customQuestionResponses ?? {};
  }
}
