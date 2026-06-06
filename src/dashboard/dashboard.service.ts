import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, PipelineStage } from 'mongoose';
import {
  ParticipantStatus,
  PaymentStatus,
} from '../run-event-participants/interfaces/run-event-participant.interface';
import {
  RunEventParticipant,
  RunEventParticipantDocument,
} from '../run-event-participants/schemas/run-event-participant.schema';
import {
  RunEvent,
  RunEventDocument,
} from '../run-events/schemas/run-event.schema';
import type { IDashboardAnalytics } from './interfaces/dashboard-analytics.interface';
import {
  resolveDashboardDateBounds,
  toDateOnlyIso,
} from './utility/dashboard-date-range.util';

@Injectable()
export class DashboardService {
  constructor(
    @InjectModel(RunEvent.name)
    private readonly runEventModel: Model<RunEventDocument>,
    @InjectModel(RunEventParticipant.name)
    private readonly participantModel: Model<RunEventParticipantDocument>,
  ) {}

  async getAnalytics(
    fromDate?: Date,
    toDate?: Date,
  ): Promise<IDashboardAnalytics> {
    const { from, to } = resolveDashboardDateBounds(fromDate, toDate);
    const hasRange = from != null || to != null;

    const eventFilter = this.buildCreatedAtFilter(from, to);
    const registrationFilter = {
      ...this.buildCreatedAtFilter(from, to),
      status: { $ne: ParticipantStatus.CANCELLED },
    };

    const [totalEvents, totalRegistrations, revenueAgg] = await Promise.all([
      this.runEventModel.countDocuments(eventFilter).exec(),
      this.participantModel.countDocuments(registrationFilter).exec(),
      this.aggregateRevenue(from, to, hasRange),
    ]);

    const revenueRow = revenueAgg[0];

    return {
      totalEvents,
      totalRegistrations,
      revenue: {
        totalCollected: revenueRow?.totalCollected ?? 0,
        paidRegistrations: revenueRow?.paidRegistrations ?? 0,
        currency: 'INR',
      },
      fromDate: from ? toDateOnlyIso(from) : null,
      toDate: to ? toDateOnlyIso(to) : null,
    };
  }

  private buildCreatedAtFilter(
    from: Date | null,
    to: Date | null,
  ): Record<string, unknown> {
    if (!from && !to) {
      return {};
    }

    const createdAt: Record<string, Date> = {};
    if (from) {
      createdAt.$gte = from;
    }
    if (to) {
      createdAt.$lte = to;
    }

    return { createdAt };
  }

  private async aggregateRevenue(
    from: Date | null,
    to: Date | null,
    hasRange: boolean,
  ): Promise<
    Array<{ totalCollected: number; paidRegistrations: number }>
  > {
    const pipeline: PipelineStage[] = [
      { $match: { paymentStatus: PaymentStatus.PAID } },
    ];

    if (hasRange) {
      const rangeConditions: Record<string, unknown>[] = [];
      const effectiveDate = { $ifNull: ['$paidAt', '$createdAt'] };

      if (from) {
        rangeConditions.push({ $gte: [effectiveDate, from] });
      }
      if (to) {
        rangeConditions.push({ $lte: [effectiveDate, to] });
      }

      pipeline.push({
        $match: {
          $expr:
            rangeConditions.length === 1
              ? rangeConditions[0]
              : { $and: rangeConditions },
        },
      });
    }

    pipeline.push({
      $group: {
        _id: null,
        totalCollected: { $sum: { $ifNull: ['$totalAmount', 0] } },
        paidRegistrations: { $sum: 1 },
      },
    });

    return this.participantModel.aggregate<{
      totalCollected: number;
      paidRegistrations: number;
    }>(pipeline);
  }
}
