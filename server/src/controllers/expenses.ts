import type { RequestHandler } from 'express';
import { Expense } from '../models';
import { context } from '../middleware/membership';
import { id, parseExpense, requestKeySchema } from '../validators';
import { pagination, pageView } from '../utils/pagination';
import { expenseView } from '../utils/serialize';
import * as ledger from '../services/ledger';

export const create: RequestHandler = async (req, res) => {
  const { group, userId } = context(res);
  const key = requestKeySchema.parse(req.get('Idempotency-Key'));
  res.status(201).json(await ledger.createExpense(group, userId, key, parseExpense(req.body)));
};
export const list: RequestHandler = async (req, res) => {
  const { page, limit, skip } = pagination(req.query);
  const filter = { groupId: context(res).group._id, deletedAt: null };
  const [expenses, total] = await Promise.all([Expense.find(filter).sort({ createdAt: -1, _id: -1 }).skip(skip).limit(limit).lean(), Expense.countDocuments(filter)]);
  res.json({ data: expenses.map(expenseView), pagination: pageView(page, limit, total) });
};
export const detail: RequestHandler = async (req, res) => {
  res.json({ data: expenseView(await ledger.getExpense(String(context(res).group._id), id.parse(req.params.eid))) });
};
export const edit: RequestHandler = async (req, res) => {
  const { group, userId } = context(res);
  res.json({ data: await ledger.editExpense(group, userId, id.parse(req.params.eid), parseExpense(req.body, true)) });
};
export const remove: RequestHandler = async (req, res) => {
  const { group, userId } = context(res);
  await ledger.deleteExpense(group, userId, id.parse(req.params.eid));
  res.sendStatus(204);
};
