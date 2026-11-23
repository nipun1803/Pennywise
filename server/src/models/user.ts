import { Schema, model, type Types } from 'mongoose';
import { colors } from './shared';

export const NOTIFICATION_KINDS = ['expenses', 'payments', 'members'] as const;
export type NotificationKind = typeof NOTIFICATION_KINDS[number];
export interface UserRecord {
  _id: Types.ObjectId; name: string; email: string; passwordHash: string; createdAt: Date;
  avatar?: string; avatarColor?: string; image?: string | null;
  pushTokens?: string[]; notifications?: Partial<Record<NotificationKind, boolean>>;
}

const userSchema = new Schema<UserRecord>({
  image: { type: String, default: null },
  name: { type: String, required: true, trim: true, minlength: 1, maxlength: 80 },
  email: { type: String, required: true, lowercase: true, trim: true, unique: true },
  passwordHash: { type: String, required: true, select: false },
  avatar: { type: String, enum: ['initials', 'leaf', 'sun', 'sparkles', 'coffee'], default: 'initials' },
  avatarColor: { type: String, enum: colors, default: 'emerald' },
  // Expo push tokens, one per signed-in device. Never serialized to clients.
  pushTokens: { type: [String], default: [], select: false },
  notifications: Object.fromEntries(NOTIFICATION_KINDS.map(kind => [kind, { type: Boolean, default: true }])),
}, { timestamps: { createdAt: true, updatedAt: false } });
userSchema.index({ pushTokens: 1 });

export const User = model<UserRecord>('User', userSchema);
