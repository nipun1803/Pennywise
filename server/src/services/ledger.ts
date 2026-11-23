import { Types } from 'mongoose';
import { Expense, Settlement, Group, type ExpenseRecord, type GroupRecord, type SettlementRecord } from '../models';
import { equalSplit, computeBalances, simplifyDebts } from '../shared/money';
import type { ExpenseInput } from '../validators';
import { ApiError } from '../utils/errors';
import { expenseView, settlementView } from '../utils/serialize';
import { createOnce, fingerprint } from './idempotency';
import { expenseCategory } from './categories';
import { auditedUpdate, auditEvent } from './audit';
import { notifyExpense, notifyPayment } from './notifications';

export function checkMembers(group: GroupRecord, ids: readonly string[]) {
  const members = new Set(group.members.map(String));
  if (ids.some(id => !members.has(id))) throw new ApiError(400, 'INVALID_MEMBERS', 'Payer and all payment/split users must be group members');
}
async function expenseFields(group: GroupRecord, input: ExpenseInput, existing?: ExpenseRecord) {
  if (input.excludedUserIds) checkMembers(group, input.excludedUserIds);
  const ids = input.splitMode === 'all' ? group.members.map(String)
    : input.splitMode === 'allExcept' ? group.members.map(String).filter(id => !input.excludedUserIds!.includes(id))
    : input.splitMode === 'selected' ? input.splitUserIds!
    : input.splitMode === 'custom' ? input.customSplits!.map(s => s.userId)
    : existing!.splits.map(s => String(s.userId));
  checkMembers(group, [input.paidBy, ...ids]);
  if (!ids.length) throw new ApiError(400, 'INVALID_MEMBERS', 'Include at least one participant');
  return { description: input.description, amountCents: input.amountCents, paidBy: new Types.ObjectId(input.paidBy),
    category: await expenseCategory(group, input.categoryId, existing?.category),
    splits: (input.splitMode === 'custom' ? input.customSplits! : equalSplit(input.amountCents, ids)).map(s => ({ userId: new Types.ObjectId(s.userId), shareCents: s.shareCents })) };
}
export async function createExpense(group: GroupRecord, userId: string, key: string, input: ExpenseInput) {
  const hash = fingerprint({ ...input, ...(input.customSplits ? { customSplits: [...input.customSplits].sort((a, b) => a.userId.localeCompare(b.userId)) } : {}), ...(input.splitUserIds ? { splitUserIds: [...input.splitUserIds].sort() } : {}), ...(input.excludedUserIds ? { excludedUserIds: [...input.excludedUserIds].sort() } : {}) });
  return createOnce('expense', { groupId: String(group._id), userId, key, hash }, async () => {
    const now = new Date();
    const record = new Expense({ ...await expenseFields(group, input), _id: new Types.ObjectId(), groupId: group._id,
      createdBy: userId, createdAt: now, updatedAt: now, requestKey: key, requestHash: hash });
    const response = { data: expenseView(record) };
    record.auditEvents = [await auditEvent(userId, 'expense.created', null, response.data)];
    record.creationResponse = response;
    await record.save({ timestamps: false });
    notifyExpense('created', group, userId, response.data);
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
  const updated = await auditedUpdate(Expense, { _id: expenseId, groupId: group._id, deletedAt: null }, userId, 'expense.updated', async before => {
    checkExpensePermission(group, userId, before);
    const fields = await expenseFields(group, input, before);
    return { updates: { ...fields, updatedBy: userId }, before: expenseView(before), after: expenseView({ ...before, ...fields }) };
  });
  if (!updated) throw new ApiError(404, 'NOT_FOUND', 'Expense not found');
  const view = expenseView(updated);
  notifyExpense('updated', group, userId, view, expenseView(existing));
  return view;
}
export async function deleteExpense(group: GroupRecord, userId: string, expenseId: string) {
  const expense = await getExpense(String(group._id), expenseId, true);
  checkExpensePermission(group, userId, expense);
  await auditedUpdate(Expense, { _id: expenseId, groupId: group._id }, userId, 'expense.deleted', before => {
    checkExpensePermission(group, userId, before);
    return before.deletedAt ? null : { updates: { deletedAt: new Date(), deletedBy: userId, updatedBy: userId }, before: expenseView(before), after: null };
  });
  if (!expense.deletedAt) notifyExpense('deleted', group, userId, expenseView(expense));
}
export async function createSettlement(group: GroupRecord, userId: string, key: string, input: { fromUser: string; toUser: string; amountCents: number }) {
  return createOnce('settlement', { groupId: String(group._id), userId, key, hash: fingerprint(input) }, async () => {
    checkMembers(group, [input.fromUser, input.toUser]);
    const now = new Date();
    const record = new Settlement({ ...input, _id: new Types.ObjectId(), groupId: group._id, createdBy: userId,
      createdAt: now, updatedAt: now, requestKey: key, requestHash: fingerprint(input) });
    const response = { data: settlementView(record) };
    record.auditEvents = [await auditEvent(userId, 'payment.created', null, response.data)];
    record.creationResponse = response;
    await record.save({ timestamps: false });
    notifyPayment('created', group, userId, response.data);
    return response;
  });
}
export async function editSettlement(group: GroupRecord, userId: string, settlementId: string, input: { fromUser: string; toUser: string; amountCents: number }) {
  checkMembers(group, [input.fromUser, input.toUser]);
  let previous: ReturnType<typeof settlementView> | undefined;
  const updated = await auditedUpdate(Settlement, { _id: settlementId, groupId: group._id, deletedAt: null }, userId, 'payment.updated', before => {
    previous = settlementView(before);
    return { updates: { ...input, updatedBy: userId }, before: previous, after: { ...previous, ...input } };
  });
  if (!updated) throw new ApiError(404, 'NOT_FOUND', 'Settlement not found');
  const view = settlementView(updated);
  notifyPayment('updated', group, userId, view, previous);
  return view;
}
export async function deleteSettlement(group: GroupRecord, userId: string, settlementId: string) {
  const existing = await Settlement.findOne({ _id: settlementId, groupId: group._id }).lean();
  if (!existing) throw new ApiError(404, 'NOT_FOUND', 'Settlement not found');
  await auditedUpdate(Settlement, { _id: settlementId, groupId: group._id }, userId, 'payment.deleted', before => before.deletedAt ? null : { updates: { deletedAt: new Date(), deletedBy: userId, updatedBy: userId }, before: settlementView(before), after: null });
  if (!existing.deletedAt) notifyPayment('deleted', group, userId, settlementView(existing));
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
