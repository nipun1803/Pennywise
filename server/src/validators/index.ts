import { z } from 'zod';
import { ApiError } from '../utils/errors';

export const id = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid ObjectId').transform(s => s.toLowerCase());
export const name = z.string().trim().min(1).max(80);
const email = z.string().trim().toLowerCase().email().max(254);
const password = z.string().refine(s => Array.from(s).length >= 10, 'Password must have at least 10 characters')
  .refine(s => Buffer.byteLength(s, 'utf8') <= 72, 'Password must not exceed 72 UTF-8 bytes');
export const signupSchema = z.object({ name, email, password }).strict();
// Login must not apply the signup policy or alter a supplied password.
export const loginSchema = z.object({ email, password: z.string().min(1)
  .refine(s => Buffer.byteLength(s, 'utf8') <= 72, 'Password must not exceed 72 UTF-8 bytes') }).strict();
export const nameSchema = z.object({ name }).strict();
export const joinSchema = z.object({ code: z.string().trim().toUpperCase().min(1).max(64) }).strict();
export const amount = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const expenseSchema = z.object({
  description: z.string().trim().min(1).max(200), amountCents: amount, paidBy: id,
  splitMode: z.enum(['all', 'selected']).optional(), splitUserIds: z.array(id).min(1).optional(),
}).strict();
export type ExpenseInput = z.infer<typeof expenseSchema>;
export function parseExpense(body: unknown, editing = false): ExpenseInput {
  const input = expenseSchema.parse(body);
  if (!editing && !input.splitMode) throw new ApiError(400, 'VALIDATION_ERROR', 'splitMode is required');
  if (input.splitMode === 'selected' && !input.splitUserIds) throw new ApiError(400, 'VALIDATION_ERROR', 'Selected splits require splitUserIds');
  if (input.splitMode !== 'selected' && input.splitUserIds) throw new ApiError(400, 'VALIDATION_ERROR', 'splitUserIds is only allowed with selected mode');
  if (input.splitUserIds && new Set(input.splitUserIds).size !== input.splitUserIds.length) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'Split members must be unique');
  }
  return input;
}
export const settlementSchema = z.object({ fromUser: id, toUser: id, amountCents: amount }).strict()
  .refine(s => s.fromUser !== s.toUser, 'Sender and receiver must be different');
export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).max(Number.MAX_SAFE_INTEGER).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});
export const searchSchema = z.string().trim().max(80).default('');
export const requestKeySchema = z.string().uuid('Idempotency-Key must be a UUID').transform(s => s.toLowerCase());
