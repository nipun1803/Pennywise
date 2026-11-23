import type { RequestHandler } from 'express';
import { Types } from 'mongoose';
import { Group, User } from '../models';
import { groupSchema, groupUpdateSchema, joinSchema, searchSchema } from '../validators';
import { context, requireCreator } from '../middleware/membership';
import { groupView } from '../utils/serialize';
import { pagination, pageView } from '../utils/pagination';
import { ApiError } from '../utils/errors';
import * as groupService from '../services/groups';
import { auditedUpdate } from '../services/audit';
import { balancesFor, paymentsFor } from '../services/ledger';
import { notifyMemberJoined } from '../services/notifications';

export const create: RequestHandler = async (req, res) => {
  const { name, ...details } = groupSchema.parse(req.body);
  res.status(201).json({ data: groupView(await groupService.createGroup(name, res.locals.userId, details)) });
};
export const list: RequestHandler = async (req, res) => {
  const { page, limit, skip } = pagination(req.query);
  const filter = { members: res.locals.userId };
  const [groups, total] = await Promise.all([Group.find(filter).sort({ createdAt: -1, _id: -1 }).skip(skip).limit(limit).lean(), Group.countDocuments(filter)]);
  res.json({ data: groups.map(groupView), pagination: pageView(page, limit, total) });
};
export const join: RequestHandler = async (req, res) => {
  const { code } = joinSchema.parse(req.body);
  let alreadyMember = true;
  let group;
  try {
    group = await auditedUpdate(Group, { joinCode: code }, res.locals.userId, 'member.joined', before => {
      alreadyMember = before.members.some(member => String(member) === res.locals.userId);
      if (alreadyMember) return null;
      return { updates: { members: [...before.members, new Types.ObjectId(res.locals.userId)] }, before: null, after: { memberId: res.locals.userId } };
    });
  } catch (error) { if (error instanceof ApiError && error.status === 404) throw new ApiError(404, 'NOT_FOUND', 'Group not found'); throw error; }
  if (!alreadyMember) notifyMemberJoined(group, res.locals.userId);
  res.json({ data: groupView(group), alreadyMember });
};
export const detail: RequestHandler = (_req, res) => { res.json({ data: groupView(context(res).group) }); };
export const rename: RequestHandler = async (req, res) => {
  requireCreator(res);
  const input = groupUpdateSchema.parse(req.body);
  const updated = await auditedUpdate(Group, { _id: context(res).group._id }, res.locals.userId, 'group.updated', before => ({ updates: input,
    before: { name: before.name, description: before.description ?? '', icon: before.icon ?? 'people', color: before.color ?? 'emerald', image: before.image ?? null },
    after: { name: input.name ?? before.name, description: input.description ?? before.description ?? '', icon: input.icon ?? before.icon ?? 'people', color: input.color ?? before.color ?? 'emerald', image: input.image === undefined ? before.image ?? null : input.image } }));
  if (!updated) throw new ApiError(404, 'NOT_FOUND', 'Group not found');
  res.json({ data: groupView(updated) });
};
export const rotate: RequestHandler = async (_req, res) => {
  requireCreator(res);
  res.json({ data: { joinCode: await groupService.rotateCode(String(context(res).group._id), res.locals.userId) } });
};
export const members: RequestHandler = async (req, res) => {
  const { page, limit, skip } = pagination(req.query);
  const search = searchSchema.parse(req.query.search);
  const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const filter = { _id: { $in: context(res).group.members }, ...(search ? { name: { $regex: escaped, $options: 'i' } } : {}) };
  const [users, total] = await Promise.all([User.find(filter).sort({ name: 1, _id: 1 }).skip(skip).limit(limit).lean(), User.countDocuments(filter)]);
  res.json({ data: users.map(u => ({ id: String(u._id), name: u.name, image: u.image ?? null })), pagination: pageView(page, limit, total) });
};
export const balances: RequestHandler = async (_req, res) => {
  const group = context(res).group;
  const balances = await balancesFor(group);
  const users = await User.find({ _id: { $in: balances.map(b => b.userId) } }).lean();
  const profiles = new Map(users.map(u => [String(u._id), u]));
  res.json({ data: balances.map(b => ({ ...b, name: profiles.get(b.userId)?.name, image: profiles.get(b.userId)?.image ?? null })) });
};
export const settleUp: RequestHandler = async (_req, res) => { res.json({ data: await paymentsFor(context(res).group) }); };
