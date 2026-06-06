export interface IDashboardAnalyticsRevenue {
  totalCollected: number;
  paidRegistrations: number;
  currency: string;
}

export interface IDashboardAnalytics {
  totalEvents: number;
  totalRegistrations: number;
  revenue: IDashboardAnalyticsRevenue;
  fromDate: string | null;
  toDate: string | null;
}
