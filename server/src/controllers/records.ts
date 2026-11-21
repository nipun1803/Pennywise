import type { RequestHandler } from 'express';
import { Types, type PipelineStage } from 'mongoose';
import { z } from 'zod';
import { Group, Expense, Settlement, Category } from '../models';
import { context } from '../middleware/membership';
import { id } from '../validators';
import { pagination, pageView } from '../utils/pagination';
import { ApiError } from '../utils/errors';
import { checkMembers } from '../services/ledger';
export const activity: RequestHandler = async (req, res) => {
  const { page, limit, skip } = pagination(req.query); const kind = z.enum(['all', 'expenses', 'payments', 'group', 'categories']).default('all').parse(req.query.kind);
  const groupId = context(res).group._id;
  const events = [{ $unwind: '$auditEvents' }, { $replaceRoot: { newRoot: '$auditEvents' } }];
  const pipeline: PipelineStage[] = [{ $match: { _id: groupId } }, ...events,
    ...[Expense, Settlement, Category].map(model => ({ $unionWith: { coll: model.collection.name, pipeline: [{ $match: { groupId } }, ...events] } }))] as PipelineStage[];
  if (kind !== 'all') pipeline.push({ $match: { action: { $regex: kind === 'group' ? '^(group|member)\\.' : `^${kind === 'expenses' ? 'expense' : kind === 'payments' ? 'payment' : 'category'}\\.` } } });
  pipeline.push({ $sort: { at: -1, id: -1 } }, { $facet: { entries: [{ $skip: skip }, { $limit: limit }], count: [{ $count: 'total' }] } });
  const [result] = await Group.aggregate(pipeline);
  res.json({ data: result.entries.map((entry: { id: Types.ObjectId; at: Date }) => ({ ...entry, id: String(entry.id), at: entry.at.toISOString() })), pagination: pageView(page, limit, result.count[0]?.total ?? 0) });
};
function safe(value: bigint) { if (value > BigInt(Number.MAX_SAFE_INTEGER) || value < BigInt(Number.MIN_SAFE_INTEGER)) throw new ApiError(422, 'BALANCE_OVERFLOW', 'Statement exceeds safe integer hundredths'); return Number(value); }
export const statement: RequestHandler = async (req, res) => {
  const { page, limit, skip } = pagination(req.query); const { group, userId } = context(res); const view = z.enum(['member', 'spending']).default('member').parse(req.query.view);
  const member = req.query.userId === undefined ? userId : id.parse(req.query.userId); checkMembers(group, [member]);
  const [expenses, settlements] = await Promise.all([Expense.find({ groupId: group._id, deletedAt: null }).lean(), Settlement.find({ groupId: group._id, deletedAt: null }).lean()]);
  const rows: { id: string; type: string; createdAt: string; description: string; amountCents: number; deltaCents: number; balanceCents: number; paidCents: number; shareCents: number; sentCents: number; receivedCents: number; category: string | null }[] = [];
  for (const expense of expenses) {
    const share = expense.splits.find(split => String(split.userId) === member); const paid = String(expense.paidBy) === member ? expense.amountCents : 0;
    if (view === 'member' && !share && !paid) continue;
    rows.push({ id: String(expense._id), type: 'expense', createdAt: expense.createdAt.toISOString(), description: expense.description, amountCents: expense.amountCents, deltaCents: view === 'spending' ? expense.amountCents : safe(BigInt(paid) - BigInt(share?.shareCents ?? 0)), balanceCents: 0, paidCents: paid, shareCents: share?.shareCents ?? 0, sentCents: 0, receivedCents: 0, category: expense.category?.name ?? null });
  }
  if (view === 'member') for (const payment of settlements) {
    const sent = String(payment.fromUser) === member ? payment.amountCents : 0; const received = String(payment.toUser) === member ? payment.amountCents : 0;
    if (!sent && !received) continue;
    rows.push({ id: String(payment._id), type: 'payment', createdAt: payment.createdAt.toISOString(), description: sent ? 'Payment sent' : 'Payment received', amountCents: payment.amountCents, deltaCents: sent - received, balanceCents: 0, paidCents: 0, shareCents: 0, sentCents: sent, receivedCents: received, category: null });
  }
  rows.sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
  let running = 0n; for (const row of rows) { running += BigInt(row.deltaCents); row.balanceCents = safe(running); }
  const selected = rows.slice(skip, skip + limit); const opening = skip ? rows[Math.min(skip, rows.length) - 1]?.balanceCents ?? 0 : 0;
  res.json({ data: { view, userId: member, rows: selected, openingBalanceCents: opening, closingBalanceCents: selected.at(-1)?.balanceCents ?? opening, overallBalanceCents: safe(running), generatedAt: new Date().toISOString() }, pagination: pageView(page, limit, rows.length) });
};
