import { ApiError } from './errors';
import { paginationSchema } from '../validators';

export function pagination(query: unknown) {
  const { page, limit } = paginationSchema.parse(query);
  const skip = (page - 1) * limit;
  if (!Number.isSafeInteger(skip)) throw new ApiError(400, 'VALIDATION_ERROR', 'Page is too large');
  return { page, limit, skip };
}
export const pageView = (page: number, limit: number, total: number) => ({ page, limit, total, totalPages: Math.ceil(total / limit) });
