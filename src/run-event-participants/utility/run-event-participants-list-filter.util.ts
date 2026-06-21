import { Types } from 'mongoose';
import type { EventDateRangeFilter } from '../../run-events/utility/run-events-list-filter.util';
import { escapeRegex } from '../../run-events/utility/run-events-list-filter.util';
import {
  ParticipantStatus,
  PaymentStatus,
} from '../interfaces/run-event-participant.interface';

export interface EventParticipantsListFilters {
  search?: string;
  paymentStatus?: PaymentStatus;
  submittedAt?: EventDateRangeFilter;
}

function buildSearchRegex(search: string): RegExp {
  return new RegExp(escapeRegex(search.trim()), 'i');
}

export function buildEventParticipantsSearchMatch(
  search: string,
): Record<string, unknown> {
  const regex = buildSearchRegex(search);
  const escapedPattern = escapeRegex(search.trim());

  return {
    $or: [
      { fullName: regex },
      { email: regex },
      { phone: regex },
      { invoiceId: regex },
      { razorpayOrderId: regex },
      { paymentId: regex },
      { razorpayPaymentLinkId: regex },
      {
        $expr: {
          $regexMatch: {
            input: { $toString: '$_id' },
            regex: escapedPattern,
            options: 'i',
          },
        },
      },
    ],
  };
}

export function buildEventParticipantsBaseMatch(
  runEventId: string,
  filters: EventParticipantsListFilters,
): Record<string, unknown> {
  const match: Record<string, unknown> = {
    runEventId: new Types.ObjectId(runEventId),
    status: ParticipantStatus.SUBMITTED,
  };

  if (filters.paymentStatus) {
    match.paymentStatus = filters.paymentStatus;
  }
  if (filters.submittedAt) {
    match.submittedAt = filters.submittedAt;
  }

  const search = filters.search?.trim();
  if (search) {
    Object.assign(match, buildEventParticipantsSearchMatch(search));
  }

  return match;
}
