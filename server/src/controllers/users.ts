import type { RequestHandler } from 'express';
import { User } from '../models';
import { profileSchema } from '../validators';
import { userView } from '../utils/serialize';
import { ApiError } from '../utils/errors';

export const me: RequestHandler = async (_req, res) => {
  const user = await User.findById(res.locals.userId).lean();
  if (!user) throw new ApiError(401, 'UNAUTHENTICATED', 'Account not found');
  res.json({ data: userView(user) });
};
export const updateName: RequestHandler = async (req, res) => {
  const input = profileSchema.parse(req.body);
  const user = await User.findByIdAndUpdate(res.locals.userId, { $set: input }, { returnDocument: 'after', runValidators: true });
  if (!user) throw new ApiError(401, 'UNAUTHENTICATED', 'Account not found');
  res.json({ data: userView(user) });
};
