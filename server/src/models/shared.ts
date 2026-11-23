import { Schema, type Types } from 'mongoose';

export interface AuditEvent { id: Types.ObjectId; actorId: string; actorName: string; action: string; at: Date; before: Record<string, unknown> | null; after: Record<string, unknown> | null }
export interface CreationRecord {
  _id: Types.ObjectId; groupId: Types.ObjectId; createdBy: Types.ObjectId;
  requestKey: string; requestHash: string; creationResponse: Record<string, unknown>;
  createdAt: Date; updatedAt: Date; updatedBy: Types.ObjectId | null;
  deletedAt: Date | null; deletedBy: Types.ObjectId | null;
  auditEvents?: AuditEvent[];
}

export const ref = (name: string) => ({ type: Schema.Types.ObjectId, ref: name, required: true });
export const money = { type: Number, required: true, validate: (n: number) => Number.isSafeInteger(n) && n > 0 };
export const colors = ['emerald', 'blue', 'amber', 'violet', 'rose'];
const auditSchema = new Schema({ id: Schema.Types.ObjectId, actorId: String, actorName: String, action: String, at: Date, before: Schema.Types.Mixed, after: Schema.Types.Mixed }, { _id: false });
export const auditField = { type: [auditSchema], default: [], select: false };
// Shared by expenses and settlements: idempotent creation, edit/soft-delete tracking and audit history.
export const creationFields = {
  auditEvents: auditField,
  groupId: { ...ref('Group'), immutable: true },
  createdBy: { ...ref('User'), immutable: true },
  requestKey: { type: String, required: true, immutable: true, select: false },
  requestHash: { type: String, required: true, immutable: true, select: false },
  creationResponse: { type: Schema.Types.Mixed, required: true, immutable: true, select: false },
  updatedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  deletedAt: { type: Date, default: null },
  deletedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
};
export function indexCreationRecords(schema: Schema) {
  schema.index({ groupId: 1 });
  schema.index({ groupId: 1, createdAt: -1, _id: -1 });
  schema.index({ groupId: 1, createdBy: 1, requestKey: 1 }, { unique: true });
}
