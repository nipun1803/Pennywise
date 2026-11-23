import { Schema, model, type Types } from 'mongoose';
import { auditField, colors, ref, type AuditEvent } from './shared';

export interface CategoryRecord {
  _id: Types.ObjectId; groupId: Types.ObjectId; name: string; key: string; icon: string; color: string;
  createdBy: Types.ObjectId; createdAt: Date; archivedAt: Date | null;
  auditEvents?: AuditEvent[];
}

const categorySchema = new Schema<CategoryRecord>({
  auditEvents: auditField,
  groupId: ref('Group'), name: { type: String, required: true, trim: true, maxlength: 80 }, key: { type: String, required: true },
  icon: { type: String, enum: ['food', 'cart', 'bus', 'home', 'bulb', 'bag', 'game', 'airplane', 'heart', 'grid'], default: 'grid' },
  color: { type: String, enum: colors, default: 'emerald' },
  createdBy: ref('User'), archivedAt: { type: Date, default: null },
}, { timestamps: { createdAt: true, updatedAt: false } });
categorySchema.index({ groupId: 1, key: 1 }, { unique: true });

export const Category = model<CategoryRecord>('Category', categorySchema);
