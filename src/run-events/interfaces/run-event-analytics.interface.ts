export interface IRunEventAnalyticsByStatus {
  submitted: number;
  pending_payment: number;
  draft: number;
  cancelled: number;
}

export interface IRunEventAnalyticsByPaymentStatus {
  paid: number;
  pending: number;
  failed: number;
  refunded: number;
}

export interface IRunEventAnalyticsRevenue {
  totalCollected: number;
  paidRegistrations: number;
}

export interface IRunEventAnalytics {
  eventId: string;
  title: string;
  currency: string;
  price: number | null;
  maxParticipants: number | null;
  registeredCount: number;
  byStatus: IRunEventAnalyticsByStatus;
  byPaymentStatus: IRunEventAnalyticsByPaymentStatus;
  revenue: IRunEventAnalyticsRevenue;
  capacityPercent: number | null;
}
