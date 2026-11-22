import type { RequestHandler } from 'express';
import { z } from 'zod';
import { Group, Expense, Settlement, User } from '../models';
import { computeBalances } from '../shared/money';
import { groupView } from '../utils/serialize';
import { ApiError } from '../utils/errors';
import { pagination, pageView } from '../utils/pagination';

function safe(n: bigint) { if (n > BigInt(Number.MAX_SAFE_INTEGER) || n < BigInt(Number.MIN_SAFE_INTEGER)) throw new ApiError(422, 'BALANCE_OVERFLOW', 'Totals exceed safe integer cents'); return Number(n); }
export const summary: RequestHandler = async (_req, res) => {
  const groups = await Group.find({ members: res.locals.userId }).sort({ createdAt: -1, _id: -1 }).lean();
  const ids = groups.map(g => g._id);
  const [expenses, payments] = await Promise.all([Expense.find({ groupId: { $in: ids }, deletedAt: null }).lean(), Settlement.find({ groupId: { $in: ids }, deletedAt: null }).lean()]);
  // Membership only grows in this MVP. Reload it after both ledger reads so an
  // expense by a member who joined after the group read is not a non-member.
  const members = new Map((await Group.find({ _id: { $in: ids } }).select('members').lean()).map(g => [String(g._id), g.members]));
  const summaries: Record<string, { expenseCount: number; spendingCents: number; balanceCents: number }> = {};
  for (const group of groups) {
    const es = expenses.filter(e => String(e.groupId) === String(group._id)); const ps = payments.filter(p => String(p.groupId) === String(group._id));
    try {
      const balances = computeBalances((members.get(String(group._id)) ?? group.members).map(String), es.map(e => ({ amountCents: e.amountCents, paidBy: String(e.paidBy), splits: e.splits.map(s => ({ userId: String(s.userId), shareCents: s.shareCents })) })), ps.map(p => ({ fromUser: String(p.fromUser), toUser: String(p.toUser), amountCents: p.amountCents })));
      summaries[String(group._id)] = { expenseCount: es.length, spendingCents: safe(es.reduce((sum, e) => sum + BigInt(e.amountCents), 0n)), balanceCents: balances.find(b => b.userId === res.locals.userId)?.balanceCents ?? 0 };
    } catch (error) { if (error instanceof RangeError) throw new ApiError(422, 'BALANCE_OVERFLOW', 'Totals exceed safe integer cents'); throw error; }
  }
  const entries = Object.values(summaries);
  const totals = { spendingCents: safe(entries.reduce((sum, g) => sum + BigInt(g.spendingCents), 0n)), balanceCents: safe(entries.reduce((sum, g) => sum + BigInt(g.balanceCents), 0n)), expenseCount: entries.reduce((sum, g) => sum + g.expenseCount, 0) };
  res.json({ data: { groups: groups.map(groupView), summaries, totals } });
};

export const activity: RequestHandler = async (req, res) => {
  const { page, limit, skip } = pagination(req.query);
  const kind = z.enum(['all', 'expenses', 'payments']).default('all').parse(req.query.kind);
  const groups = await Group.find({ members: res.locals.userId }).lean(); const ids = groups.map(g => g._id);
  const pipeline = (field: string) => [{ $match: { [field]: { $in: ids } } }, { $unwind: '$auditEvents' }, { $project: { entry: '$auditEvents', groupId: field === '_id' ? '$_id' : '$groupId' } }];
  const [result] = await Group.aggregate([...pipeline('_id'), { $unionWith: { coll: Expense.collection.name, pipeline: pipeline('groupId') } }, { $unionWith: { coll: Settlement.collection.name, pipeline: pipeline('groupId') } },
    { $match: { 'entry.action': { $regex: kind === 'all' ? '^(expense|payment)\\.' : kind === 'expenses' ? '^expense\\.' : '^payment\\.' } } },
    { $sort: { 'entry.at': -1, 'entry.id': -1 } }, { $facet: { entries: [{ $skip: skip }, { $limit: limit }], count: [{ $count: 'total' }] } }]);
  const users = await User.find({ _id: { $in: groups.flatMap(g => g.members) } }).lean(); const names = new Map(users.map(u => [String(u._id), u.name]));
  const groupMap = new Map(groups.map(g => [String(g._id), groupView(g)]));
  res.json({ data: result.entries.map(({ entry, groupId }: { entry: Record<string, any>; groupId: unknown }) => {
    const data = entry.after ?? entry.before ?? {};
    return { ...entry, id: String(entry.id), at: entry.at.toISOString(), group: groupMap.get(String(groupId)), fromName: names.get(data.fromUser), toName: names.get(data.toUser) };
  }), pagination: pageView(page, limit, result.count[0]?.total ?? 0) });
};
