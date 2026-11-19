import { createHash } from 'node:crypto';
import type { Model } from 'mongoose';
import { Expense, Settlement, type CreationRecord } from '../models';
import { ApiError, isDuplicate } from '../utils/errors';

export type CreationKind = 'expense' | 'settlement';
export interface CreationScope { groupId: string; userId: string; key: string; hash: string }
export const fingerprint = (payload: unknown) => createHash('sha256').update(JSON.stringify(payload)).digest('hex');
async function lookup(kind: CreationKind, scope: CreationScope) {
  // Both collections have the same creation metadata; the query includes tombstones.
  const collection = (kind === 'expense' ? Expense : Settlement) as unknown as Model<CreationRecord>;
  const record = await collection.findOne({ groupId: scope.groupId, createdBy: scope.userId, requestKey: scope.key })
    .select('+requestHash +creationResponse').lean();
  if (!record) return null;
  if (record.requestHash !== scope.hash) throw new ApiError(409, 'IDEMPOTENCY_CONFLICT', 'Idempotency-Key was already used with different data');
  return record.creationResponse;
}
export async function createOnce(kind: CreationKind, scope: CreationScope, create: () => Promise<Record<string, unknown>>) {
  const existing = await lookup(kind, scope);
  if (existing) return existing;
  try { return await create(); }
  catch (error) {
    if (isDuplicate(error)) {
      const winner = await lookup(kind, scope);
      if (winner) return winner;
    }
    throw error;
  }
}
