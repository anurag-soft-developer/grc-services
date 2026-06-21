export type EventDateRangeFilter = {
  $gte: Date;
  $lte: Date;
};

export function toEventDateRangeFilter(date: Date): EventDateRangeFilter {
  const $gte = new Date(date);
  $gte.setUTCHours(0, 0, 0, 0);
  const $lte = new Date(date);
  $lte.setUTCHours(23, 59, 59, 999);
  return { $gte, $lte };
}

export function startOfTodayUtc(): Date {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

export function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function buildCityFilterValue(city: string): { $regex: RegExp } {
  return {
    $regex: new RegExp(`^${escapeRegex(city.trim())}$`, 'i'),
  };
}
