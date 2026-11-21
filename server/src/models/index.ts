import { Schema, model, type Types } from 'mongoose';

export interface UserRecord {
  _id: Types.ObjectId; name: string; email: string; passwordHash: string; createdAt: Date;
  avatar?: string; avatarColor?: string; image?: string | null;
}
export interface GroupRecord {
  _id: Types.ObjectId; name: string; joinCode: string; createdBy: Types.ObjectId;
  members: Types.ObjectId[]; createdAt: Date;
  description?: string; icon?: string; color?: string; image?: string | null;
  auditEvents?: AuditEvent[];
}
export interface AuditEvent { id: Types.ObjectId; actorId: string; actorName: string; action: string; at: Date; before: Record<string, unknown> | null; after: Record<string, unknown> | null }
export interface CreationRecord {
  _id: Types.ObjectId; groupId: Types.ObjectId; createdBy: Types.ObjectId;
  requestKey: string; requestHash: string; creationResponse: Record<string, unknown>;
  createdAt: Date; updatedAt: Date; updatedBy: Types.ObjectId | null;
  deletedAt: Date | null; deletedBy: Types.ObjectId | null;
  auditEvents?: AuditEvent[];
}
export interface ExpenseRecord extends CreationRecord {
  description: string; amountCents: number; paidBy: Types.ObjectId;
  splits: { userId: Types.ObjectId; shareCents: number }[];
  category?: { id: string; name: string; icon: string; color: string } | null;
}
export interface CategoryRecord {
  _id: Types.ObjectId; groupId: Types.ObjectId; name: string; key: string; icon: string; color: string;
  createdBy: Types.ObjectId; createdAt: Date; archivedAt: Date | null;
  auditEvents?: AuditEvent[];
}
export interface SettlementRecord extends CreationRecord {
  fromUser: Types.ObjectId; toUser: Types.ObjectId; amountCents: number;
}

const ref = (name: string) => ({ type: Schema.Types.ObjectId, ref: name, required: true });
const money = { type: Number, required: true, validate: (n: number) => Number.isSafeInteger(n) && n > 0 };
const auditSchema = new Schema({ id: Schema.Types.ObjectId, actorId: String, actorName: String, action: String, at: Date, before: Schema.Types.Mixed, after: Schema.Types.Mixed }, { _id: false });
const auditField = { type: [auditSchema], default: [], select: false };
const creationFields = {
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
const userSchema = new Schema<UserRecord>({
  image: { type: String, default: null },
  name: { type: String, required: true, trim: true, minlength: 1, maxlength: 80 },
  email: { type: String, required: true, lowercase: true, trim: true, unique: true },
  passwordHash: { type: String, required: true, select: false },
  avatar: { type: String, enum: ['initials', 'leaf', 'sun', 'sparkles', 'coffee'], default: 'initials' },
  avatarColor: { type: String, enum: ['emerald', 'blue', 'amber', 'violet', 'rose'], default: 'emerald' },
}, { timestamps: { createdAt: true, updatedAt: false } });
const groupSchema = new Schema<GroupRecord>({
  image: { type: String, default: null },
  auditEvents: auditField,
  name: { type: String, required: true, trim: true, minlength: 1, maxlength: 80 },
  joinCode: { type: String, required: true, unique: true },
  createdBy: { ...ref('User'), immutable: true },
  members: [ref('User')],
  description: { type: String, trim: true, maxlength: 200, default: '' },
  icon: { type: String, enum: ['people', 'airplane', 'home', 'restaurant', 'briefcase', 'heart'], default: 'people' },
  color: { type: String, enum: ['emerald', 'blue', 'amber', 'violet', 'rose'], default: 'emerald' },
}, { timestamps: { createdAt: true, updatedAt: false } });
groupSchema.index({ members: 1 });
const expenseSchema = new Schema<ExpenseRecord>({
  ...creationFields,
  description: { type: String, required: true, trim: true, maxlength: 200 },
  amountCents: money,
  paidBy: ref('User'),
  category: { type: new Schema({ id: String, name: String, icon: String, color: String }, { _id: false }), default: null },
  splits: [new Schema({
    userId: ref('User'),
    shareCents: { type: Number, required: true, validate: (n: number) => Number.isSafeInteger(n) && n >= 0 },
  }, { _id: false })],
}, { timestamps: true });
expenseSchema.pre('validate', function () {
  if (!Number.isSafeInteger(this.amountCents) || this.splits.some(s => !Number.isSafeInteger(s.shareCents))) return;
  const sum = this.splits.reduce((total, s) => total + BigInt(s.shareCents), 0n);
  if (sum !== BigInt(this.amountCents)) this.invalidate('splits', 'Shares must sum to amountCents');
});
const settlementSchema = new Schema<SettlementRecord>({
  ...creationFields, fromUser: ref('User'), toUser: ref('User'), amountCents: money,
}, { timestamps: true });
for (const schema of [expenseSchema, settlementSchema]) {
  schema.index({ groupId: 1 });
  schema.index({ groupId: 1, createdAt: -1, _id: -1 });
  schema.index({ groupId: 1, createdBy: 1, requestKey: 1 }, { unique: true });
}

export const User = model<UserRecord>('User', userSchema);
export const Group = model<GroupRecord>('Group', groupSchema);
export const Expense = model<ExpenseRecord>('Expense', expenseSchema);
export const Settlement = model<SettlementRecord>('Settlement', settlementSchema);
const categorySchema = new Schema<CategoryRecord>({
  auditEvents: auditField,
  groupId: ref('Group'), name: { type: String, required: true, trim: true, maxlength: 80 }, key: { type: String, required: true },
  icon: { type: String, enum: ['food', 'cart', 'bus', 'home', 'bulb', 'bag', 'game', 'airplane', 'heart', 'grid'], default: 'grid' },
  color: { type: String, enum: ['emerald', 'blue', 'amber', 'violet', 'rose'], default: 'emerald' },
  createdBy: ref('User'), archivedAt: { type: Date, default: null },
}, { timestamps: { createdAt: true, updatedAt: false } });
categorySchema.index({ groupId: 1, key: 1 }, { unique: true });
export const Category = model<CategoryRecord>('Category', categorySchema);
export async function ensureIndexes() {
  await Promise.all([User.init(), Group.init(), Expense.init(), Settlement.init(), Category.init()]);
}
