import { Types } from 'mongoose';
import { Expense, Settlement, Group, type ExpenseRecord, type GroupRecord, type SettlementRecord } from '../models';
import { equalSplit, computeBalances, simplifyDebts } from '../shared/money';
import type { ExpenseInput } from '../validators';
import { ApiError } from '../utils/errors';
import { expenseView, settlementView } from '../utils/serialize';
import { createOnce, fingerprint } from './idempotency';

export function checkMembers(group: GroupRecord, ids: readonly string[]) {
  const members = new Set(group.members.map(String));
  if (ids.some(id => !members.has(id))) throw new ApiError(400, 'INVALID_MEMBERS', 'Payer and all payment/split users must be group members');
}
function expenseFields(group: GroupRecord, input: ExpenseInput, existing?: ExpenseRecord) {
  const ids = input.splitMode === 'all' ? group.members.map(String)
    : input.splitMode === 'selected' ? input.splitUserIds!
    : existing!.splits.map(s => String(s.userId));
  checkMembers(group, [input.paidBy, ...ids]);
  return { description: input.description, amountCents: input.amountCents, paidBy: new Types.ObjectId(input.paidBy),
    splits: equalSplit(input.amountCents, ids).map(s => ({ userId: new Types.ObjectId(s.userId), shareCents: s.shareCents })) };
}
export async function createExpense(group: GroupRecord, userId: string, key: string, input: ExpenseInput) {
  const hash = fingerprint({ ...input, ...(input.splitUserIds ? { splitUserIds: [...input.splitUserIds].sort() } : {}) });
  return createOnce('expense', { groupId: String(group._id), userId, key, hash }, async () => {
    const now = new Date();
    const record = new Expense({ ...expenseFields(group, input), _id: new Types.ObjectId(), groupId: group._id,
      createdBy: userId, createdAt: now, updatedAt: now, requestKey: key, requestHash: hash });
    const response = { data: expenseView(record) };
    record.creationResponse = response;
    await record.save({ timestamps: false });
    return response;
  });
}
export async function getExpense(groupId: string, expenseId: string, includeDeleted = false) {
  const expense = await Expense.findOne({ _id: expenseId, groupId, ...(includeDeleted ? {} : { deletedAt: null }) }).lean();
  if (!expense) throw new ApiError(404, 'NOT_FOUND', 'Expense not found');
  return expense;
}
export function checkExpensePermission(group: GroupRecord, userId: string, expense: ExpenseRecord) {
  if (String(expense.createdBy) !== userId && String(group.createdBy) !== userId) throw new ApiError(403, 'FORBIDDEN', 'Only the expense author or group creator can change this expense');
}
export async function editExpense(group: GroupRecord, userId: string, expenseId: string, input: ExpenseInput) {
  const existing = await getExpense(String(group._id), expenseId);
  checkExpensePermission(group, userId, existing);
  const updated = await Expense.findOneAndUpdate({ _id: expenseId, groupId: group._id, deletedAt: null },
    { $set: { ...expenseFields(group, input, existing), updatedBy: userId } }, { returnDocument: 'after', runValidators: true });
  if (!updated) throw new ApiError(404, 'NOT_FOUND', 'Expense not found');
  return expenseView(updated);
}
export async function deleteExpense(group: GroupRecord, userId: string, expenseId: string) {
  const expense = await getExpense(String(group._id), expenseId, true);
  checkExpensePermission(group, userId, expense);
  await Expense.updateOne({ _id: expenseId, groupId: group._id, deletedAt: null }, { $set: { deletedAt: new Date(), deletedBy: userId, updatedBy: userId } });
}
export async function createSettlement(group: GroupRecord, userId: string, key: string, input: { fromUser: string; toUser: string; amountCents: number }) {
  return createOnce('settlement', { groupId: String(group._id), userId, key, hash: fingerprint(input) }, async () => {
    checkMembers(group, [input.fromUser, input.toUser]);
    const now = new Date();
    const record = new Settlement({ ...input, _id: new Types.ObjectId(), groupId: group._id, createdBy: userId,
      createdAt: now, updatedAt: now, requestKey: key, requestHash: fingerprint(input) });
    const response = { data: settlementView(record) };
    record.creationResponse = response;
    await record.save({ timestamps: false });
    return response;
  });
}
export async function editSettlement(group: GroupRecord, userId: string, settlementId: string, input: { fromUser: string; toUser: string; amountCents: number }) {
  checkMembers(group, [input.fromUser, input.toUser]);
  const updated = await Settlement.findOneAndUpdate({ _id: settlementId, groupId: group._id, deletedAt: null },
    { $set: { ...input, updatedBy: userId } }, { returnDocument: 'after', runValidators: true });
  if (!updated) throw new ApiError(404, 'NOT_FOUND', 'Settlement not found');
  return settlementView(updated);
}
export async function deleteSettlement(group: GroupRecord, userId: string, settlementId: string) {
  const existing = await Settlement.findOne({ _id: settlementId, groupId: group._id }).lean();
  if (!existing) throw new ApiError(404, 'NOT_FOUND', 'Settlement not found');
  await Settlement.updateOne({ _id: settlementId, groupId: group._id, deletedAt: null }, { $set: { deletedAt: new Date(), deletedBy: userId, updatedBy: userId } });
}
export async function balancesFor(group: GroupRecord) {
  const [expenses, settlements] = await Promise.all([
    Expense.find({ groupId: group._id, deletedAt: null }).lean(),
    Settlement.find({ groupId: group._id, deletedAt: null }).lean(),
  ]);
  // Membership only grows in this MVP. Reload after both ledger reads so an
  // expense recorded by a newly joined member cannot reference a stale member
  // list captured earlier by the authorization middleware.
  const currentGroup = await Group.findById(group._id).lean();
  if (!currentGroup) throw new ApiError(404, 'NOT_FOUND', 'Group not found');
  try {
    return computeBalances(currentGroup.members.map(String), expenses.map(e => ({ paidBy: String(e.paidBy), amountCents: e.amountCents,
      splits: e.splits.map(s => ({ userId: String(s.userId), shareCents: s.shareCents })) })),
    settlements.map((s: SettlementRecord) => ({ fromUser: String(s.fromUser), toUser: String(s.toUser), amountCents: s.amountCents })));
  } catch (error) {
    if (error instanceof RangeError) throw new ApiError(422, 'BALANCE_OVERFLOW', 'A balance exceeds safe integer cents');
    throw error;
  }
}
export async function paymentsFor(group: GroupRecord) { return simplifyDebts(await balancesFor(group)); }
