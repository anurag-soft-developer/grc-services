import { ConflictException, NotFoundException } from '@nestjs/common';
import { Model } from 'mongoose';
import { RunEvent, RunEventDocument } from '../schemas/run-event.schema';

export class RunEventsRegistrationUtility {
  /**
   * Atomically reserves one registration slot (concurrent-safe).
   */
  static async reserveRegistrationSlot(
    runEventModel: Model<RunEvent>,
    runEventId: string,
  ): Promise<RunEventDocument> {
    const event = await runEventModel
      .findOneAndUpdate(
        {
          _id: runEventId,
          $expr: { $lt: ['$registeredCount', '$maxParticipants'] },
        },
        { $inc: { registeredCount: 1 } },
        { new: true },
      )
      .exec();

    if (event) {
      return event;
    }

    const exists = await runEventModel.findById(runEventId).exec();
    if (!exists) {
      throw new NotFoundException('Run event not found');
    }
    throw new ConflictException('This event has reached maximum participants');
  }

  /**
   * Releases one reserved slot; count will not go below zero.
   */
  static async releaseRegistrationSlot(
    runEventModel: Model<RunEvent>,
    runEventId: string,
  ): Promise<void> {
    await runEventModel
      .findOneAndUpdate(
        { _id: runEventId, registeredCount: { $gt: 0 } },
        { $inc: { registeredCount: -1 } },
      )
      .exec();
  }

  /**
   * Releases multiple slots in one atomic update (e.g. expired payment holds).
   */
  static async releaseRegistrationSlots(
    runEventModel: Model<RunEvent>,
    runEventId: string,
    count: number,
  ): Promise<void> {
    if (count <= 0) {
      return;
    }

    await runEventModel
      .updateOne(
        { _id: runEventId },
        [
          {
            $set: {
              registeredCount: {
                $max: [0, { $subtract: ['$registeredCount', count] }],
              },
            },
          },
        ],
      )
      .exec();
  }
}
