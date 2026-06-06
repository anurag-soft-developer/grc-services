export interface DashboardDateBounds {
  from: Date | null;
  to: Date | null;
}

export function resolveDashboardDateBounds(
  fromDate?: Date,
  toDate?: Date,
): DashboardDateBounds {
  if (!fromDate && !toDate) {
    return { from: null, to: null };
  }

  let from: Date | null = null;
  let to: Date | null = null;

  if (fromDate) {
    from = new Date(fromDate);
    from.setUTCHours(0, 0, 0, 0);
  }

  if (toDate) {
    to = new Date(toDate);
    to.setUTCHours(23, 59, 59, 999);
  }

  return { from, to };
}

export function toDateOnlyIso(date: Date): string {
  return date.toISOString().slice(0, 10);
}
