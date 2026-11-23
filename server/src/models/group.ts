import { Schema, model, type Types } from 'mongoose';
import { auditField, colors, ref, type AuditEvent } from './shared';

export interface GroupRecord {
  _id: Types.ObjectId; name: string; joinCode: string; createdBy: Types.ObjectId;
  members: Types.ObjectId[]; createdAt: Date;
  description?: string; icon?: string; color?: string; image?: string | null;
  auditEvents?: AuditEvent[];
}

const groupSchema = new Schema<GroupRecord>({
  image: { type: String, default: null },
  auditEvents: auditField,
  name: { type: String, required: true, trim: true, minlength: 1, maxlength: 80 },
  joinCode: { type: String, required: true, unique: true },
  createdBy: { ...ref('User'), immutable: true },
  members: [ref('User')],
  description: { type: String, trim: true, maxlength: 200, default: '' },
  icon: { type: String, enum: ['people', 'airplane', 'home', 'restaurant', 'briefcase', 'heart'], default: 'people' },
  color: { type: String, enum: colors, default: 'emerald' },
}, { timestamps: { createdAt: true, updatedAt: false } });
groupSchema.index({ members: 1 });

export const Group = model<GroupRecord>('Group', groupSchema);
