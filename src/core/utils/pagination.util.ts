import type { PaginatedResult } from '../interfaces/common';

export function buildPaginatedResult<T>(
  data: T[],
  totalDocuments: number,
  page: number,
  limit: number,
): PaginatedResult<T> {
  const totalPages = Math.ceil(totalDocuments / limit) || 1;

  return {
    data,
    totalDocuments,
    page,
    limit,
    totalPages,
    hasMore: page < totalPages,
  };
}
