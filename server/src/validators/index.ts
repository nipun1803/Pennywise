import { z } from 'zod';
import { ApiError } from '../utils/errors';
import { imageSchema } from '../controllers/media';

export const id = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid ObjectId').transform(s => s.toLowerCase());
export const name = z.string().trim().min(1).max(80);
const email = z.string().trim().toLowerCase().email().max(254);
const password = z.string().refine(s => Array.from(s).length >= 8, 'Password must have at least 8 characters')
  .refine(s => Buffer.byteLength(s, 'utf8') <= 72, 'Password must not exceed 72 UTF-8 bytes');
export const signupSchema = z.object({ name, email, password }).strict();
// Login must not apply the signup policy or alter a supplied password.
export const loginSchema = z.object({ email, password: z.string().min(1)
  .refine(s => Buffer.byteLength(s, 'utf8') <= 72, 'Password must not exceed 72 UTF-8 bytes') }).strict();
export const nameSchema = z.object({ name }).strict();
const accent = z.enum(['emerald', 'blue', 'amber', 'violet', 'rose']);
export const profileSchema = z.object({ image: imageSchema.optional(), name: name.optional(), avatar: z.enum(['initials', 'leaf', 'sun', 'sparkles', 'coffee']).optional(), avatarColor: accent.optional() }).strict()
  .refine(input => Object.keys(input).length > 0, 'Provide at least one profile field');
export const pushTokenSchema = z.object({ token: z.string().trim().regex(/^Expo(nent)?PushToken\[[\w-]{1,100}\]$/, 'Invalid Expo push token') }).strict();
export const notificationsSchema = z.object({ expenses: z.boolean().optional(), payments: z.boolean().optional(), members: z.boolean().optional() }).strict()
  .refine(input => Object.keys(input).length > 0, 'Provide at least one notification preference');
export const groupSchema = z.object({ image: imageSchema.optional(), name, description: z.string().trim().max(200).optional(), icon: z.enum(['people', 'airplane', 'home', 'restaurant', 'briefcase', 'heart']).optional(), color: accent.optional() }).strict();
export const groupUpdateSchema = groupSchema.partial().refine(input => Object.keys(input).length > 0, 'Provide at least one group field');
export const categorySchema = z.object({ name, icon: z.enum(['food', 'cart', 'bus', 'home', 'bulb', 'bag', 'game', 'airplane', 'heart', 'grid']).default('grid'), color: accent.default('emerald') }).strict();
export const categoryUpdateSchema = categorySchema.partial().extend({ archived: z.boolean().optional() }).strict()
  .refine(input => Object.keys(input).length > 0, 'Provide at least one category field');
export const joinSchema = z.object({ code: z.string().trim().toUpperCase().min(1).max(64) }).strict();
export const amount = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const expenseSchema = z.object({
  description: z.string().trim().min(1).max(200), amountCents: amount, paidBy: id,
  splitMode: z.enum(['all', 'selected', 'allExcept', 'custom']).optional(), splitUserIds: z.array(id).min(1).optional(),
  customSplits: z.array(z.object({ userId: id, shareCents: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER) }).strict()).min(1).optional(),
  excludedUserIds: z.array(id).min(1).optional(), categoryId: z.string().trim().min(1).max(80).optional(),
}).strict();
export type ExpenseInput = z.infer<typeof expenseSchema>;
export function parseExpense(body: unknown, editing = false): ExpenseInput {
  const input = expenseSchema.parse(body);
  if (input.splitMode === 'custom') {
    if (!input.customSplits || new Set(input.customSplits.map(s => s.userId)).size !== input.customSplits.length || input.customSplits.reduce((sum, s) => sum + BigInt(s.shareCents), 0n) !== BigInt(input.amountCents)) throw new ApiError(400, 'VALIDATION_ERROR', 'Custom shares must be unique and add up exactly to the amount');
  } else if (input.customSplits) throw new ApiError(400, 'VALIDATION_ERROR', 'Custom shares require custom mode');
  if (!editing && !input.splitMode) throw new ApiError(400, 'VALIDATION_ERROR', 'splitMode is required');
  if (!editing && !input.categoryId) throw new ApiError(400, 'VALIDATION_ERROR', 'categoryId is required');
  if (input.splitMode === 'selected' && !input.splitUserIds) throw new ApiError(400, 'VALIDATION_ERROR', 'Selected splits require splitUserIds');
  if (input.splitMode !== 'selected' && input.splitUserIds) throw new ApiError(400, 'VALIDATION_ERROR', 'splitUserIds is only allowed with selected mode');
  if (input.splitMode === 'allExcept' && !input.excludedUserIds) throw new ApiError(400, 'VALIDATION_ERROR', 'Exclusions require excludedUserIds');
  if (input.splitMode !== 'allExcept' && input.excludedUserIds) throw new ApiError(400, 'VALIDATION_ERROR', 'excludedUserIds is only allowed with allExcept mode');
  if (input.excludedUserIds && new Set(input.excludedUserIds).size !== input.excludedUserIds.length) throw new ApiError(400, 'VALIDATION_ERROR', 'Excluded members must be unique');
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
