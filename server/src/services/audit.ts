import { Types, type Model, type UpdateQuery } from 'mongoose';
import { User, type AuditEvent } from '../models';
import { ApiError } from '../utils/errors';
export async function auditEvent(actorId: string, action: string, before: Record<string, unknown> | null, after: Record<string, unknown> | null): Promise<AuditEvent> {
  const actor = await User.findById(actorId).select('name').lean();
  return { id: new Types.ObjectId(), actorId, actorName: actor?.name ?? 'Member', action, at: new Date(), before, after };
}
// The action and its audit entry commit in one document write, including on
// standalone MongoDB. CAS retries keep the recorded before-image accurate.
export async function auditedUpdate<T>(model: Model<T>, filter: Record<string, unknown>, actor: string, action: string,
  changes: (current: T) => Promise<{ updates: Record<string, unknown>; before: Record<string, unknown> | null; after: Record<string, unknown> | null } | null> | { updates: Record<string, unknown>; before: Record<string, unknown> | null; after: Record<string, unknown> | null } | null) {
  for (let attempt = 0; attempt < 12; attempt++) {
    const current = await model.findOne(filter);
    if (!current) throw new ApiError(404, 'NOT_FOUND', 'Record not found');
    const change = await changes(current.toObject() as T);
    if (!change) return current;
    const entry = await auditEvent(actor, action, change.before, change.after);
    const version: unknown = current.get('__v');
    const updated = await model.findOneAndUpdate({ ...filter, __v: typeof version === 'number' ? version : { $exists: false } },
      { $set: change.updates, $push: { auditEvents: entry }, $inc: { __v: 1 } } as UpdateQuery<T>, { returnDocument: 'after', runValidators: true });
    if (updated) return updated;
  }
  throw new ApiError(409, 'WRITE_CONFLICT', 'The record changed repeatedly. Refresh and try again.');
}
