import type { RequestHandler, Response } from 'express';
import { Group, type GroupRecord } from '../models';
import { ApiError } from '../utils/errors';
import { id } from '../validators';

export function context(res: Response): { userId: string; group: GroupRecord } {
  return res.locals as { userId: string; group: GroupRecord };
}
export const requireMembership: RequestHandler = async (req, res, next) => {
  const groupId = id.parse(req.params.id);
  const group = await Group.findById(groupId).lean();
  if (!group) throw new ApiError(404, 'NOT_FOUND', 'Group not found');
  if (!group.members.some(m => String(m) === res.locals.userId)) throw new ApiError(403, 'FORBIDDEN', 'You are not a member of this group');
  res.locals.group = group;
  next();
};
export function requireCreator(res: Response) {
  const { userId, group } = context(res);
  if (String(group.createdBy) !== userId) throw new ApiError(403, 'FORBIDDEN', 'Only the group creator can perform this action');
}
