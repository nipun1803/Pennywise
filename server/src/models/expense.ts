import { Schema, model, type Types } from 'mongoose';
import { creationFields, indexCreationRecords, money, ref, type CreationRecord } from './shared';

export interface ExpenseRecord extends CreationRecord {
  description: string; amountCents: number; paidBy: Types.ObjectId;
  splits: { userId: Types.ObjectId; shareCents: number }[];
  category?: { id: string; name: string; icon: string; color: string } | null;
}

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
indexCreationRecords(expenseSchema);

export const Expense = model<ExpenseRecord>('Expense', expenseSchema);
