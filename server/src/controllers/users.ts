import type { RequestHandler } from 'express';
import { User } from '../models';
import { notificationsSchema, profileSchema, pushTokenSchema } from '../validators';
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
export const updateNotifications: RequestHandler = async (req, res) => {
  const input = notificationsSchema.parse(req.body);
  const changes = Object.fromEntries(Object.entries(input).map(([kind, enabled]) => [`notifications.${kind}`, enabled]));
  const user = await User.findByIdAndUpdate(res.locals.userId, { $set: changes }, { returnDocument: 'after', runValidators: true });
  if (!user) throw new ApiError(401, 'UNAUTHENTICATED', 'Account not found');
  res.json({ data: userView(user) });
};
// A device belongs to whoever signed in last, so the token leaves any other
// account first. Otherwise a shared phone would keep alerting the previous user.
export const registerPushToken: RequestHandler = async (req, res) => {
  const { token } = pushTokenSchema.parse(req.body);
  await User.updateMany({ pushTokens: token, _id: { $ne: res.locals.userId } }, { $pull: { pushTokens: token } });
  await User.updateOne({ _id: res.locals.userId }, { $pull: { pushTokens: token } });
  await User.updateOne({ _id: res.locals.userId }, { $push: { pushTokens: { $each: [token], $slice: -10 } } });
  res.sendStatus(204);
};
export const removePushToken: RequestHandler = async (req, res) => {
  const { token } = pushTokenSchema.parse(req.body);
  await User.updateOne({ _id: res.locals.userId }, { $pull: { pushTokens: token } });
  res.sendStatus(204);
};
