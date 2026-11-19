import type { RequestHandler } from 'express';
import { Group, User } from '../models';
import { nameSchema, joinSchema, searchSchema } from '../validators';
import { context, requireCreator } from '../middleware/membership';
import { groupView } from '../utils/serialize';
import { pagination, pageView } from '../utils/pagination';
import { ApiError } from '../utils/errors';
import * as groupService from '../services/groups';
import { balancesFor, paymentsFor } from '../services/ledger';

export const create: RequestHandler = async (req, res) => {
  const { name } = nameSchema.parse(req.body);
  res.status(201).json({ data: groupView(await groupService.createGroup(name, res.locals.userId)) });
};
export const list: RequestHandler = async (req, res) => {
  const { page, limit, skip } = pagination(req.query);
  const filter = { members: res.locals.userId };
  const [groups, total] = await Promise.all([Group.find(filter).sort({ createdAt: -1, _id: -1 }).skip(skip).limit(limit).lean(), Group.countDocuments(filter)]);
  res.json({ data: groups.map(groupView), pagination: pageView(page, limit, total) });
};
export const join: RequestHandler = async (req, res) => {
  const { code } = joinSchema.parse(req.body);
  const group = await Group.findOneAndUpdate({ joinCode: code }, { $addToSet: { members: res.locals.userId } }, { returnDocument: 'after' });
  if (!group) throw new ApiError(404, 'NOT_FOUND', 'Group not found');
  res.json({ data: groupView(group) });
};
export const detail: RequestHandler = (_req, res) => { res.json({ data: groupView(context(res).group) }); };
export const rename: RequestHandler = async (req, res) => {
  requireCreator(res);
  const input = nameSchema.parse(req.body);
  const updated = await Group.findByIdAndUpdate(context(res).group._id, { $set: input }, { returnDocument: 'after', runValidators: true });
  if (!updated) throw new ApiError(404, 'NOT_FOUND', 'Group not found');
  res.json({ data: groupView(updated) });
};
export const rotate: RequestHandler = async (_req, res) => {
  requireCreator(res);
  res.json({ data: { joinCode: await groupService.rotateCode(String(context(res).group._id)) } });
};
export const members: RequestHandler = async (req, res) => {
  const { page, limit, skip } = pagination(req.query);
  const search = searchSchema.parse(req.query.search);
  const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const filter = { _id: { $in: context(res).group.members }, ...(search ? { name: { $regex: escaped, $options: 'i' } } : {}) };
  const [users, total] = await Promise.all([User.find(filter).sort({ name: 1, _id: 1 }).skip(skip).limit(limit).lean(), User.countDocuments(filter)]);
  res.json({ data: users.map(u => ({ id: String(u._id), name: u.name })), pagination: pageView(page, limit, total) });
};
export const balances: RequestHandler = async (_req, res) => {
  const group = context(res).group;
  const balances = await balancesFor(group);
  const users = await User.find({ _id: { $in: balances.map(b => b.userId) } }).lean();
  const names = new Map(users.map(u => [String(u._id), u.name]));
  res.json({ data: balances.map(b => ({ ...b, name: names.get(b.userId) })) });
};
export const settleUp: RequestHandler = async (_req, res) => { res.json({ data: await paymentsFor(context(res).group) }); };
