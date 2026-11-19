import { Schema, model, type Types } from 'mongoose';

export interface UserRecord {
  _id: Types.ObjectId; name: string; email: string; passwordHash: string; createdAt: Date;
}
export interface GroupRecord {
  _id: Types.ObjectId; name: string; joinCode: string; createdBy: Types.ObjectId;
  members: Types.ObjectId[]; createdAt: Date;
}
export interface CreationRecord {
  _id: Types.ObjectId; groupId: Types.ObjectId; createdBy: Types.ObjectId;
  requestKey: string; requestHash: string; creationResponse: Record<string, unknown>;
  createdAt: Date; updatedAt: Date; updatedBy: Types.ObjectId | null;
  deletedAt: Date | null; deletedBy: Types.ObjectId | null;
}
export interface ExpenseRecord extends CreationRecord {
  description: string; amountCents: number; paidBy: Types.ObjectId;
  splits: { userId: Types.ObjectId; shareCents: number }[];
}
export interface SettlementRecord extends CreationRecord {
  fromUser: Types.ObjectId; toUser: Types.ObjectId; amountCents: number;
}

const ref = (name: string) => ({ type: Schema.Types.ObjectId, ref: name, required: true });
const money = { type: Number, required: true, validate: (n: number) => Number.isSafeInteger(n) && n > 0 };
const creationFields = {
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
  name: { type: String, required: true, trim: true, minlength: 1, maxlength: 80 },
  email: { type: String, required: true, lowercase: true, trim: true, unique: true },
  passwordHash: { type: String, required: true, select: false },
}, { timestamps: { createdAt: true, updatedAt: false } });
const groupSchema = new Schema<GroupRecord>({
  name: { type: String, required: true, trim: true, minlength: 1, maxlength: 80 },
  joinCode: { type: String, required: true, unique: true },
  createdBy: { ...ref('User'), immutable: true },
  members: [ref('User')],
}, { timestamps: { createdAt: true, updatedAt: false } });
groupSchema.index({ members: 1 });
const expenseSchema = new Schema<ExpenseRecord>({
  ...creationFields,
  description: { type: String, required: true, trim: true, maxlength: 200 },
  amountCents: money,
  paidBy: ref('User'),
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
export async function ensureIndexes() {
  await Promise.all([User.init(), Group.init(), Expense.init(), Settlement.init()]);
}
