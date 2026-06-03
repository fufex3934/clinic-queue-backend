import { PaginatedResult } from '../interfaces/paginated-result.interface';

export const DEFAULT_PAGE = 1;
export const DEFAULT_LIMIT = 20;
export const MAX_LIMIT = 100;

export function parsePagination(query: {
  page?: number;
  limit?: number;
}): { page: number; limit: number; skip: number } {
  const page = Math.max(1, Number(query.page) || DEFAULT_PAGE);
  const limit = Math.min(
    MAX_LIMIT,
    Math.max(1, Number(query.limit) || DEFAULT_LIMIT),
  );
  const skip = (page - 1) * limit;
  return { page, limit, skip };
}

export function buildPaginatedResult<T>(
  items: T[],
  total: number,
  page: number,
  limit: number,
): PaginatedResult<T> {
  return {
    items,
    total,
    page,
    limit,
    totalPages: Math.max(1, Math.ceil(total / limit)),
  };
}

export function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function buildMongoSort(
  sortBy: string | undefined,
  sortOrder: 'asc' | 'desc' | undefined,
  allowed: Record<string, string>,
  defaultField: string,
): Record<string, 1 | -1> {
  const field = allowed[sortBy ?? ''] ?? defaultField;
  const dir: 1 | -1 = sortOrder === 'asc' ? 1 : -1;
  return { [field]: dir };
}
